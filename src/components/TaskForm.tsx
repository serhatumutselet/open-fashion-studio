"use client";

import { useEffect, useState } from "react";
import { listRecords } from "@/lib/store";
import { taskById } from "@/lib/tasks";
import type { Field, RecordData, RoleImage, Task, Values } from "@/lib/types";
import { ImageDrop, Thumb } from "./ImageDrop";

export function defaultValues(task: Task): Values {
  const values: Values = {};
  for (const f of task.fields) {
    if (f.type === "images") values[f.key] = [];
    else if ("default" in f) values[f.key] = f.default ?? "";
  }
  return values;
}

/** The first missing required field, as a message, or null when the form can run. */
export function missingField(task: Task, values: Values): string | null {
  for (const f of task.fields) {
    if (!f.required) continue;
    const v = values[f.key];
    if (f.type === "images") {
      const n = Array.isArray(v) ? v.length : 0;
      if (n < (f.min ?? 1)) return `${f.label}: add at least ${f.min ?? 1} image${(f.min ?? 1) > 1 ? "s" : ""}.`;
    } else if (f.type === "record") {
      if (!v || (Array.isArray(v) && !v.length)) return `Pick a ${f.label.toLowerCase()} from your library.`;
    } else if (typeof v !== "string" || !v.trim()) {
      return `${f.label} is required.`;
    }
  }
  return null;
}

function Label({ field }: { field: Field }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <span className="text-sm font-medium">
        {field.label}
        {field.required && <span className="text-accent"> *</span>}
      </span>
      {field.type === "images" && <span className="text-xs text-muted">up to {field.max}</span>}
      {field.type === "record" && <span className="text-xs text-muted">from your library</span>}
    </div>
  );
}

type Rec = { id: string; title: string; data: RecordData };

/** Pick one or several saved library records produced by `source`. */
function RecordSelect({ field, value, onChange }: { field: Extract<Field, { type: "record" }>; value: unknown; onChange: (v: unknown) => void }) {
  const [recs, setRecs] = useState<Rec[] | null>(null);
  useEffect(() => {
    listRecords([field.source])
      .then((r) => setRecs(r as Rec[]))
      .catch(() => setRecs([]));
  }, [field.source]);

  const selected = (Array.isArray(value) ? value : value ? [value] : []) as RecordData[];
  const isOn = (r: Rec) => selected.some((s) => s.recordId === r.id);
  const sourceTitle = taskById(field.source)?.title ?? "the library tool";

  if (recs && !recs.length && !selected.length) {
    return <p className="rounded-lg border border-dashed border-line px-3 py-2 text-xs text-muted">Nothing saved yet — use “{sourceTitle}” first.</p>;
  }

  if (field.multiple) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {(recs ?? []).map((r) => {
          const on = isOn(r);
          return (
            <button
              key={r.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? selected.filter((s) => s.recordId !== r.id) : [...selected, r.data])}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${on ? "border-accent bg-accent text-accent-ink" : "border-line bg-card hover:border-muted"}`}
            >
              {r.title}
            </button>
          );
        })}
      </div>
    );
  }

  const current = (recs ?? []).find(isOn);
  return (
    <select
      className="field"
      value={current?.id ?? (selected.length ? "__given" : "")}
      onChange={(e) => onChange((recs ?? []).find((r) => r.id === e.target.value)?.data)}
    >
      <option value="">None</option>
      {selected.length > 0 && !current && <option value="__given">{selected[0].title ?? "Selected"}</option>}
      {(recs ?? []).map((r) => (
        <option key={r.id} value={r.id}>
          {r.title}
        </option>
      ))}
    </select>
  );
}

function FieldInput({ field, value, set }: { field: Field; value: unknown; set: (v: unknown) => void }) {
  switch (field.type) {
    case "text":
      return <input className="field" value={(value as string) ?? ""} placeholder={field.placeholder} onChange={(e) => set(e.target.value)} />;
    case "textarea":
      return (
        <textarea className="field min-h-24 resize-y" value={(value as string) ?? ""} placeholder={field.placeholder} onChange={(e) => set(e.target.value)} />
      );
    case "select":
      return (
        <select className="field" value={value as string} onChange={(e) => set(e.target.value)}>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "number":
      return (
        <input
          type="number"
          className="field"
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          value={value as number}
          onChange={(e) => set(Math.min(field.max, Math.max(field.min, Number(e.target.value))))}
        />
      );
    case "toggle":
      return (
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(value)}
          aria-label={field.label}
          onClick={() => set(!value)}
          className={`relative h-6 w-11 rounded-full transition-colors ${value ? "bg-accent" : "bg-line"}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-card shadow transition-all ${value ? "left-5.5" : "left-0.5"}`} />
        </button>
      );
    case "checkboxes": {
      const selected = (value as string[]) ?? [];
      return (
        <div className="flex flex-wrap gap-1.5">
          {field.options.map((o) => {
            const on = selected.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={on}
                onClick={() => set(on ? selected.filter((s) => s !== o.value) : [...selected, o.value])}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  on ? "border-accent bg-accent text-accent-ink" : "border-line bg-card text-ink hover:border-muted"
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      );
    }
    case "image":
      return typeof value === "string" && value ? (
        <div className="w-36">
          <Thumb src={value} onRemove={() => set(undefined)} />
        </div>
      ) : (
        <ImageDrop onFiles={([src]) => set(src)} />
      );
    case "images": {
      const items = (value as RoleImage[]) ?? [];
      const update = (i: number, patch: Partial<RoleImage>) => set(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
      return (
        <div className="space-y-2">
          {items.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {items.map((it, i) => (
                <Thumb key={i} src={it.image} onRemove={() => set(items.filter((_, j) => j !== i))}>
                  {field.roles && (
                    <>
                      <select
                        aria-label="What this image is for"
                        className="field px-1.5! py-1! text-xs!"
                        value={it.role}
                        onChange={(e) => update(i, { role: e.target.value })}
                      >
                        {field.roles.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      <input
                        aria-label="Note"
                        className="field px-1.5! py-1! text-xs!"
                        placeholder="note"
                        value={it.note ?? ""}
                        onChange={(e) => update(i, { note: e.target.value })}
                      />
                    </>
                  )}
                </Thumb>
              ))}
            </div>
          )}
          {items.length < field.max && (
            <ImageDrop
              multiple
              compact={items.length > 0}
              onFiles={(srcs) => set([...items, ...srcs.map((image) => ({ image, role: field.roles?.[0]?.value ?? "" }))].slice(0, field.max))}
            />
          )}
        </div>
      );
    }
    case "record":
      return <RecordSelect field={field} value={value} onChange={set} />;
  }
}

export function TaskForm({ task, values, onChange }: { task: Task; values: Values; onChange: (v: Values) => void }) {
  return (
    <div className="space-y-5">
      {task.fields.map((field) => (
        <div key={field.key}>
          <Label field={field} />
          <FieldInput field={field} value={values[field.key]} set={(v) => onChange({ ...values, [field.key]: v })} />
          {field.hint && <p className="mt-1 text-xs text-muted">{field.hint}</p>}
        </div>
      ))}
    </div>
  );
}
