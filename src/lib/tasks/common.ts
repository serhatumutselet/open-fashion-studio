import type { Field, Option, RoleImage, RunContext, Values } from "../types";

export const ASPECT_OPTIONS: Option[] = [
  { value: "auto", label: "Auto" },
  { value: "1:1", label: "1:1 Square" },
  { value: "3:4", label: "3:4 Portrait" },
  { value: "4:5", label: "4:5 Social portrait" },
  { value: "2:3", label: "2:3 Lookbook" },
  { value: "9:16", label: "9:16 Story" },
  { value: "4:3", label: "4:3 Landscape" },
  { value: "3:2", label: "3:2 Landscape print" },
  { value: "16:9", label: "16:9 Banner" },
];

export const aspectField = (def = "auto"): Field => ({
  type: "select",
  key: "aspectRatio",
  label: "Aspect ratio",
  options: ASPECT_OPTIONS,
  default: def,
});

export const sizeField: Field = {
  type: "select",
  key: "imageSize",
  label: "Resolution",
  options: [
    { value: "1K", label: "1K (fast draft)" },
    { value: "2K", label: "2K (screen)" },
    { value: "4K", label: "4K (print)" },
  ],
  default: "2K",
  hint: "Not every model supports 4K; those return their closest size.",
};

export const countField = (max = 4): Field => ({
  type: "number",
  key: "count",
  label: "Count",
  min: 1,
  max,
  default: 1,
  hint: "Each image is billed by your provider.",
});

export const MODEL_FIELDS: Field[] = [
  {
    type: "select",
    key: "modelGender",
    label: "Model",
    options: [
      { value: "female", label: "Woman" },
      { value: "male", label: "Man" },
      { value: "androgynous", label: "Androgynous" },
      { value: "girl", label: "Girl" },
      { value: "boy", label: "Boy" },
    ],
    default: "female",
  },
  {
    type: "text",
    key: "modelLook",
    label: "Model description",
    placeholder: "e.g. late 20s, Mediterranean, wavy brown hair, natural makeup",
  },
  {
    type: "select",
    key: "bodyType",
    label: "Body type",
    options: [
      { value: "standard fashion-model", label: "Standard model" },
      { value: "athletic", label: "Athletic" },
      { value: "curvy plus-size", label: "Plus size" },
      { value: "petite", label: "Petite" },
      { value: "tall", label: "Tall" },
    ],
    default: "standard fashion-model",
  },
];

export const BACKGROUND_OPTIONS: Option[] = [
  { value: "seamless white studio backdrop with soft even light", label: "White studio" },
  { value: "seamless light grey studio backdrop with soft directional light", label: "Grey studio" },
  { value: "warm beige studio backdrop with soft daylight", label: "Beige studio" },
  { value: "modern city street with blurred architecture, natural daylight", label: "City street" },
  { value: "minimal loft interior with large windows and natural light", label: "Loft interior" },
  { value: "sunlit Mediterranean terrace with white walls", label: "Mediterranean terrace" },
  { value: "sandy beach at golden hour", label: "Beach at golden hour" },
  { value: "lush green garden with soft dappled light", label: "Garden" },
  { value: "fashion runway with audience in soft focus", label: "Runway" },
];

export const POSE_OPTIONS: Option[] = [
  { value: "standing straight facing the camera, arms relaxed", label: "Front, standing" },
  { value: "walking toward the camera mid-stride", label: "Walking" },
  { value: "three-quarter turn, one hand on hip", label: "Three-quarter, hand on hip" },
  { value: "side profile, standing", label: "Side profile" },
  { value: "back view, looking over the shoulder", label: "Back, over the shoulder" },
  { value: "seated on a simple stool, relaxed", label: "Seated" },
  { value: "leaning casually, weight on one leg", label: "Leaning" },
  { value: "dynamic editorial pose with movement", label: "Editorial, dynamic" },
];

export const str = (v: Values, key: string) => (typeof v[key] === "string" ? (v[key] as string).trim() : "");
export const num = (v: Values, key: string) => Number(v[key] ?? 0);
export const image = (v: Values, key: string) => {
  const src = v[key];
  if (typeof src !== "string" || !src) throw new Error("Upload an image.");
  return src;
};
export const optionalImage = (v: Values, key: string) => (typeof v[key] === "string" && v[key] ? (v[key] as string) : null);
export const roleImages = (v: Values, key: string) => (Array.isArray(v[key]) ? (v[key] as RoleImage[]) : []);
export const list = (v: Values, key: string) => (Array.isArray(v[key]) ? (v[key] as string[]) : []);
/** Selected library records of a `record` field, always as an array. */
export const records = <T>(v: Values, key: string): T[] => {
  const value = v[key];
  if (Array.isArray(value)) return value as T[];
  return value ? [value as T] : [];
};

/** Run jobs in parallel, reporting how many have finished. Keeps the ones that succeeded. */
export async function parallel<T>(jobs: (() => Promise<T>)[], ctx: RunContext, noun = "images"): Promise<T[]> {
  let done = 0;
  ctx.progress(`0/${jobs.length} ${noun}…`);
  const results = await Promise.allSettled(
    jobs.map((job) =>
      job().then((r) => {
        ctx.progress(`${++done}/${jobs.length} ${noun} ready…`);
        return r;
      }),
    ),
  );
  const ok = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  if (!ok.length) {
    const first = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    throw first.reason;
  }
  return ok;
}

/** Shared instruction for edits: change only what was asked. */
export const KEEP_REST =
  "Keep everything else exactly as in the input image: the same person, face, skin, hair, body, pose, garments, fabric, colours, lighting, framing and background, unless told otherwise. Photorealistic, no text, no watermark.";
