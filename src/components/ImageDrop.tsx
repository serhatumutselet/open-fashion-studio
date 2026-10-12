"use client";

import { useRef, useState } from "react";
import { fileToDataUrl } from "@/lib/image";

/** Click, drop or paste images. Calls onFiles with data URLs. */
export function ImageDrop({
  multiple,
  onFiles,
  compact,
  label = "Click, drop or paste images",
}: {
  multiple?: boolean;
  onFiles: (dataUrls: string[]) => void;
  compact?: boolean;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function take(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    setBusy(true);
    setError("");
    try {
      onFiles(await Promise.all((multiple ? images : images.slice(0, 1)).map((f) => fileToDataUrl(f))));
    } catch {
      setError("Could not read this file. Try JPG, PNG or WEBP.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take([...e.dataTransfer.files]);
        }}
        onPaste={(e) => take([...e.clipboardData.files])}
        className={`flex w-full items-center justify-center rounded-lg border border-dashed text-center text-sm transition-colors ${
          compact ? "h-24 px-2" : "h-28 px-4"
        } ${over ? "border-accent bg-accent/5 text-ink" : "border-line text-muted hover:border-muted"}`}
      >
        {busy ? "Reading…" : label}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          take([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

export function Thumb({ src, onRemove, children }: { src: string; onRemove: () => void; children?: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-card">
      <div className="checker relative aspect-square">
        {/* eslint-disable-next-line @next/next/no-img-element -- local data URLs */}
        <img src={src} alt="" className="h-full w-full object-contain" />
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove"
          className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-ink/70 text-xs text-paper hover:bg-ink"
        >
          ✕
        </button>
      </div>
      {children && <div className="space-y-1 p-1.5">{children}</div>}
    </div>
  );
}
