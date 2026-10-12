import { analyze, generateImage, research, type GeminiImage, type Source } from "../providers/gemini";
import type { RecordData, Task, Values } from "../types";
import { aspectField, countField, list, parallel, records, roleImages, sizeField, str } from "./common";
import { brandBrief, type BrandKit, type Fabric } from "./library";

export const REFERENCE_ROLES = [
  { value: "garment", label: "Garment (build on it)" },
  { value: "sketch", label: "Sketch → design" },
  { value: "fabric", label: "Fabric" },
  { value: "print", label: "Print / pattern" },
  { value: "colour", label: "Colours" },
  { value: "style", label: "Style" },
  { value: "pose", label: "Pose" },
  { value: "background", label: "Background" },
  { value: "inspiration", label: "Loose inspiration" },
];

const ROLE_CAPTIONS: Record<string, string> = {
  garment: "the base garment. Build the design on its silhouette, cut and construction.",
  sketch: "a sketch or line drawing. Turn it into a finished, realistic design, faithful to its lines and proportions.",
  fabric: "the exact fabric to use: copy its material, texture, weave and colour.",
  print: "the print or pattern the design must carry, reproduced faithfully.",
  colour: "a colour reference: take only its colour palette.",
  style: "a style reference: take its overall look and feel, not its details.",
  pose: "a pose reference: the person in the result takes this pose.",
  background: "the background or setting to place the result in.",
  inspiration: "loose inspiration: mood and feel only.",
};

export type Moodboard = RecordData & {
  title: string;
  theme: string;
  story: string;
  palette: { name: string; hex: string; pantone: string }[];
  fabrics: string[];
  prints: string[];
  key_items: string[];
  silhouettes: string[];
  details: string[];
  keywords: string[];
  images?: string[];
};

export type Trend = RecordData & { title: string; text: string; sources: Source[] };

export type RangePlan = RecordData & {
  title: string;
  story: string;
  items: { name: string; category: string; description: string; fabric: string; colour: string; image?: string }[];
};

const MOODBOARD_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    theme: { type: "STRING", description: "One-line theme of the board" },
    story: { type: "STRING", description: "2-3 sentence design story a collection could follow" },
    palette: {
      type: "ARRAY",
      description: "5-8 key colours, most dominant first",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          hex: { type: "STRING", description: "#RRGGBB" },
          pantone: { type: "STRING", description: "Closest Pantone Fashion, Home + Interiors TCX code and name" },
        },
        required: ["name", "hex", "pantone"],
      },
    },
    fabrics: { type: "ARRAY", items: { type: "STRING" } },
    prints: { type: "ARRAY", items: { type: "STRING" } },
    key_items: { type: "ARRAY", items: { type: "STRING" } },
    silhouettes: { type: "ARRAY", items: { type: "STRING" } },
    details: { type: "ARRAY", items: { type: "STRING" }, description: "Trims, finishes, construction details" },
    keywords: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["title", "theme", "story", "palette", "fabrics", "prints", "key_items", "silhouettes", "details", "keywords"],
};

export function moodboardBrief(m: Moodboard): string {
  return [
    `Follow this moodboard: "${m.title}" — ${m.theme}. ${m.story}`,
    `Palette: ${m.palette.map((c) => `${c.name} ${c.hex}`).join(", ")}.`,
    `Fabrics: ${m.fabrics.join(", ")}. Prints: ${m.prints.join(", ")}.`,
    `Silhouettes: ${m.silhouettes.join(", ")}. Details: ${m.details.join(", ")}.`,
    `Use only what fits the request below.`,
  ].join("\n");
}

const PRESENTATIONS: Record<string, string> = {
  model: "worn by a professional fashion model in a clean studio, full-length, editorial e-commerce photograph",
  flat: "as a flat lay product photograph on a plain light background, top-down, the whole garment visible",
  ghost: "on an invisible ghost mannequin on a plain white background, product photography",
  sketch: "as a fashion illustration sketch with clean lines and light watercolour rendering on white paper",
  runway: "on a runway model mid-walk at a fashion show, professional runway photography",
};

const PRESENTATION_FIELD = {
  type: "select" as const,
  key: "presentation",
  label: "Presentation",
  options: [
    { value: "model", label: "On a model" },
    { value: "flat", label: "Flat lay" },
    { value: "ghost", label: "Ghost mannequin" },
    { value: "sketch", label: "Fashion illustration" },
    { value: "runway", label: "Runway" },
  ],
  default: "model",
};

/** Brief text and reference images from the optional moodboard, brand kit and library fabric fields. */
function libraryContext(v: Values): { brief: string[]; images: GeminiImage[] } {
  const brief: string[] = [];
  const images: GeminiImage[] = [];
  for (const m of records<Moodboard>(v, "moodboard")) brief.push(moodboardBrief(m));
  for (const kit of records<BrandKit>(v, "brandKit")) {
    brief.push(brandBrief(kit));
    kit.looks.slice(0, 3).forEach((src) => images.push({ src, caption: `a look from the brand "${kit.title}": follow its style and codes, do not copy it.` }));
  }
  for (const f of records<Fabric>(v, "fabric")) {
    images.push({
      src: f.colourways[0].swatch,
      caption: `the exact fabric to use: ${f.title} (${f.type}, ${f.composition}, ${f.weight}, ${f.pattern}). Copy its texture and colour.`,
    });
  }
  return { brief, images };
}

const designGenerate: Task = {
  id: "design.generate",
  category: "design",
  title: "Generate designs",
  description: "New garment designs from a description, reference images, a moodboard, a brand kit or a library fabric.",
  providers: ["gemini"],
  fields: [
    {
      type: "textarea",
      key: "prompt",
      label: "Describe the design",
      placeholder: "e.g. a relaxed linen shirt dress for resort, midi length, self-tie belt",
    },
    { type: "images", key: "references", label: "Reference images", max: 6, roles: REFERENCE_ROLES, hint: "Pick what each image should give the design." },
    { type: "record", key: "moodboard", label: "Moodboard", source: "moodboard.create" },
    { type: "record", key: "brandKit", label: "Brand kit", source: "brand_kit.create" },
    { type: "record", key: "fabric", label: "Library fabric", source: "fabric.create" },
    {
      type: "select",
      key: "category",
      label: "Category",
      options: [
        { value: "womenswear", label: "Womenswear" },
        { value: "menswear", label: "Menswear" },
        { value: "unisex", label: "Unisex" },
        { value: "kidswear", label: "Kidswear" },
      ],
      default: "womenswear",
    },
    PRESENTATION_FIELD,
    aspectField("3:4"),
    sizeField,
    countField(4),
  ],
  async run(v, ctx) {
    const prompt = str(v, "prompt");
    const refs = roleImages(v, "references");
    const library = libraryContext(v);
    if (!prompt && !refs.length && !library.brief.length && !library.images.length) {
      throw new Error("Give a description, a reference image, a moodboard or a brand kit.");
    }

    const instruction = [
      `Design a new ${str(v, "category")} fashion piece and present it ${PRESENTATIONS[str(v, "presentation")]}.`,
      ...library.brief,
      prompt ? `Design brief: ${prompt}` : "Design brief: create a commercially viable design from the references.",
      refs.length || library.images.length ? "Use each numbered image only for the purpose stated next to it." : "",
      "Realistic garment construction: believable seams, closures and fabric drape. One design per image, no text, no watermark, no collage.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const images = [
      ...refs.map((r) => ({
        src: r.image,
        caption: `${ROLE_CAPTIONS[r.role] ?? ROLE_CAPTIONS.inspiration}${r.note ? ` Note: ${r.note}` : ""}`,
      })),
      ...library.images,
    ];
    const count = Math.max(1, Number(v.count) || 1);
    const results = await parallel(
      Array.from({ length: count }, (_, i) => () =>
        generateImage(
          ctx.settings,
          count > 1 ? `${instruction}\n\nThis is variation ${i + 1} of ${count}: make it distinct from the others.` : instruction,
          images,
          { aspectRatio: str(v, "aspectRatio"), imageSize: str(v, "imageSize"), signal: ctx.signal },
        ),
      ),
      ctx,
    );
    return results.map((src, i) => ({ kind: "image", src, label: `Design ${i + 1}` }));
  },
};

const patternGenerate: Task = {
  id: "pattern.generate",
  category: "design",
  title: "Generate prints",
  description: "Seamless, repeatable textile prints ready for fabric printing.",
  providers: ["gemini"],
  fields: [
    {
      type: "textarea",
      key: "prompt",
      label: "Describe the print",
      required: true,
      placeholder: "e.g. small vintage daisies in sage green on a cream ground",
    },
    {
      type: "select",
      key: "style",
      label: "Style",
      options: [
        { value: "botanical floral", label: "Floral / botanical" },
        { value: "geometric", label: "Geometric" },
        { value: "abstract painterly", label: "Abstract, painterly" },
        { value: "animal print", label: "Animal" },
        { value: "paisley", label: "Paisley" },
        { value: "stripes and checks", label: "Stripes / checks" },
        { value: "conversational novelty", label: "Conversational" },
        { value: "ethnic, folk motifs", label: "Folk motifs" },
      ],
      default: "botanical floral",
    },
    {
      type: "select",
      key: "repeat",
      label: "Repeat",
      options: [
        { value: "full drop (straight) repeat", label: "Straight" },
        { value: "half drop repeat", label: "Half drop" },
        { value: "mirror repeat", label: "Mirror" },
        { value: "tossed, non-directional all-over layout", label: "Tossed" },
      ],
      default: "half drop repeat",
    },
    {
      type: "select",
      key: "scale",
      label: "Motif scale",
      options: [
        { value: "small (ditsy)", label: "Small (ditsy)" },
        { value: "medium", label: "Medium" },
        { value: "large statement", label: "Large" },
      ],
      default: "medium",
    },
    { type: "images", key: "references", label: "Reference images", max: 4 },
    sizeField,
    countField(4),
  ],
  async run(v, ctx) {
    const prompt = str(v, "prompt");
    if (!prompt) throw new Error("Describe the print.");
    const instruction = `Create a flat textile print design: ${prompt}. Style: ${str(v, "style")}. Layout: ${str(v, "repeat")}, motif scale ${str(v, "scale")}.
It must tile seamlessly: elements that cross an edge continue exactly on the opposite edge. Flat, front-on artwork filling the whole square edge to edge, as a print designer would deliver it — no fabric folds, no shading, no perspective, no mockup, no border, no text.`;
    const images = roleImages(v, "references").map((r) => ({ src: r.image, caption: "a reference for motifs, colours and mood." }));
    const count = Math.max(1, Number(v.count) || 1);
    const results = await parallel(
      Array.from({ length: count }, (_, i) => () =>
        generateImage(ctx.settings, count > 1 ? `${instruction}\nVariation ${i + 1} of ${count}.` : instruction, images, {
          aspectRatio: "1:1",
          imageSize: str(v, "imageSize"),
          signal: ctx.signal,
        }),
      ),
      ctx,
      "prints",
    );
    return results.map((src, i) => ({ kind: "image", src, label: `Print ${i + 1}` }));
  },
};

const moodboardCreate: Task = {
  id: "moodboard.create",
  category: "design",
  title: "Create a moodboard",
  description: "Analyse images into a palette (with Pantone), fabrics, prints, silhouettes and key items you can design from.",
  providers: ["gemini"],
  fields: [
    { type: "text", key: "title", label: "Title", placeholder: "e.g. SS27 Riviera" },
    { type: "images", key: "images", label: "Images", max: 16, min: 3, required: true },
    { type: "textarea", key: "notes", label: "Notes", placeholder: "e.g. target customer, season, price point" },
  ],
  async run(v, ctx) {
    const images = roleImages(v, "images");
    if (images.length < 3) throw new Error("Upload at least 3 images.");
    ctx.progress("Analysing the images…");
    const board = await analyze<Moodboard>(
      ctx.settings,
      `You are a fashion trend analyst. Analyse these ${images.length} images as one moodboard and extract what a design team needs.
${str(v, "title") ? `Title it "${str(v, "title")}".` : "Give it a short evocative title."}
${str(v, "notes") ? `Context from the team: ${str(v, "notes")}` : ""}
Be specific: name actual fabrics (e.g. "washed linen", "crinkled satin"), print types, garment types and silhouettes you see.`,
      images.map((r) => ({ src: r.image })),
      MOODBOARD_SCHEMA,
      ctx.signal,
    );
    return [{ kind: "data", view: "moodboard", data: { ...board, images: images.map((r) => r.image) }, label: board.title }];
  },
};

const TREND_FOCUS = [
  { value: "colours (with Pantone references)", label: "Colours" },
  { value: "fabrics and materials", label: "Fabrics" },
  { value: "silhouettes and fits", label: "Silhouettes" },
  { value: "prints and patterns", label: "Prints" },
  { value: "details and trims", label: "Details" },
  { value: "key items and best-sellers", label: "Key items" },
];

const trendResearch: Task = {
  id: "trend.research",
  category: "design",
  title: "Research trends",
  description: "A trend report from live web search — runway, retail and street — with its sources.",
  providers: ["gemini"],
  fields: [
    { type: "text", key: "topic", label: "Topic", required: true, placeholder: "e.g. womenswear knitwear, men's tailoring, kids' denim" },
    { type: "text", key: "season", label: "Season", placeholder: "e.g. SS27" },
    { type: "text", key: "market", label: "Market", placeholder: "e.g. Europe, mid-premium" },
    { type: "checkboxes", key: "focus", label: "Focus on", options: TREND_FOCUS, default: TREND_FOCUS.map((f) => f.value) },
  ],
  async run(v, ctx) {
    const topic = str(v, "topic");
    if (!topic) throw new Error("Name a topic.");
    ctx.progress("Searching the web…");
    const { text, sources } = await research(
      ctx.settings,
      `You are a fashion trend forecaster. Research current and emerging trends for: ${topic}${str(v, "season") ? `, season ${str(v, "season")}` : ""}${str(v, "market") ? `, market: ${str(v, "market")}` : ""}.
Use recent runway shows, retailer assortments, search interest and street style. Cover: ${list(v, "focus").join(", ") || "colours, fabrics, silhouettes, prints, details, key items"}.
Write a concise report for a design team in Markdown: a one-paragraph summary, then a "## " section per focus area with bullet points, each trend with one line on why it matters and how to apply it. End with "## Design directions": 3-5 concrete product ideas.`,
      [],
      ctx.signal,
    );
    const title = `${topic}${str(v, "season") ? ` · ${str(v, "season")}` : ""}`;
    const trend: Trend = { title, text, sources };
    return [{ kind: "data", view: "trend", data: trend, label: title }];
  },
};

const rangePlanCreate: Task = {
  id: "range_plan.create",
  category: "design",
  title: "Plan a range",
  description: "Plan a collection line by line from a moodboard or brand kit and design every piece — or isolate the garments from runway looks.",
  providers: ["gemini"],
  fields: [
    {
      type: "select",
      key: "mode",
      label: "Mode",
      options: [
        { value: "design", label: "Design new pieces" },
        { value: "isolate", label: "Isolate garments from looks" },
      ],
      default: "design",
    },
    { type: "text", key: "title", label: "Collection name", placeholder: "e.g. SS27 Riviera capsule" },
    { type: "textarea", key: "brief", label: "Brief", placeholder: "e.g. 8-piece resort capsule: 3 dresses, 2 tops, 2 bottoms, 1 outerwear" },
    { type: "record", key: "moodboard", label: "Moodboard", source: "moodboard.create" },
    { type: "record", key: "brandKit", label: "Brand kit", source: "brand_kit.create" },
    { type: "number", key: "pieces", label: "Pieces", min: 2, max: 12, default: 6, hint: "Design mode." },
    { type: "images", key: "looks", label: "Runway / street looks", max: 6, hint: "Isolate mode: every garment in each look becomes a product." },
    { ...PRESENTATION_FIELD, default: "ghost" },
  ],
  async run(v, ctx) {
    const library = libraryContext(v);
    const looks = roleImages(v, "looks").map((r) => r.image);
    const isolate = str(v, "mode") === "isolate";
    if (isolate && !looks.length) throw new Error("Upload at least one look to isolate garments from.");
    if (!isolate && !str(v, "brief") && !library.brief.length) throw new Error("Write a brief or pick a moodboard or brand kit.");

    const ITEM = {
      type: "OBJECT",
      properties: {
        name: { type: "STRING" },
        category: { type: "STRING", description: "e.g. Dresses, Tops, Outerwear" },
        description: { type: "STRING", description: "Design description precise enough to draw it" },
        fabric: { type: "STRING" },
        colour: { type: "STRING" },
        look: { type: "INTEGER", description: "Isolate mode: 1-based number of the look image it comes from, else 0" },
      },
      required: ["name", "category", "description", "fabric", "colour", "look"],
    };
    ctx.progress("Planning the range…");
    const plan = await analyze<{ title: string; story: string; items: (RangePlan["items"][number] & { look: number })[] }>(
      ctx.settings,
      isolate
        ? `You are a merchandiser. List every distinct garment worn in these ${looks.length} looks (max 12), each as a product line with the number of the look it is in.${str(v, "title") ? ` Collection: "${str(v, "title")}".` : ""}`
        : `You are a head of design planning a balanced, commercially sound collection of ${Number(v.pieces) || 6} pieces.\n${library.brief.join("\n")}\n${str(v, "brief") ? `Brief: ${str(v, "brief")}` : ""}${str(v, "title") ? `\nCollection: "${str(v, "title")}".` : ""}\nVary categories and price points; pieces must work together as outfits.`,
      isolate ? looks.map((src) => ({ src })) : library.images,
      { type: "OBJECT", properties: { title: { type: "STRING" }, story: { type: "STRING" }, items: { type: "ARRAY", items: ITEM } }, required: ["title", "story", "items"] },
      ctx.signal,
    );

    const presentation = PRESENTATIONS[str(v, "presentation")];
    const items = plan.items.slice(0, 12);
    const images = await Promise.all(
      items.map((item, i) => {
        const look = isolate ? looks[item.look - 1] : undefined;
        return generateImage(
          ctx.settings,
          look
            ? `Isolate only the ${item.name} (${item.description}) from this look and show it alone ${presentation}. Reproduce it exactly: cut, fabric, colour, print and details.`
            : `Draw this piece of the "${plan.title}" collection ${presentation}: ${item.name} — ${item.description}. Fabric: ${item.fabric}. Colour: ${item.colour}. ${library.brief.join(" ")} One garment, no text.`,
          look ? [{ src: look, caption: "the look." }] : library.images,
          { aspectRatio: "3:4", imageSize: "1K", signal: ctx.signal },
        )
          .then((src) => {
            ctx.progress(`Designing pieces… ${i + 1}/${items.length}`);
            return src;
          })
          .catch(() => undefined);
      }),
    );
    const range: RangePlan = {
      title: str(v, "title") || plan.title,
      story: plan.story,
      items: items.map((item, i) => ({ name: item.name, category: item.category, description: item.description, fabric: item.fabric, colour: item.colour, image: images[i] })),
    };
    return [{ kind: "data", view: "rangeplan", data: range, label: range.title }];
  },
};

export const designTasks = [designGenerate, patternGenerate, moodboardCreate, trendResearch, rangePlanCreate];
