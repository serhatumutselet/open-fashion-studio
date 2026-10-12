"use client";

import type { Settings } from "../settings";

type Submit = { request_id: string; status_url: string; response_url: string; cancel_url?: string };
type Status = { status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED"; queue_position?: number; error?: string };

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Cancelled", "AbortError"));
    });
  });

async function readJson(res: Response, what: string) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = json?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d: { loc?: string[]; msg?: string }) => `${d.loc?.join(".")}: ${d.msg}`).join("; ")
          : res.statusText;
    throw new Error(`fal ${what} error ${res.status}: ${message}`);
  }
  return json;
}

/**
 * Run a fal model through its queue: submit, poll until it completes, read the result.
 * Image inputs may be data URLs; fal accepts them wherever it takes a file URL.
 */
export async function runFal<T>(
  settings: Settings,
  model: string,
  input: Record<string, unknown>,
  { progress, signal }: { progress: (m: string) => void; signal: AbortSignal },
): Promise<T> {
  if (!settings.falKey) throw new Error("fal.ai API key is missing. Add it in Settings.");
  const headers = { Authorization: `Key ${settings.falKey}`, "Content-Type": "application/json" };

  const submit: Submit = await readJson(
    await fetch(`https://queue.fal.run/${model}`, {
      method: "POST",
      headers,
      body: JSON.stringify(input),
      signal,
    }),
    "submit",
  );

  const cancel = () => {
    if (submit.cancel_url) fetch(submit.cancel_url, { method: "PUT", headers }).catch(() => {});
  };
  signal.addEventListener("abort", cancel);

  try {
    for (;;) {
      const status: Status = await readJson(await fetch(submit.status_url, { headers, signal }), "status");
      if (status.status === "COMPLETED") {
        if (status.error) throw new Error(`fal: ${status.error}`);
        break;
      }
      progress(
        status.status === "IN_QUEUE"
          ? `In queue${status.queue_position != null ? ` (${status.queue_position})` : ""}…`
          : "Processing…",
      );
      await sleep(2000, signal);
    }
    return (await readJson(await fetch(submit.response_url, { headers, signal }), "result")) as T;
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}
