import { runFal } from "../providers/fal";
import { generateImage, type GeminiImage } from "../providers/gemini";
import { persistUrl } from "../image";
import type { Field, Task, Values } from "../types";
import {
  BACKGROUND_OPTIONS,
  KEEP_REST,
  MODEL_FIELDS,
  POSE_OPTIONS,
  aspectField,
  image,
  list,
  optionalImage,
  parallel,
  records,
  roleImages,
  sizeField,
  str,
} from "./common";
import type { Asset } from "./library";

const GARMENT_ROLES = [
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
  { value: "dress", label: "Dress / jumpsuit" },
  { value: "outerwear", label: "Outerwear" },
  { value: "shoes", label: "Shoes" },
  { value: "accessory", label: "Accessory" },
];

function modelDescription(v: Values) {
  const look = str(v, "modelLook");
  return `a ${str(v, "bodyType")} ${str(v, "modelGender")} model${look ? ` (${look})` : ""}`;
}

const backgroundFields: Field[] = [
  { type: "select", key: "background", label: "Background", options: BACKGROUND_OPTIONS, default: BACKGROUND_OPTIONS[0].value },
  { type: "text", key: "customBackground", label: "Custom background", placeholder: "Overrides the choice above" },
  { type: "record", key: "libraryBackground", label: "Library background", source: "background.create", hint: "Overrides both of the above." },
];

/** The setting sentence and, for a library background, its plate image. */
function backgroundOf(v: Values): { scene: string; image?: GeminiImage } {
  const [bg] = records<Asset>(v, "libraryBackground");
  if (bg) return { scene: `the location in the background image (${bg.description})`, image: { src: bg.image, caption: "the background location to place the shot in." } };
  return { scene: str(v, "customBackground") || str(v, "background") };
}

/** Selected preset poses plus library poses, each as a prompt line and an optional reference. */
function posesOf(v: Values, custom?: string): { label: string; text: string; image?: GeminiImage }[] {
  const poses: { label: string; text: string; image?: GeminiImage }[] = list(v, "poses").map((p) => ({
    label: POSE_OPTIONS.find((o) => o.value === p)?.label ?? p,
    text: p,
  }));
  for (const pose of records<Asset>(v, "libraryPoses")) {
    poses.push({ label: pose.title, text: `exactly the pose in the pose reference image: ${pose.description}`, image: { src: pose.image, caption: "the pose reference: copy only the body pose, not the person or clothes." } });
  }
  if (custom) poses.push({ label: "Custom pose", text: custom });
  return poses;
}

const photoshootModel: Task = {
  id: "photoshoot.model",
  category: "photoshoot",
  title: "On-model photoshoot",
  description: "Dress an AI model in your product photos: one shot per pose, on the background you choose.",
  providers: ["gemini"],
  fields: [
    { type: "images", key: "garments", label: "Product photos", max: 4, min: 1, required: true, roles: GARMENT_ROLES, hint: "On a hanger, flat lay or ghost shots all work." },
    ...MODEL_FIELDS,
    { type: "image", key: "face", label: "Face reference", hint: "Optional: keep the same model across every shot." },
    { type: "checkboxes", key: "poses", label: "Poses", options: POSE_OPTIONS, default: [POSE_OPTIONS[0].value, POSE_OPTIONS[2].value] },
    { type: "record", key: "libraryPoses", label: "Library poses", source: "pose.create", multiple: true },
    ...backgroundFields,
    aspectField("3:4"),
    sizeField,
  ],
  async run(v, ctx) {
    const garments = roleImages(v, "garments");
    if (!garments.length) throw new Error("Upload at least one product photo.");
    const poses = posesOf(v);
    if (!poses.length) throw new Error("Pick at least one pose.");

    const images: GeminiImage[] = garments.map((g) => ({
      src: g.image,
      caption: `the ${g.role || "garment"} to dress the model in. Reproduce it exactly: cut, fabric, colour, print, logos, buttons, stitching and every detail.`,
    }));
    const face = optionalImage(v, "face");
    if (face) images.push({ src: face, caption: "the model's face and hair: the model in the result is this person." });
    const bg = backgroundOf(v);
    if (bg.image) images.push(bg.image);

    const base = `Professional fashion e-commerce photoshoot. Dress ${modelDescription(v)} in the garments shown, styled together as one outfit${garments.length === 1 ? " with simple neutral complementary pieces where needed" : ""}.
Setting: ${bg.scene}.
Full-length shot, the garments fully visible and true to the product photos, natural fabric drape and fit, realistic skin and hands, professional lighting. No text, no watermark.`;

    const results = await parallel(
      poses.map((pose) => () =>
        generateImage(ctx.settings, `${base}\nPose: ${pose.text}.`, pose.image ? [...images, pose.image] : images, {
          aspectRatio: str(v, "aspectRatio"),
          imageSize: str(v, "imageSize"),
          signal: ctx.signal,
        }),
      ),
      ctx,
    );
    return results.map((src, i) => ({ kind: "image", src, label: poses[i]?.label ?? `Shot ${i + 1}` }));
  },
};

const GHOST_VIEWS = [
  { value: "ghost mannequin (invisible mannequin) front view, showing the 3D shape of the garment with the inside back neck visible", label: "Ghost — front" },
  { value: "ghost mannequin (invisible mannequin) back view", label: "Ghost — back" },
  { value: "flat lay, top-down, garment neatly laid out and symmetrical", label: "Flat lay" },
  { value: "close-up detail shot of the fabric texture and the most distinctive construction detail", label: "Detail close-up" },
];

const photoshootGhost: Task = {
  id: "photoshoot.ghost",
  category: "photoshoot",
  title: "Ghost mannequin & flat lay",
  description: "Product shots with nobody in them: invisible mannequin, flat lay and detail close-ups.",
  providers: ["gemini"],
  fields: [
    { type: "image", key: "image", label: "Product photo", required: true, hint: "Worn, on a mannequin or on a hanger." },
    { type: "checkboxes", key: "views", label: "Shots", options: GHOST_VIEWS, default: [GHOST_VIEWS[0].value, GHOST_VIEWS[2].value] },
    {
      type: "select",
      key: "background",
      label: "Background",
      options: [
        { value: "pure white (#FFFFFF)", label: "Pure white" },
        { value: "light grey (#F2F2F2)", label: "Light grey" },
        { value: "warm off-white (#F5F1EA)", label: "Warm off-white" },
      ],
      default: "pure white (#FFFFFF)",
    },
    aspectField("4:5"),
    sizeField,
  ],
  async run(v, ctx) {
    const src = image(v, "image");
    const views = list(v, "views");
    if (!views.length) throw new Error("Pick at least one shot.");
    const results = await parallel(
      views.map((view) => () =>
        generateImage(
          ctx.settings,
          `Product photograph of exactly the garment in the image, with no person in it: ${view}. Plain ${str(v, "background")} background, soft even studio light, subtle natural shadow. The garment must stay identical: same cut, colour, fabric, print, logos, trims and details. No hanger, no mannequin visible, no text.`,
          [{ src, caption: "the product." }],
          { aspectRatio: str(v, "aspectRatio"), imageSize: str(v, "imageSize"), signal: ctx.signal },
        ),
      ),
      ctx,
    );
    return results.map((s, i) => ({ kind: "image", src: s, label: GHOST_VIEWS.find((g) => g.value === views[i])?.label }));
  },
};

const photoshootMannequin: Task = {
  id: "photoshoot.mannequin",
  category: "photoshoot",
  title: "Mannequin to model",
  description: "Put the clothes from mannequin or worn photos on an AI model, keeping each photo's pose and framing.",
  providers: ["gemini"],
  fields: [
    { type: "images", key: "images", label: "Mannequin photos", max: 6, min: 1, required: true },
    ...MODEL_FIELDS,
    { type: "toggle", key: "keepBackground", label: "Keep the original background", default: true },
    ...backgroundFields,
    sizeField,
  ],
  async run(v, ctx) {
    const photos = roleImages(v, "images");
    if (!photos.length) throw new Error("Upload at least one photo.");
    const bg = backgroundOf(v);
    const setting = v.keepBackground ? "Keep the original background." : `Place the scene in: ${bg.scene}.`;
    const results = await parallel(
      photos.map((p) => () =>
        generateImage(
          ctx.settings,
          `Replace the mannequin or person in this photo with ${modelDescription(v)}, a real person, keeping exactly the same pose, framing and camera angle. The clothes stay identical: same garments, fit, fabric, colour, print and details. ${setting} Realistic skin, hair and hands, professional fashion photography. No text.`,
          [{ src: p.image, caption: "the photo to convert." }, ...(!v.keepBackground && bg.image ? [bg.image] : [])],
          { aspectRatio: "auto", imageSize: str(v, "imageSize"), signal: ctx.signal },
        ),
      ),
      ctx,
    );
    return results.map((src, i) => ({ kind: "image", src, label: `Model ${i + 1}` }));
  },
};

const changeBackground: Task = {
  id: "image.change_background",
  category: "photoshoot",
  title: "Change the background",
  description: "Keep everything in front exactly as it is and swap the background — or cut it out to a transparent PNG.",
  providers: ["gemini", "fal"],
  fields: [
    { type: "image", key: "image", label: "Image", required: true },
    {
      type: "select",
      key: "mode",
      label: "New background",
      options: [
        { value: "preset", label: "Preset scene" },
        { value: "custom", label: "Scene I describe" },
        { value: "reference", label: "Reference photo" },
        { value: "library", label: "Library background" },
        { value: "transparent", label: "Transparent PNG (fal.ai)" },
      ],
      default: "preset",
    },
    ...backgroundFields,
    { type: "image", key: "backgroundImage", label: "Background photo", hint: "For the “Reference photo” mode." },
    sizeField,
  ],
  async run(v, ctx) {
    const src = image(v, "image");
    const mode = str(v, "mode");
    if (mode === "transparent") {
      ctx.progress("Removing the background…");
      const out = await runFal<{ image: { url: string } }>(
        ctx.settings,
        "fal-ai/birefnet/v2",
        { image_url: src, model: "General Use (Heavy)", operating_resolution: "2048x2048", output_format: "png" },
        ctx,
      );
      return [{ kind: "image", src: await persistUrl(out.image.url), label: "Transparent" }];
    }
    const images: GeminiImage[] = [{ src, caption: "the photo whose background changes." }];
    let scene = mode === "custom" ? str(v, "customBackground") : str(v, "background");
    if (mode === "reference") {
      const ref = optionalImage(v, "backgroundImage");
      if (!ref) throw new Error("Upload a background photo.");
      images.push({ src: ref, caption: "the new background / location." });
      scene = "the location shown in image 2";
    }
    if (mode === "library") {
      const bg = backgroundOf(v);
      if (!bg.image) throw new Error("Pick a library background.");
      images.push(bg.image);
      scene = bg.scene;
    }
    if (!scene) throw new Error("Describe the new scene.");
    ctx.progress("Changing the background…");
    const out = await generateImage(
      ctx.settings,
      `Replace only the background of image 1 with ${scene}. Keep the subject in front exactly as it is: same person, pose, garments, edges and proportions. Match the lighting direction, colour temperature, perspective and shadows so the subject sits naturally in the new scene. ${KEEP_REST}`,
      images,
      { aspectRatio: "auto", imageSize: str(v, "imageSize"), signal: ctx.signal },
    );
    return [{ kind: "image", src: out, label: "New background" }];
  },
};

const repose: Task = {
  id: "image.repose",
  category: "photoshoot",
  title: "Change the pose",
  description: "The same person in the same clothes, in new poses.",
  providers: ["gemini"],
  fields: [
    { type: "image", key: "image", label: "Image", required: true },
    { type: "checkboxes", key: "poses", label: "Poses", options: POSE_OPTIONS, default: [POSE_OPTIONS[1].value] },
    { type: "record", key: "libraryPoses", label: "Library poses", source: "pose.create", multiple: true },
    { type: "text", key: "customPose", label: "Custom pose", placeholder: "e.g. sitting on steps, holding the jacket lapel" },
    sizeField,
  ],
  async run(v, ctx) {
    const src = image(v, "image");
    const poses = posesOf(v, str(v, "customPose"));
    if (!poses.length) throw new Error("Pick or describe a pose.");
    const results = await parallel(
      poses.map((pose) => () =>
        generateImage(
          ctx.settings,
          `Show the same person from image 1 in a new pose: ${pose.text}. Same face, hair, body, makeup, the same garments with identical fit, fabric, colour and details, and the same background and lighting. Only the pose and, if needed, the framing change. Photorealistic, no text.`,
          [{ src, caption: "the person and outfit." }, ...(pose.image ? [pose.image] : [])],
          { aspectRatio: "auto", imageSize: str(v, "imageSize"), signal: ctx.signal },
        ),
      ),
      ctx,
    );
    return results.map((s, i) => ({ kind: "image", src: s, label: poses[i]?.label }));
  },
};

const faceFix: Task = {
  id: "image.face_fix",
  category: "photoshoot",
  title: "Fix the face",
  description: "Redo the face in a shoot image so it matches your model, leaving the pose, garment and background as they are.",
  providers: ["gemini"],
  fields: [
    { type: "image", key: "image", label: "Shoot image", required: true },
    { type: "image", key: "face", label: "Model's face", required: true, hint: "A clear, front-facing photo of the model." },
    { type: "text", key: "expression", label: "Expression", placeholder: "Optional, e.g. soft smile, neutral, confident" },
    sizeField,
  ],
  async run(v, ctx) {
    ctx.progress("Fixing the face…");
    const out = await generateImage(
      ctx.settings,
      `Redo only the face and hair in image 1 so the person is clearly the person in image 2: same facial features, skin tone and hair. Keep the head angle, lighting, ${str(v, "expression") ? `use the expression: ${str(v, "expression")}, ` : "keep the expression, "}and fix any distortion in eyes, teeth or skin. ${KEEP_REST}`,
      [
        { src: image(v, "image"), caption: "the shoot image to fix." },
        { src: image(v, "face"), caption: "the model's real face." },
      ],
      { aspectRatio: "auto", imageSize: str(v, "imageSize"), signal: ctx.signal },
    );
    return [{ kind: "image", src: out, label: "Face fixed" }];
  },
};

export const photoshootTasks = [photoshootModel, photoshootGhost, photoshootMannequin, changeBackground, repose, faceFix];
