"use client";

import { useState } from "react";
import { downloadName } from "@/lib/image";
import type { Moodboard, RangePlan, Trend } from "@/lib/tasks/design";
import type { Asset, BrandKit, Fabric } from "@/lib/tasks/library";
import type { TechPack } from "@/lib/tasks/techpack";
import type { Output } from "@/lib/types";
import { AssetView, BrandKitView, FabricView, Materials, MoodboardView, Palette, RangePlanView, TechPackSheet, TrendView, type UseIn } from "./DataViews";
import { SendSelect, type SendTo } from "./SendSelect";

function MediaCard({ output, onSend, onZoom }: { output: Output & { src: string }; onSend: SendTo; onZoom: (src: string) => void }) {
  const isVideo = output.kind === "video";
  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-card">
      <div className="checker relative">
        {isVideo ? (
          <video src={output.src} controls loop playsInline className="w-full" />
        ) : (
          <button type="button" onClick={() => onZoom(output.src)} className="block w-full cursor-zoom-in" aria-label={`Enlarge ${output.label ?? "image"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- generated data URLs */}
            <img src={output.src} alt={output.label ?? ""} className="mx-auto max-h-[70vh] w-full object-contain" />
          </button>
        )}
      </div>
      <figcaption className="flex flex-wrap items-center gap-2 border-t border-line p-2 text-xs">
        <span className="mr-auto font-medium">{output.label}</span>
        <a
          href={output.src}
          download={downloadName(output.label, output.src)}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-line px-2 py-1 hover:border-muted"
        >
          Download
        </a>
        {output.kind === "image" && <SendSelect src={output.src} onSend={onSend} />}
      </figcaption>
    </figure>
  );
}

export function Outputs({ outputs, onSend, onUse }: { outputs: Output[]; onSend: SendTo; onUse: UseIn }) {
  const [zoom, setZoom] = useState<string | null>(null);
  const media = outputs.filter((o): o is Output & { src: string } => o.kind !== "data");

  return (
    <div className="space-y-4">
      {media.length > 0 && (
        <div className={`grid gap-3 ${media.length > 1 ? "sm:grid-cols-2" : ""}`}>
          {media.map((o, i) => (
            <MediaCard key={i} output={o} onSend={onSend} onZoom={setZoom} />
          ))}
        </div>
      )}
      {outputs.map((o, i) => {
        if (o.kind !== "data") return null;
        const d = o.data;
        return (
          <div key={i}>
            {o.view === "palette" && <Palette colours={(d as { colours: [] }).colours} />}
            {o.view === "materials" && <Materials data={d as Parameters<typeof Materials>[0]["data"]} />}
            {o.view === "moodboard" && <MoodboardView data={d as Moodboard} onUse={onUse} />}
            {o.view === "techpack" && <TechPackSheet data={d as TechPack} />}
            {o.view === "fabric" && <FabricView data={d as Fabric} onUse={onUse} onSend={onSend} />}
            {o.view === "brandkit" && <BrandKitView data={d as BrandKit} onUse={onUse} />}
            {o.view === "rangeplan" && <RangePlanView data={d as RangePlan} onSend={onSend} />}
            {o.view === "asset" && <AssetView data={d as Asset} onUse={onUse} onSend={onSend} />}
            {o.view === "trend" && <TrendView data={d as Trend} onUse={onUse} />}
          </div>
        );
      })}
      {zoom && (
        <button
          type="button"
          aria-label="Close"
          onClick={() => setZoom(null)}
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/85 p-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- generated data URLs */}
          <img src={zoom} alt="" className="max-h-full max-w-full object-contain" />
        </button>
      )}
    </div>
  );
}
