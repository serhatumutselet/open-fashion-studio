import type { Settings } from "./settings";

export type Option = { value: string; label: string };

/** A reference image with what the model should take from it. */
export type RoleImage = { image: string; role: string; note?: string };

type FieldBase = { key: string; label: string; hint?: string; required?: boolean };

export type Field =
  | (FieldBase & { type: "text" | "textarea"; placeholder?: string; default?: string })
  | (FieldBase & { type: "select"; options: Option[]; default: string })
  | (FieldBase & { type: "checkboxes"; options: Option[]; default: string[] })
  | (FieldBase & { type: "number"; min: number; max: number; step?: number; default: number })
  | (FieldBase & { type: "toggle"; default: boolean })
  | (FieldBase & { type: "image" })
  | (FieldBase & { type: "images"; max: number; min?: number; roles?: Option[] })
  /** Pick saved library records (results of the task `source`). Value: the record data, or an array of them. */
  | (FieldBase & { type: "record"; source: string; multiple?: boolean });

export type Values = Record<string, unknown>;

/** Data a library task saves. `recordId` is set when the result is stored, so later tasks can update it. */
export type RecordData = { recordId?: string; title?: string };

export type DataView =
  | "palette"
  | "materials"
  | "moodboard"
  | "techpack"
  | "fabric"
  | "brandkit"
  | "rangeplan"
  | "asset"
  | "trend";

export type Output =
  | { kind: "image"; src: string; label?: string }
  | { kind: "video"; src: string; label?: string }
  | { kind: "svg"; src: string; label?: string }
  | { kind: "data"; view: DataView; data: unknown; label?: string };

export type Category = "design" | "photoshoot" | "edit" | "techpack" | "library";

export type Provider = "gemini" | "fal";

export type RunContext = {
  settings: Settings;
  progress: (message: string) => void;
  signal: AbortSignal;
};

export type Task = {
  id: string;
  category: Category;
  title: string;
  description: string;
  providers: Provider[];
  fields: Field[];
  run: (values: Values, ctx: RunContext) => Promise<Output[]>;
};
