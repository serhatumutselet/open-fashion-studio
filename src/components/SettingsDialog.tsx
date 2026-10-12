"use client";

import { useState } from "react";
import { DEFAULT_SETTINGS, IMAGE_MODEL_SUGGESTIONS, type Settings } from "@/lib/settings";

function Row({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function SettingsDialog({ settings, onSave, onClose }: { settings: Settings; onSave: (s: Settings) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(settings);
  const [test, setTest] = useState("");
  const set = (key: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [key]: e.target.value.trim() });

  async function testGemini() {
    setTest("Testing…");
    try {
      const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
        headers: { "x-goog-api-key": draft.geminiKey },
      });
      setTest(res.ok ? "Gemini key works ✓" : `Gemini rejected the key (${res.status}).`);
    } catch {
      setTest("Could not reach Gemini.");
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="w-full max-w-lg rounded-2xl border border-line bg-paper p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="settings-title" className="font-display text-3xl">
          Settings
        </h2>
        <p className="mt-1 text-sm text-muted">
          Your keys are stored only in this browser. Requests go straight from your browser to Google and fal.ai — no server in
          between. On a shared computer, clear your keys when you are done.
        </p>

        <div className="mt-5 space-y-4">
          <Row
            label="Gemini API key"
            hint={
              <>
                For design, photoshoot, editing and analysis tools.{" "}
                <a className="underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                  Get a key
                </a>
              </>
            }
          >
            <div className="flex gap-2">
              <input className="field font-mono" type="password" autoComplete="off" value={draft.geminiKey} onChange={set("geminiKey")} />
              <button type="button" onClick={testGemini} disabled={!draft.geminiKey} className="shrink-0 rounded-lg border border-line px-3 text-sm disabled:opacity-40">
                Test
              </button>
            </div>
          </Row>
          {test && <p className="-mt-2 text-xs">{test}</p>}

          <Row
            label="fal.ai API key"
            hint={
              <>
                For video, 4K upscaling, expanding, transparent backgrounds and SVG.{" "}
                <a className="underline" href="https://fal.ai/dashboard/keys" target="_blank" rel="noreferrer">
                  Get a key
                </a>
              </>
            }
          >
            <input className="field font-mono" type="password" autoComplete="off" value={draft.falKey} onChange={set("falKey")} />
          </Row>

          <details className="rounded-lg border border-line p-3">
            <summary className="cursor-pointer text-sm font-medium">Models</summary>
            <div className="mt-3 space-y-3">
              <Row label="Image model (Gemini)" hint="Change this when your provider releases a new model.">
                <input className="field font-mono" list="image-models" value={draft.imageModel} onChange={set("imageModel")} />
                <datalist id="image-models">
                  {IMAGE_MODEL_SUGGESTIONS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </datalist>
              </Row>
              <Row label="Analysis model (Gemini)">
                <input className="field font-mono" value={draft.textModel} onChange={set("textModel")} />
              </Row>
              <Row label="Video model (fal)">
                <input className="field font-mono" value={draft.videoModel} onChange={set("videoModel")} />
              </Row>
              <Row label="Upscale model (fal)">
                <input className="field font-mono" value={draft.upscaleModel} onChange={set("upscaleModel")} />
              </Row>
              <button
                type="button"
                className="text-xs underline"
                onClick={() => setDraft({ ...DEFAULT_SETTINGS, geminiKey: draft.geminiKey, falKey: draft.falKey })}
              >
                Reset to default models
              </button>
            </div>
          </details>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm">
            Cancel
          </button>
          <button type="button" onClick={() => onSave(draft)} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
