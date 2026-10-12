"use client";

import { Fragment, useState } from "react";
import type { Moodboard, RangePlan, Trend } from "@/lib/tasks/design";
import type { Asset, BrandKit, Fabric } from "@/lib/tasks/library";
import type { Colour, Material, TechPack, Trim } from "@/lib/tasks/techpack";
import type { Values } from "@/lib/types";
import { SendSelect, type SendTo } from "./SendSelect";

/** Open a task with some of its fields filled in. */
export type UseIn = (taskId: string, patch: Values) => void;

function Swatch({ c, compact }: { c: { name: string; hex: string; pantone?: string; share?: number }; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Copy hex"
      onClick={() => {
        navigator.clipboard?.writeText(c.hex).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      className="overflow-hidden rounded-lg border border-line bg-card text-left"
    >
      <div className={compact ? "h-12" : "h-20"} style={{ background: c.hex }} />
      <div className="p-2 text-xs leading-snug">
        <div className="font-medium">{c.name}</div>
        <div className="font-mono text-muted">{copied ? "copied" : c.hex}</div>
        {c.pantone && <div className="text-muted">{c.pantone}</div>}
        {c.share != null && <div className="text-muted">{Math.round(c.share)}%</div>}
      </div>
    </button>
  );
}

export function Palette({ colours }: { colours: Colour[] }) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {colours.map((c, i) => (
          <Swatch key={i} c={c} />
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">Pantone matches are estimated from the image; confirm them against a physical swatch before production.</p>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | undefined)[][] }) {
  if (!rows.length) return <p className="text-sm text-muted">—</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-xs">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className="border-b border-line px-2 py-1.5 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              {r.map((cell, j) => (
                <td key={j} className="border-b border-line/60 px-2 py-1.5">
                  {cell || "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const materialRows = (m: Material[]) => m.map((x) => [x.component, x.material, x.composition, x.weight, x.finish, x.placement]);
const trimRows = (t: Trim[]) => t.map((x) => [x.item, x.description, x.size, x.quantity, x.placement]);
const MATERIAL_HEAD = ["Component", "Material", "Composition", "Weight", "Finish", "Placement"];
const TRIM_HEAD = ["Trim", "Description", "Size", "Qty", "Placement"];

function H({ children }: { children: React.ReactNode }) {
  return <h4 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-muted first:mt-0">{children}</h4>;
}

function Chips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s, i) => (
        <span key={i} className="rounded-full border border-line bg-card px-2.5 py-0.5 text-xs">
          {s}
        </span>
      ))}
    </div>
  );
}

function ActionButton({ onClick, children, primary }: { onClick: () => void; children: React.ReactNode; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={primary ? "rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink" : "rounded-lg border border-line px-3 py-1.5 text-sm hover:border-muted"}
    >
      {children}
    </button>
  );
}

function Header({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="font-display text-3xl leading-tight">{title}</h3>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

function Gallery({ images }: { images: string[] }) {
  return (
    <div className="columns-3 gap-2 sm:columns-4">
      {images.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- local data URLs
        <img key={i} src={src} alt="" className="mb-2 w-full rounded-md" />
      ))}
    </div>
  );
}

export function Materials({ data }: { data: { garment_type: string; materials: Material[]; trims: Trim[]; colours: Colour[] } }) {
  return (
    <div>
      <H>Fabrics</H>
      <Table head={MATERIAL_HEAD} rows={materialRows(data.materials)} />
      <H>Trims</H>
      <Table head={TRIM_HEAD} rows={trimRows(data.trims)} />
      <H>Colours</H>
      <Palette colours={data.colours} />
    </div>
  );
}

export function MoodboardView({ data, onUse }: { data: Moodboard; onUse: UseIn }) {
  return (
    <div>
      <Header title={data.title} subtitle={data.theme}>
        <ActionButton primary onClick={() => onUse("design.generate", { moodboard: data })}>
          Design from it
        </ActionButton>
        <ActionButton onClick={() => onUse("range_plan.create", { moodboard: data })}>Plan a range</ActionButton>
      </Header>
      <p className="mt-3 max-w-prose text-sm">{data.story}</p>
      {data.images && (
        <div className="mt-4">
          <Gallery images={data.images} />
        </div>
      )}
      <H>Palette</H>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {data.palette.map((c, i) => (
          <Swatch key={i} c={c} compact />
        ))}
      </div>
      <H>Fabrics</H>
      <Chips items={data.fabrics} />
      <H>Prints</H>
      <Chips items={data.prints} />
      <H>Key items</H>
      <Chips items={data.key_items} />
      <H>Silhouettes</H>
      <Chips items={data.silhouettes} />
      <H>Details</H>
      <Chips items={data.details} />
      <H>Keywords</H>
      <Chips items={data.keywords} />
    </div>
  );
}

export function FabricView({ data, onUse, onSend }: { data: Fabric; onUse: UseIn; onSend: SendTo }) {
  return (
    <div>
      <Header title={data.title} subtitle={`${data.type} · ${data.composition} · ${data.weight}`}>
        <ActionButton primary onClick={() => onUse("design.generate", { fabric: data })}>
          Design with it
        </ActionButton>
        <ActionButton onClick={() => onUse("image.change_texture", { libraryFabric: data })}>Apply to a garment</ActionButton>
        <ActionButton onClick={() => onUse("fabric.add_colour", { fabric: data })}>Add a colourway</ActionButton>
      </Header>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {data.colourways.map((c, i) => (
          <figure key={i} className="overflow-hidden rounded-lg border border-line bg-card">
            {/* eslint-disable-next-line @next/next/no-img-element -- local data URLs */}
            <img src={c.swatch} alt={c.name} className="aspect-square w-full object-cover" />
            <figcaption className="flex items-center justify-between gap-1 p-1.5 text-xs">
              <span className="truncate font-medium">{c.name}</span>
              <SendSelect src={c.swatch} onSend={onSend} />
            </figcaption>
          </figure>
        ))}
      </div>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">Pattern</dt>
        <dd>{data.pattern}</dd>
        <dt className="text-muted">Hand feel</dt>
        <dd>{data.handfeel}</dd>
        <dt className="text-muted">Good for</dt>
        <dd>{data.uses.join(", ")}</dd>
      </dl>
    </div>
  );
}

export function BrandKitView({ data, onUse }: { data: BrandKit; onUse: UseIn }) {
  return (
    <div>
      <Header title={data.title} subtitle="Brand kit">
        <ActionButton primary onClick={() => onUse("design.generate", { brandKit: data })}>
          Design on-brand
        </ActionButton>
        <ActionButton onClick={() => onUse("range_plan.create", { brandKit: data })}>Plan a range</ActionButton>
      </Header>
      <p className="mt-3 max-w-prose text-sm">{data.aesthetic}</p>
      <H>Colours</H>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {data.colours.map((c, i) => (
          <Swatch key={i} c={c} compact />
        ))}
      </div>
      <H>Signature codes</H>
      <Chips items={data.signature} />
      <H>Silhouettes</H>
      <Chips items={data.silhouettes} />
      <H>Details</H>
      <Chips items={data.details} />
      <H>Never</H>
      <Chips items={data.avoid} />
      <H>Looks</H>
      <Gallery images={[...data.looks, ...data.fabrics, ...data.prints]} />
    </div>
  );
}

export function RangePlanView({ data, onSend }: { data: RangePlan; onSend: SendTo }) {
  return (
    <div>
      <Header title={data.title} subtitle={`${data.items.length} pieces`} />
      <p className="mt-3 max-w-prose text-sm">{data.story}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.items.map((item, i) => (
          <article key={i} className="overflow-hidden rounded-xl border border-line bg-card">
            <div className="checker aspect-[3/4]">
              {item.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- local data URLs
                <img src={item.image} alt={item.name} className="h-full w-full object-contain" />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted">Not drawn</div>
              )}
            </div>
            <div className="space-y-1 p-3 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted">{item.category}</div>
                  <div className="text-sm font-medium">{item.name}</div>
                </div>
                {item.image && <SendSelect src={item.image} onSend={onSend} />}
              </div>
              <p>{item.description}</p>
              <p className="text-muted">
                {item.fabric} · {item.colour}
              </p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function AssetView({ data, onUse, onSend }: { data: Asset; onUse: UseIn; onSend: SendTo }) {
  const isPose = data.kind === "pose";
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,280px)_1fr]">
      {/* eslint-disable-next-line @next/next/no-img-element -- local data URLs */}
      <img src={data.image} alt={data.title} className="w-full rounded-xl border border-line" />
      <div>
        <Header title={data.title} subtitle={isPose ? "Library pose" : "Library background"} />
        <p className="mt-3 text-sm">{data.description}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <ActionButton primary onClick={() => onUse("photoshoot.model", isPose ? { libraryPoses: [data] } : { libraryBackground: data })}>
            Use in a photoshoot
          </ActionButton>
          {!isPose && (
            <ActionButton onClick={() => onUse("image.change_background", { mode: "library", libraryBackground: data })}>Use as a new background</ActionButton>
          )}
          <SendSelect src={data.image} onSend={onSend} />
        </div>
      </div>
    </div>
  );
}

/** Minimal Markdown: "## " headings, "- " bullets and **bold**. */
function Markdown({ text }: { text: string }) {
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>));
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) blocks.push(<ul key={blocks.length} className="mb-3 list-disc space-y-1 pl-5">{bullets.map((b, i) => <li key={i}>{inline(b)}</li>)}</ul>);
    bullets = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (/^[-*] /.test(line)) {
      bullets.push(line.slice(2));
      continue;
    }
    flush();
    if (!line) continue;
    const heading = /^#{1,4} (.*)$/.exec(line);
    if (heading) blocks.push(<h4 key={blocks.length} className="mb-2 mt-5 font-display text-2xl">{inline(heading[1])}</h4>);
    else blocks.push(<p key={blocks.length} className="mb-3">{inline(line)}</p>);
  }
  flush();
  return <div className="max-w-prose text-sm leading-relaxed">{blocks}</div>;
}

export function TrendView({ data, onUse }: { data: Trend; onUse: UseIn }) {
  const directions = data.text.split(/^#{1,4} Design directions\s*$/im)[1];
  return (
    <div>
      <Header title={data.title} subtitle="Trend report">
        <ActionButton primary onClick={() => onUse("design.generate", { prompt: (directions ?? data.text).trim().slice(0, 1500) })}>
          Design from it
        </ActionButton>
      </Header>
      <div className="mt-4">
        <Markdown text={data.text} />
      </div>
      {data.sources.length > 0 && (
        <>
          <H>Sources</H>
          <ol className="list-decimal space-y-1 pl-5 text-xs">
            {data.sources.map((s, i) => (
              <li key={i}>
                <a href={s.url} target="_blank" rel="noreferrer" className="underline">
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

function SheetImage({ src, caption }: { src?: string; caption: string }) {
  return (
    <figure className="flex flex-col">
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md border border-line bg-white">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- local data URLs
          <img src={src} alt={caption} className="h-full w-full object-contain" />
        ) : (
          <span className="text-xs text-neutral-500">not generated</span>
        )}
      </div>
      <figcaption className="mt-1 text-center text-[10px] uppercase tracking-wider text-muted">{caption}</figcaption>
    </figure>
  );
}

export function TechPackSheet({ data }: { data: TechPack }) {
  const [printing, setPrinting] = useState(false);

  function print() {
    setPrinting(true);
    // Let React mark this sheet as the print target before the dialog opens.
    requestAnimationFrame(() => {
      window.print();
      setPrinting(false);
    });
  }

  function downloadJson() {
    // Leave the embedded images out: the JSON is the spec for the factory or a PLM import.
    const spec = JSON.stringify(data, (key, value) => (["front_sketch", "back_sketch", "reference", "recordId"].includes(key) ? undefined : value), 2);
    const url = URL.createObjectURL(new Blob([spec], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(data.style_name || "techpack").replace(/[^\w-]+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const today = new Date().toLocaleDateString("en-GB");

  return (
    <div>
      <div className="no-print mb-3 flex flex-wrap gap-2">
        <ActionButton primary onClick={print}>
          Print / save as PDF
        </ActionButton>
        <ActionButton onClick={downloadJson}>Download JSON</ActionButton>
      </div>

      <article className={`rounded-xl border border-line bg-card p-5 text-sm ${printing ? "print-target" : ""}`}>
        <header className="flex flex-wrap items-end justify-between gap-2 border-b-2 border-ink pb-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted">Tech pack</div>
            <h3 className="font-display text-3xl leading-none">{data.style_name || data.garment_type}</h3>
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-3 text-xs">
            <dt className="text-muted">Product</dt>
            <dd>{data.garment_type}</dd>
            <dt className="text-muted">Category</dt>
            <dd>{data.category}</dd>
            <dt className="text-muted">Season</dt>
            <dd>{data.season || "—"}</dd>
            <dt className="text-muted">Date</dt>
            <dd>{today}</dd>
          </dl>
        </header>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <SheetImage src={data.reference} caption="Reference" />
          <SheetImage src={data.front_sketch} caption="Front flat" />
          <SheetImage src={data.back_sketch} caption="Back flat" />
        </div>

        <H>Description</H>
        <p>{data.description}</p>
        <p className="mt-1 text-muted">Fit: {data.fit}</p>

        <H>Bill of materials — fabrics</H>
        <Table head={MATERIAL_HEAD} rows={materialRows(data.materials)} />
        <H>Bill of materials — trims</H>
        <Table head={TRIM_HEAD} rows={trimRows(data.trims)} />

        <H>Colours</H>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {data.colours.map((c, i) => (
            <Swatch key={i} c={c} compact />
          ))}
        </div>

        <H>Construction</H>
        <Table head={["Area", "Detail"]} rows={data.construction.map((c) => [c.area, c.detail])} />

        <H>Stitching</H>
        <Table head={["Seam", "Stitch type", "SPI"]} rows={data.stitching.map((s) => [s.seam, s.stitch_type, s.spi])} />

        <H>Measurements (sample size M, cm)</H>
        <Table head={["Code", "Point of measure", "M", "Tol ±"]} rows={data.measurements.map((m) => [m.code, m.point, m.size_m, m.tolerance])} />

        <div className="grid gap-x-6 sm:grid-cols-2">
          <div>
            <H>Labels & packaging</H>
            <ul className="list-disc space-y-0.5 pl-4">
              {data.labels_and_packaging.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
          <div>
            <H>Care</H>
            <ul className="list-disc space-y-0.5 pl-4">
              {data.care.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        </div>

        <H>Notes & points to confirm</H>
        <ul className="list-disc space-y-0.5 pl-4">
          {data.notes.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
        <p className="mt-4 border-t border-line pt-2 text-[10px] text-muted">
          Generated by AI from images. Measurements, compositions and weights are estimates — confirm them on a sample.
        </p>
      </article>
    </div>
  );
}
