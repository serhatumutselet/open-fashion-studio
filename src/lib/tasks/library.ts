import { updateRecord } from "../store";
import { analyze, generateImage } from "../providers/gemini";
import type { RecordData, Task } from "../types";
import { image, records, roleImages, str } from "./common";

export type Fabric = RecordData & {
  title: string;
  type: string;
  composition: string;
  weight: string;
  pattern: string;
  handfeel: string;
  uses: string[];
  /** The base swatch first, then each extra colourway. */
  colourways: { name: string; swatch: string }[];
};

export type BrandKit = RecordData & {
  title: string;
  aesthetic: string;
  signature: string[];
  silhouettes: string[];
  details: string[];
  avoid: string[];
  colours: { name: string; hex: string }[];
  looks: string[];
  fabrics: string[];
  prints: string[];
};

/** A pose or background saved to the library: one image plus what it shows. */
export type Asset = RecordData & { title: string; description: string; image: string; kind: "pose" | "background" };

const swatchPrompt = (colour?: string) =>
  `Render this fabric as a flat, front-on square swatch that fills the frame edge to edge: the exact weave, texture, surface, sheen and pattern scale of the photographed fabric, evenly lit, no folds, no shadows, no perspective, no edges, no text.${
    colour ? ` Recolour it to ${colour}, keeping the texture and any pattern structure identical.` : " Keep its original colour."
  }`;

const fabricCreate: Task = {
  id: "fabric.create",
  category: "library",
  title: "Add a fabric",
  description: "Turn photos of a fabric into a library fabric with a clean swatch, its facts, and any extra colourways you ask for.",
  providers: ["gemini"],
  fields: [
    { type: "text", key: "title", label: "Name", placeholder: "e.g. Washed linen 160 gsm" },
    { type: "images", key: "photos", label: "Fabric photos", max: 4, min: 1, required: true, hint: "Close-ups of the fabric, flat or draped." },
    { type: "text", key: "colours", label: "Extra colourways", placeholder: "e.g. sage green, navy, #C8553D" },
    { type: "textarea", key: "facts", label: "Known facts", placeholder: "e.g. 55% linen 45% viscose, 160 gsm, enzyme washed" },
  ],
  async run(v, ctx) {
    const photos = roleImages(v, "photos").map((p) => ({ src: p.image, caption: "a photo of the fabric." }));
    if (!photos.length) throw new Error("Upload at least one photo of the fabric.");
    const extra = str(v, "colours")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
      .slice(0, 8);

    ctx.progress("Reading the fabric…");
    const [facts, ...swatches] = await Promise.all([
      analyze<Omit<Fabric, "colourways" | "recordId">>(
        ctx.settings,
        `You are a textile technologist. Describe this fabric for a design library.${str(v, "facts") ? ` Known facts (these override your estimates): ${str(v, "facts")}.` : ""}${str(v, "title") ? ` Name it "${str(v, "title")}".` : ""}`,
        photos,
        {
          type: "OBJECT",
          properties: {
            title: { type: "STRING" },
            type: { type: "STRING", description: "e.g. plain-weave linen, single jersey, denim twill" },
            composition: { type: "STRING" },
            weight: { type: "STRING", description: "e.g. 160 gsm" },
            pattern: { type: "STRING", description: "solid, or the pattern" },
            handfeel: { type: "STRING" },
            uses: { type: "ARRAY", items: { type: "STRING" }, description: "Garments it suits" },
          },
          required: ["title", "type", "composition", "weight", "pattern", "handfeel", "uses"],
        },
        ctx.signal,
      ),
      ...[undefined, ...extra].map((colour) =>
        generateImage(ctx.settings, swatchPrompt(colour), photos, { aspectRatio: "1:1", imageSize: "1K", signal: ctx.signal }),
      ),
    ]);
    const fabric: Fabric = {
      ...facts,
      colourways: [{ name: "Original", swatch: swatches[0] }, ...extra.map((name, i) => ({ name, swatch: swatches[i + 1] }))],
    };
    return [{ kind: "data", view: "fabric", data: fabric, label: fabric.title }];
  },
};

const fabricAddColour: Task = {
  id: "fabric.add_colour",
  category: "library",
  title: "Add a colourway",
  description: "Render one more colour of a library fabric. The fabric in your library is updated.",
  providers: ["gemini"],
  fields: [
    { type: "record", key: "fabric", label: "Fabric", source: "fabric.create", required: true },
    { type: "text", key: "colour", label: "Colour", required: true, placeholder: "e.g. terracotta, Pantone 18-1438 TCX, #B4532A" },
  ],
  async run(v, ctx) {
    const [fabric] = records<Fabric>(v, "fabric");
    if (!fabric) throw new Error("Pick a fabric from your library.");
    const colour = str(v, "colour");
    if (!colour) throw new Error("Name the colour.");
    ctx.progress("Rendering the colourway…");
    const swatch = await generateImage(ctx.settings, swatchPrompt(colour), [{ src: fabric.colourways[0].swatch, caption: "the fabric swatch." }], {
      aspectRatio: "1:1",
      imageSize: "1K",
      signal: ctx.signal,
    });
    const updated: Fabric = { ...fabric, colourways: [...fabric.colourways, { name: colour, swatch }] };
    if (fabric.recordId) await updateRecord(fabric.recordId, updated);
    return [{ kind: "data", view: "fabric", data: updated, label: `${fabric.title} · ${colour}` }];
  },
};

const brandKitCreate: Task = {
  id: "brand_kit.create",
  category: "library",
  title: "Create a brand kit",
  description: "Capture your brand DNA from your colours, looks, fabrics and prints, so designs come out on-brand.",
  providers: ["gemini"],
  fields: [
    { type: "text", key: "title", label: "Brand name", required: true },
    { type: "images", key: "looks", label: "Looks / past collections", max: 12, min: 2, required: true },
    { type: "images", key: "fabrics", label: "Signature fabrics", max: 6 },
    { type: "images", key: "prints", label: "Signature prints", max: 6 },
    { type: "text", key: "colours", label: "Brand colours", placeholder: "e.g. #1D1A17 ink, #F6F2EC paper, #B4532A terracotta" },
    { type: "textarea", key: "about", label: "About the brand", placeholder: "e.g. contemporary womenswear, quiet luxury, 25–40, mid-premium price" },
  ],
  async run(v, ctx) {
    const looks = roleImages(v, "looks").map((r) => r.image);
    const fabrics = roleImages(v, "fabrics").map((r) => r.image);
    const prints = roleImages(v, "prints").map((r) => r.image);
    if (looks.length < 2) throw new Error("Upload at least 2 looks.");
    ctx.progress("Reading your brand…");
    const dna = await analyze<Omit<BrandKit, "looks" | "fabrics" | "prints" | "recordId">>(
      ctx.settings,
      `You are a creative director. From these images of the brand "${str(v, "title")}", write its design DNA so new designs stay on-brand.
${str(v, "about") ? `About the brand: ${str(v, "about")}` : ""}
${str(v, "colours") ? `Brand colours (use these exactly, add names): ${str(v, "colours")}` : "Derive 4-6 brand colours from the images."}
Be concrete: name silhouettes, details, finishes and what the brand never does.`,
      [...looks, ...fabrics, ...prints].map((src) => ({ src })),
      {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          aesthetic: { type: "STRING", description: "Two sentences" },
          signature: { type: "ARRAY", items: { type: "STRING" }, description: "Signature design codes" },
          silhouettes: { type: "ARRAY", items: { type: "STRING" } },
          details: { type: "ARRAY", items: { type: "STRING" } },
          avoid: { type: "ARRAY", items: { type: "STRING" }, description: "What the brand never does" },
          colours: {
            type: "ARRAY",
            items: { type: "OBJECT", properties: { name: { type: "STRING" }, hex: { type: "STRING" } }, required: ["name", "hex"] },
          },
        },
        required: ["title", "aesthetic", "signature", "silhouettes", "details", "avoid", "colours"],
      },
      ctx.signal,
    );
    const kit: BrandKit = { ...dna, title: str(v, "title") || dna.title, looks, fabrics, prints };
    return [{ kind: "data", view: "brandkit", data: kit, label: kit.title }];
  },
};

const poseCreate: Task = {
  id: "pose.create",
  category: "library",
  title: "Add a pose",
  description: "Save the pose from a photo of a person to your library, to shoot or re-pose models in.",
  providers: ["gemini"],
  fields: [
    { type: "text", key: "title", label: "Name", placeholder: "e.g. Hand in pocket, mid-step" },
    { type: "image", key: "image", label: "Photo of the pose", required: true },
  ],
  async run(v, ctx) {
    const src = image(v, "image");
    ctx.progress("Reading the pose…");
    const pose = await analyze<{ title: string; description: string }>(
      ctx.settings,
      `Describe only the body pose of the person so another model can copy it exactly: stance, weight distribution, head angle, arm and hand positions, leg positions, camera angle and framing. Do not describe the person or the clothes.${str(v, "title") ? ` Title: "${str(v, "title")}".` : " Give it a short title."}`,
      [{ src }],
      { type: "OBJECT", properties: { title: { type: "STRING" }, description: { type: "STRING" } }, required: ["title", "description"] },
      ctx.signal,
    );
    const asset: Asset = { ...pose, title: str(v, "title") || pose.title, image: src, kind: "pose" };
    return [{ kind: "data", view: "asset", data: asset, label: asset.title }];
  },
};

const backgroundCreate: Task = {
  id: "background.create",
  category: "library",
  title: "Add a background",
  description: "Turn a photo of a place or studio backdrop into an empty background plate in your library.",
  providers: ["gemini"],
  fields: [
    { type: "text", key: "title", label: "Name", placeholder: "e.g. Paris courtyard, morning" },
    { type: "image", key: "image", label: "Photo of the place", required: true },
  ],
  async run(v, ctx) {
    const src = image(v, "image");
    ctx.progress("Clearing the scene and reading the light…");
    const [plate, info] = await Promise.all([
      generateImage(
        ctx.settings,
        "Remove every person and any loose foreground object from this photo, leaving the empty location as a clean background plate. Rebuild what they covered naturally. Keep the place, light, colours, perspective and camera exactly the same.",
        [{ src, caption: "the location." }],
        { aspectRatio: "auto", imageSize: "2K", signal: ctx.signal },
      ),
      analyze<{ title: string; description: string }>(
        ctx.settings,
        `Describe this location as a photoshoot background: place, materials, light direction and quality, time of day, colour mood.${str(v, "title") ? ` Title: "${str(v, "title")}".` : " Give it a short title."}`,
        [{ src }],
        { type: "OBJECT", properties: { title: { type: "STRING" }, description: { type: "STRING" } }, required: ["title", "description"] },
        ctx.signal,
      ),
    ]);
    const asset: Asset = { ...info, title: str(v, "title") || info.title, image: plate, kind: "background" };
    return [{ kind: "data", view: "asset", data: asset, label: asset.title }];
  },
};

export const libraryTasks = [fabricCreate, fabricAddColour, brandKitCreate, poseCreate, backgroundCreate];

/** Text that tells a generation model to follow a brand kit. */
export function brandBrief(kit: BrandKit) {
  return [
    `Stay on-brand for "${kit.title}": ${kit.aesthetic}`,
    `Signature codes: ${kit.signature.join("; ")}. Silhouettes: ${kit.silhouettes.join(", ")}. Details: ${kit.details.join(", ")}.`,
    `Brand colours: ${kit.colours.map((c) => `${c.name} ${c.hex}`).join(", ")}.`,
    `Never: ${kit.avoid.join("; ")}.`,
  ].join("\n");
}
