import { runFal } from "../providers/fal";
import { analyze, generateImage, type GeminiImage } from "../providers/gemini";
import { imageSize, persistUrl } from "../image";
import type { Task } from "../types";
import { image, str } from "./common";

export type Colour = { name: string; hex: string; pantone: string; share: number };

export type Material = {
  component: string;
  material: string;
  composition: string;
  weight: string;
  finish: string;
  placement: string;
};

export type Trim = { item: string; description: string; size: string; quantity: string; placement: string };

export type TechPack = {
  style_name: string;
  garment_type: string;
  category: string;
  season: string;
  description: string;
  fit: string;
  materials: Material[];
  trims: Trim[];
  colours: Colour[];
  construction: { area: string; detail: string }[];
  stitching: { seam: string; stitch_type: string; spi: string }[];
  measurements: { code: string; point: string; size_m: string; tolerance: string }[];
  labels_and_packaging: string[];
  care: string[];
  notes: string[];
  front_sketch?: string;
  back_sketch?: string;
  reference?: string;
};

const S = { type: "STRING" };
const strings = { type: "ARRAY", items: S };
const obj = (props: Record<string, object>) => ({
  type: "OBJECT",
  properties: props,
  required: Object.keys(props),
});

const COLOUR_ITEM = obj({
  name: S,
  hex: { type: "STRING", description: "#RRGGBB" },
  pantone: { type: "STRING", description: "Closest Pantone Fashion, Home + Interiors TCX code and name, e.g. 19-4052 TCX Classic Blue" },
  share: { type: "NUMBER", description: "Approximate share of the garment's visible surface, 0-100" },
});

const MATERIAL_ITEM = obj({
  component: { type: "STRING", description: "e.g. Shell, Lining, Collar facing, Rib trim" },
  material: S,
  composition: { type: "STRING", description: "Likely fibre composition, e.g. 100% cotton" },
  weight: { type: "STRING", description: "Estimated weight, e.g. 180 gsm" },
  finish: S,
  placement: S,
});

const TRIM_ITEM = obj({ item: S, description: S, size: S, quantity: S, placement: S });

const MATERIALS_SCHEMA = obj({
  garment_type: S,
  materials: { type: "ARRAY", items: MATERIAL_ITEM },
  trims: { type: "ARRAY", items: TRIM_ITEM },
  colours: { type: "ARRAY", items: COLOUR_ITEM },
});

const TECHPACK_SCHEMA = obj({
  style_name: S,
  garment_type: S,
  category: { type: "STRING", description: "e.g. Womenswear / Dresses" },
  season: S,
  description: { type: "STRING", description: "Concise product description for the factory" },
  fit: S,
  materials: { type: "ARRAY", items: MATERIAL_ITEM },
  trims: { type: "ARRAY", items: TRIM_ITEM },
  colours: { type: "ARRAY", items: COLOUR_ITEM },
  construction: { type: "ARRAY", items: obj({ area: S, detail: S }) },
  stitching: { type: "ARRAY", items: obj({ seam: S, stitch_type: { type: "STRING", description: "ISO 4915 class where possible, e.g. 301 lockstitch, 504 overlock" }, spi: { type: "STRING", description: "Stitches per inch" } }) },
  measurements: {
    type: "ARRAY",
    description: "Points of measure for the sample size M, 10-18 rows",
    items: obj({ code: { type: "STRING", description: "e.g. A, B, C…" }, point: S, size_m: { type: "STRING", description: "In cm" }, tolerance: { type: "STRING", description: "± cm" } }),
  },
  labels_and_packaging: strings,
  care: strings,
  notes: { type: "ARRAY", items: S, description: "Assumptions and points the factory must confirm" },
});

const ANALYST = `You are a senior apparel technical designer preparing production documentation. Read the garment from the image(s).
What you cannot see, estimate from industry standards for this garment type and say so in notes. Measurements in centimetres.`;

const extractMaterials: Task = {
  id: "image.extract_materials",
  category: "techpack",
  title: "Extract materials & trims",
  description: "List the fabrics, trims (buttons, zips…) and colours of the garment in an image.",
  providers: ["gemini"],
  fields: [{ type: "image", key: "image", label: "Garment image", required: true }],
  async run(v, ctx) {
    ctx.progress("Reading the materials…");
    const data = await analyze<{ garment_type: string; materials: Material[]; trims: Trim[]; colours: Colour[] }>(
      ctx.settings,
      `${ANALYST}\nList every fabric component, every trim and component (buttons, zips, labels, drawcords, elastics…) and the garment's colours.`,
      [{ src: image(v, "image") }],
      MATERIALS_SCHEMA,
      ctx.signal,
    );
    return [{ kind: "data", view: "materials", data: { ...data, reference: v.image }, label: data.garment_type }];
  },
};

const extractColours: Task = {
  id: "image.extract_colours",
  category: "techpack",
  title: "Extract colours (Pantone)",
  description: "The garment palette, largest share first, with hex values and the closest Pantone TCX.",
  providers: ["gemini"],
  fields: [
    { type: "image", key: "image", label: "Image", required: true },
    { type: "number", key: "max", label: "Max colours", min: 2, max: 12, default: 6 },
  ],
  async run(v, ctx) {
    ctx.progress("Reading the colours…");
    const data = await analyze<{ colours: Colour[] }>(
      ctx.settings,
      `Extract up to ${Number(v.max) || 6} colours of the garment (ignore skin, hair and background), largest share first. Give each its hex and the closest Pantone TCX.`,
      [{ src: image(v, "image") }],
      obj({ colours: { type: "ARRAY", items: COLOUR_ITEM } }),
      ctx.signal,
    );
    return [{ kind: "data", view: "palette", data: { colours: data.colours, reference: v.image }, label: "Palette" }];
  },
};

const extractPrint: Task = {
  id: "image.extract_print",
  category: "techpack",
  title: "Extract the print",
  description: "Lift the print off a garment as a flat, reusable swatch.",
  providers: ["gemini"],
  fields: [
    { type: "image", key: "image", label: "Image", required: true },
    { type: "toggle", key: "seamless", label: "Make it a seamless repeat", default: true },
  ],
  async run(v, ctx) {
    ctx.progress("Extracting the print…");
    const out = await generateImage(
      ctx.settings,
      `Extract the print/pattern from the garment in this image as flat, front-on textile artwork that fills the whole square: remove folds, shadows, wrinkles and perspective distortion, keep the motifs, their colours, proportions and spacing exactly. ${v.seamless ? "Make it a seamless repeat tile." : ""} No garment, no background, no text.`,
      [{ src: image(v, "image"), caption: "the garment with the print." }],
      { aspectRatio: "1:1", imageSize: "2K", signal: ctx.signal },
    );
    return [{ kind: "image", src: out, label: "Print" }];
  },
};

const toSvg: Task = {
  id: "image.to_svg",
  category: "techpack",
  title: "Convert to SVG",
  description: "Convert a technical drawing or print into a layered SVG vector, ready for Illustrator, tech packs and cutting.",
  providers: ["fal"],
  fields: [{ type: "image", key: "image", label: "Drawing or print", required: true, hint: "PNG or JPG, each side between 256 and 4096 px." }],
  async run(v, ctx) {
    const src = image(v, "image");
    const { width, height } = await imageSize(src);
    if (Math.min(width, height) <= 256 || Math.max(width, height) >= 4096) {
      throw new Error(`The image is ${width}×${height}; each side must be between 256 and 4096 px.`);
    }
    ctx.progress("Vectorising…");
    const out = await runFal<{ image: { url: string } }>(ctx.settings, "fal-ai/recraft/vectorize", { image_url: src }, ctx);
    return [{ kind: "svg", src: await persistUrl(out.image.url), label: "Vector" }];
  },
};

const techpackCreate: Task = {
  id: "techpack.create",
  category: "techpack",
  title: "Create a tech pack",
  description: "A production-ready tech pack from a product image: front and back technical flats, bill of materials, colours, construction, stitching and a measurement chart. Print it to PDF.",
  providers: ["gemini"],
  fields: [
    { type: "image", key: "front", label: "Front image", required: true },
    { type: "image", key: "back", label: "Back image", hint: "Optional: without it the back is inferred." },
    { type: "text", key: "styleName", label: "Style name / number", placeholder: "e.g. SS27-DR-014 Linen Shirt Dress" },
    { type: "text", key: "season", label: "Season", placeholder: "e.g. SS27" },
    { type: "textarea", key: "notes", label: "Known facts", placeholder: "e.g. fabric: 55% linen 45% viscose, 160 gsm; size range XS–XL" },
  ],
  async run(v, ctx) {
    const front = image(v, "front");
    const back = typeof v.back === "string" && v.back ? v.back : null;
    const images: GeminiImage[] = [{ src: front, caption: "front of the garment." }];
    if (back) images.push({ src: back, caption: "back of the garment." });

    const flat = (side: "front" | "back") =>
      `Draw the garment as a technical flat (fashion CAD) ${side} view: perfectly symmetrical, clean uniform black outlines on pure white, stitch lines as dashed lines, every seam, dart, pocket, closure, collar and cuff accurate. No model, no shading, no colour, no text.`;

    let done = 0;
    const step = <T>(p: Promise<T>) =>
      p.then((r) => {
        ctx.progress(`${++done}/3 parts ready…`);
        return r;
      });
    ctx.progress("Preparing 3 parts (spec, front flat, back flat)…");

    const [spec, frontSketch, backSketch] = await Promise.all([
      step(
        analyze<TechPack>(
          ctx.settings,
          `${ANALYST}\nWrite a complete tech pack for this garment.${str(v, "styleName") ? ` Style name: ${str(v, "styleName")}.` : ""}${str(v, "season") ? ` Season: ${str(v, "season")}.` : ""}${str(v, "notes") ? `\nFacts from the brand (these override your estimates): ${str(v, "notes")}` : ""}`,
          images,
          TECHPACK_SCHEMA,
          ctx.signal,
        ),
      ),
      step(generateImage(ctx.settings, flat("front"), [images[0]], { aspectRatio: "1:1", imageSize: "2K", signal: ctx.signal })),
      step(
        generateImage(
          ctx.settings,
          back ? flat("back") : `${flat("back")} Infer the back from the front's construction.`,
          back ? [images[1]] : [images[0]],
          { aspectRatio: "1:1", imageSize: "2K", signal: ctx.signal },
        ).catch(() => undefined),
      ),
    ]);

    const pack: TechPack = { ...spec, front_sketch: frontSketch, back_sketch: backSketch, reference: front };
    return [{ kind: "data", view: "techpack", data: pack, label: pack.style_name || "Tech pack" }];
  },
};

export const techpackTasks = [techpackCreate, extractMaterials, extractColours, extractPrint, toSvg];
