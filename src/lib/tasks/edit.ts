import { runFal } from "../providers/fal";
import { generateImage, type GeminiImage } from "../providers/gemini";
import { imageSize, persistUrl } from "../image";
import type { Task } from "../types";
import { ASPECT_OPTIONS, KEEP_REST, image, num, optionalImage, parallel, records, roleImages, sizeField, str } from "./common";
import type { Fabric } from "./library";

const changeTexture: Task = {
  id: "image.change_texture",
  category: "edit",
  title: "Change the fabric",
  description: "Swap the fabric, print and colour of one garment for your fabric, keeping the person, pose and scene.",
  providers: ["gemini"],
  fields: [
    { type: "image", key: "image", label: "Image", required: true },
    { type: "image", key: "fabric", label: "Fabric or print photo", hint: "Or pick a library fabric below." },
    { type: "record", key: "libraryFabric", label: "Library fabric", source: "fabric.create" },
    { type: "text", key: "target", label: "Which garment?", placeholder: "e.g. the jacket, the skirt, the shirt collar" },
    {
      type: "select",
      key: "colour",
      label: "Colour",
      options: [
        { value: "fabric", label: "Use the fabric's colour" },
        { value: "garment", label: "Keep the garment's colour" },
      ],
      default: "fabric",
    },
    sizeField,
  ],
  async run(v, ctx) {
    const [lib] = records<Fabric>(v, "libraryFabric");
    const photo = optionalImage(v, "fabric");
    const fabric: GeminiImage | null = photo
      ? { src: photo, caption: "the new fabric swatch." }
      : lib
        ? { src: lib.colourways.at(-1)!.swatch, caption: `the new fabric: ${lib.title} (${lib.type}, ${lib.weight}).` }
        : null;
    if (!fabric) throw new Error("Upload a fabric photo or pick a library fabric.");
    const target = str(v, "target") || "the main garment";
    const colour =
      str(v, "colour") === "garment"
        ? "Keep the garment's current colour; take only the texture, weave and print scale from the fabric."
        : "Use the fabric's own colours.";
    ctx.progress("Applying the fabric…");
    const out = await generateImage(
      ctx.settings,
      `Change the material of ${target} in image 1 to the fabric shown in image 2. ${colour} The fabric must follow the garment's folds, seams, drape and lighting naturally, with print scale appropriate to the garment. Do not change the garment's cut or construction. ${KEEP_REST}`,
      [{ src: image(v, "image"), caption: "the photo to edit." }, fabric],
      { aspectRatio: "auto", imageSize: str(v, "imageSize"), signal: ctx.signal },
    );
    return [{ kind: "image", src: out, label: "New fabric" }];
  },
};

const editDetail: Task = {
  id: "image.edit_detail",
  category: "edit",
  title: "Change one detail",
  description: "Change the one thing you name — a button, the collar, the lipstick, an earring — and leave the rest untouched.",
  providers: ["gemini"],
  fields: [
    { type: "image", key: "image", label: "Image", required: true },
    { type: "textarea", key: "instruction", label: "What should change?", required: true, placeholder: "e.g. replace the buttons with gold metal buttons" },
    { type: "image", key: "reference", label: "Reference", hint: "Optional, e.g. a photo of the button to use." },
    sizeField,
  ],
  async run(v, ctx) {
    const instruction = str(v, "instruction");
    if (!instruction) throw new Error("Say what should change.");
    const images: GeminiImage[] = [{ src: image(v, "image"), caption: "the photo to edit." }];
    const ref = optionalImage(v, "reference");
    if (ref) images.push({ src: ref, caption: "a reference for the change." });
    ctx.progress("Editing…");
    const out = await generateImage(
      ctx.settings,
      `Make exactly this one change to image 1: ${instruction}${ref ? " (use image 2 as the reference for it)" : ""}. ${KEEP_REST}`,
      images,
      { aspectRatio: "auto", imageSize: str(v, "imageSize"), signal: ctx.signal },
    );
    return [{ kind: "image", src: out, label: "Edited" }];
  },
};

const expand: Task = {
  id: "image.expand",
  category: "edit",
  title: "Expand the image",
  description: "Grow the frame outward and fill the new space with more of the same scene (outpainting).",
  providers: ["fal"],
  fields: [
    { type: "image", key: "image", label: "Image", required: true },
    {
      type: "select",
      key: "target",
      label: "Target",
      options: [...ASPECT_OPTIONS.filter((o) => o.value !== "auto"), { value: "custom", label: "Pixels per side" }],
      default: "4:5",
    },
    { type: "number", key: "top", label: "Top (px)", min: 0, max: 2000, step: 16, default: 0 },
    { type: "number", key: "bottom", label: "Bottom (px)", min: 0, max: 2000, step: 16, default: 0 },
    { type: "number", key: "left", label: "Left (px)", min: 0, max: 2000, step: 16, default: 0 },
    { type: "number", key: "right", label: "Right (px)", min: 0, max: 2000, step: 16, default: 0 },
    { type: "text", key: "prompt", label: "What goes in the new space?", placeholder: "Optional" },
  ],
  async run(v, ctx) {
    const src = image(v, "image");
    const { width, height } = await imageSize(src);
    let canvas: [number, number];
    let location: [number, number];
    if (str(v, "target") === "custom") {
      const [t, b, l, r] = ["top", "bottom", "left", "right"].map((k) => Math.max(0, num(v, k)));
      if (!t && !b && !l && !r) throw new Error("Enter pixels for at least one side.");
      canvas = [width + l + r, height + t + b];
      location = [l, t];
    } else {
      const [rw, rh] = str(v, "target").split(":").map(Number);
      // Smallest canvas of the target ratio that contains the image, image centred.
      const cw = Math.max(width, Math.round((height * rw) / rh));
      const ch = Math.max(height, Math.round((width * rh) / rw));
      if (cw === width && ch === height) throw new Error("The image already has this ratio.");
      canvas = [cw, ch];
      location = [Math.round((cw - width) / 2), Math.round((ch - height) / 2)];
    }
    if (canvas[0] * canvas[1] > 5000 * 5000) throw new Error("The result would be too large (max area 5000×5000).");
    ctx.progress("Expanding…");
    const out = await runFal<{ image: { url: string } }>(
      ctx.settings,
      "fal-ai/bria/expand",
      {
        image_url: src,
        canvas_size: canvas,
        original_image_size: [width, height],
        original_image_location: location,
        prompt: str(v, "prompt"),
      },
      ctx,
    );
    return [{ kind: "image", src: await persistUrl(out.image.url), label: `Expanded ${canvas[0]}×${canvas[1]}` }];
  },
};

const SKETCH_STYLES: Record<string, string> = {
  flat: "a technical flat drawing (fashion CAD flat): front view, perfectly symmetrical, clean uniform black outlines, stitch lines shown as dashed lines, no model, no shading, on pure white",
  illustration: "a fashion illustration on a figure with expressive lines and light marker rendering, on white paper",
  pencil: "a loose pencil design sketch on white paper, like a designer's sketchbook page",
};

const toSketch: Task = {
  id: "image.to_sketch",
  category: "edit",
  title: "Turn into a sketch",
  description: "Turn a garment image into a technical flat, a fashion illustration or a pencil sketch.",
  providers: ["gemini"],
  fields: [
    { type: "image", key: "image", label: "Image", required: true },
    {
      type: "select",
      key: "style",
      label: "Style",
      options: [
        { value: "flat", label: "Technical flat" },
        { value: "illustration", label: "Fashion illustration" },
        { value: "pencil", label: "Pencil sketch" },
      ],
      default: "flat",
    },
    { type: "toggle", key: "colour", label: "In colour", default: false },
    sizeField,
  ],
  async run(v, ctx) {
    ctx.progress("Drawing…");
    const out = await generateImage(
      ctx.settings,
      `Redraw the main garment in this image as ${SKETCH_STYLES[str(v, "style")]}. ${v.colour ? "Fill it with the garment's real colours and print, flat colour only." : "Black line art only, no colour."} Keep every construction detail accurate: seams, darts, pockets, closures, collar, cuffs, topstitching and proportions. No text, no labels.`,
      [{ src: image(v, "image"), caption: "the garment." }],
      { aspectRatio: "auto", imageSize: str(v, "imageSize"), signal: ctx.signal },
    );
    return [{ kind: "image", src: out, label: "Sketch" }];
  },
};

const VIEWS = [
  { key: "back", label: "Back", text: "the back view (rotated 180°)" },
  { key: "left", label: "Left", text: "the left side view (rotated 90°)" },
  { key: "right", label: "Right", text: "the right side view (rotated 90° the other way)" },
];

const rotateViews: Task = {
  id: "image.rotate_views",
  category: "edit",
  title: "Show other views",
  description: "Generate the back, left and right views of a product or model, in the same style and setting.",
  providers: ["gemini"],
  fields: [
    { type: "image", key: "image", label: "Front view", required: true },
    { type: "checkboxes", key: "views", label: "Views", options: VIEWS.map((x) => ({ value: x.key, label: x.label })), default: ["back", "left", "right"] },
    sizeField,
  ],
  async run(v, ctx) {
    const src = image(v, "image");
    const wanted = VIEWS.filter((x) => (v.views as string[] | undefined)?.includes(x.key));
    if (!wanted.length) throw new Error("Pick at least one view.");
    const results = await parallel(
      wanted.map((view) => () =>
        generateImage(
          ctx.settings,
          `Show the same subject as in the image from ${view.text}. Same medium and style (photo stays photo, drawing stays drawing), same background, lighting and framing. Infer the unseen side logically from the garment's construction: seams, closures and back details consistent with the front. No text.`,
          [{ src, caption: "the front view." }],
          { aspectRatio: "auto", imageSize: str(v, "imageSize"), signal: ctx.signal },
        ),
      ),
      ctx,
    );
    return results.map((s, i) => ({ kind: "image", src: s, label: wanted[i].label }));
  },
};

const polish: Task = {
  id: "image.polish",
  category: "edit",
  title: "Polish light & colour",
  description: "Correct the light, white balance and colour of shoot images like a retoucher; the content stays the same.",
  providers: ["gemini"],
  fields: [
    { type: "images", key: "images", label: "Images", max: 8, min: 1, required: true },
    { type: "text", key: "look", label: "Target look", placeholder: "e.g. warm, bright, high-contrast editorial" },
    sizeField,
  ],
  async run(v, ctx) {
    const imgs = roleImages(v, "images");
    if (!imgs.length) throw new Error("Upload at least one image.");
    const look = str(v, "look") || "clean, natural, high-end e-commerce";
    const results = await parallel(
      imgs.map((img) => () =>
        generateImage(
          ctx.settings,
          `Retouch this photo like a professional fashion retoucher: correct white balance and exposure, recover highlights and shadows, even out the lighting and make the garment colours accurate and rich. Target look: ${look}. Do not change any content, shape, face, pose or framing.`,
          [{ src: img.image, caption: "the photo to retouch." }],
          { aspectRatio: "auto", imageSize: str(v, "imageSize"), signal: ctx.signal },
        ),
      ),
      ctx,
    );
    return results.map((s, i) => ({ kind: "image", src: s, label: `Polished ${i + 1}` }));
  },
};

const upscale: Task = {
  id: "image.upscale",
  category: "edit",
  title: "Upscale to 4K",
  description: "Enlarge an image for print and zoom, sharpening its detail.",
  providers: ["fal"],
  fields: [
    { type: "image", key: "image", label: "Image", required: true },
    {
      type: "select",
      key: "target",
      label: "Target",
      options: [
        { value: "3840", label: "4K (3840 px long edge)" },
        { value: "x2", label: "2×" },
        { value: "x4", label: "4×" },
      ],
      default: "3840",
    },
    { type: "number", key: "creativity", label: "Creativity", min: 0, max: 10, default: 0, hint: "0 stays faithful; higher lets the model invent detail." },
  ],
  async run(v, ctx) {
    const src = image(v, "image");
    const target = str(v, "target");
    let scale: number;
    if (target === "3840") {
      const { width, height } = await imageSize(src);
      scale = 3840 / Math.max(width, height);
      if (scale <= 1) return [{ kind: "image", src, label: "Already 4K" }];
    } else {
      scale = Number(target.slice(1));
    }
    ctx.progress("Upscaling…");
    const out = await runFal<{ images: (string | { url: string })[] }>(
      ctx.settings,
      ctx.settings.upscaleModel,
      { image_url: src, scale_factor: Math.round(scale * 100) / 100, creativity: num(v, "creativity"), output_format: "png" },
      ctx,
    );
    const first = out.images[0];
    return [{ kind: "image", src: await persistUrl(typeof first === "string" ? first : first.url), label: "Upscaled" }];
  },
};

const video: Task = {
  id: "video.generate",
  category: "edit",
  title: "Image to video",
  description: "Turn a still into a short video with the motion you describe — for social and product pages.",
  providers: ["fal"],
  fields: [
    { type: "image", key: "image", label: "Start frame", required: true },
    { type: "textarea", key: "prompt", label: "Motion", required: true, placeholder: "e.g. the model walks toward the camera, the dress hem sways in the breeze" },
    {
      type: "select",
      key: "duration",
      label: "Length",
      options: [
        { value: "5", label: "5 s" },
        { value: "10", label: "10 s" },
      ],
      default: "5",
    },
    { type: "toggle", key: "audio", label: "Generate sound", default: false },
  ],
  async run(v, ctx) {
    const prompt = str(v, "prompt");
    if (!prompt) throw new Error("Describe the motion.");
    ctx.progress("Queued (this can take a few minutes)…");
    const out = await runFal<{ video: { url: string } }>(
      ctx.settings,
      ctx.settings.videoModel,
      {
        start_image_url: image(v, "image"),
        prompt: `${prompt}. Keep the garments, their fabric, colour and details exactly as in the image; smooth, realistic motion.`,
        duration: str(v, "duration"),
        generate_audio: Boolean(v.audio),
      },
      ctx,
    );
    return [{ kind: "video", src: out.video.url, label: "Video" }];
  },
};

export const editTasks = [changeTexture, editDetail, expand, toSketch, rotateViews, polish, upscale, video];
