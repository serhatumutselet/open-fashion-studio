"use client";

import { TASKS, primaryImageField } from "@/lib/tasks";

const SENDABLE = TASKS.filter((t) => primaryImageField(t));

export type SendTo = (taskId: string, src: string) => void;

/** Send an image into another task's first image field. */
export function SendSelect({ src, onSend }: { src: string; onSend: SendTo }) {
  return (
    <select
      aria-label="Send to another tool"
      className="rounded-md border border-line bg-card px-1.5 py-1 text-xs"
      value=""
      onChange={(e) => e.target.value && onSend(e.target.value, src)}
    >
      <option value="">Send to →</option>
      {SENDABLE.map((t) => (
        <option key={t.id} value={t.id}>
          {t.title}
        </option>
      ))}
    </select>
  );
}
