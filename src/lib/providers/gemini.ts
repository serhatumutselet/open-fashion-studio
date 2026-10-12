"use client";

import { splitDataUrl } from "../image";
import type { Settings } from "../settings";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** One input image, optionally introduced by a caption that tells the model what it is for. */
export type GeminiImage = { src: string; caption?: string };

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

type GenerateResponse = {
  candidates?: {
    finishReason?: string;
    content?: { parts?: { text?: string; inlineData?: { mimeType: string; data: string } }[] };
    groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] };
  }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
};

function buildParts(prompt: string, images: GeminiImage[]): Part[] {
  const parts: Part[] = [];
  images.forEach((img, i) => {
    parts.push({ text: img.caption ? `Image ${i + 1}: ${img.caption}` : `Image ${i + 1}:` });
    parts.push({ inlineData: splitDataUrl(img.src) });
  });
  parts.push({ text: prompt });
  return parts;
}

async function call(settings: Settings, model: string, body: unknown, signal: AbortSignal): Promise<GenerateResponse> {
  if (!settings.geminiKey) throw new Error("Gemini API key is missing. Add it in Settings.");
  const res = await fetch(`${BASE}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": settings.geminiKey },
    body: JSON.stringify(body),
    signal,
  });
  const json = (await res.json().catch(() => ({}))) as GenerateResponse;
  if (!res.ok) {
    throw new Error(`Gemini (${model}) error ${res.status}: ${json.error?.message ?? res.statusText}`);
  }
  return json;
}

function explainEmpty(json: GenerateResponse): string {
  const blocked = json.promptFeedback?.blockReason;
  if (blocked) return `Gemini blocked the request (${blocked}).`;
  const candidate = json.candidates?.[0];
  const text = candidate?.content?.parts?.find((p) => p.text)?.text;
  if (text) return `Gemini answered with text instead of an image: ${text.slice(0, 300)}`;
  return `Gemini returned nothing (${candidate?.finishReason ?? "unknown reason"}).`;
}

export type ImageOptions = {
  aspectRatio?: string;
  /** "1K" | "2K" | "4K" */
  imageSize?: string;
  signal: AbortSignal;
};

/** Generate or edit one image. Returns it as a data URL. */
export async function generateImage(
  settings: Settings,
  prompt: string,
  images: GeminiImage[],
  { aspectRatio, imageSize, signal }: ImageOptions,
): Promise<string> {
  const imageConfig: Record<string, string> = {};
  if (aspectRatio && aspectRatio !== "auto") imageConfig.aspectRatio = aspectRatio;
  if (imageSize) imageConfig.imageSize = imageSize;

  const json = await call(
    settings,
    settings.imageModel,
    {
      contents: [{ role: "user", parts: buildParts(prompt, images) }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        ...(Object.keys(imageConfig).length ? { imageConfig } : {}),
      },
    },
    signal,
  );

  for (const part of json.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData?.data) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }
  throw new Error(explainEmpty(json));
}

/**
 * Ask the text model about images and get JSON back that matches `schema`
 * (Gemini's OpenAPI-subset schema: types are upper-case, e.g. "OBJECT").
 */
export async function analyze<T>(
  settings: Settings,
  prompt: string,
  images: GeminiImage[],
  schema: object,
  signal: AbortSignal,
): Promise<T> {
  const json = await call(
    settings,
    settings.textModel,
    {
      contents: [{ role: "user", parts: buildParts(prompt, images) }],
      generationConfig: { responseMimeType: "application/json", responseSchema: schema },
    },
    signal,
  );
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
  if (!text) throw new Error(explainEmpty(json));
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Gemini returned invalid JSON: ${text.slice(0, 200)}`);
  }
}

export type Source = { title: string; url: string };

/** Answer in text using Google Search for up-to-date facts, with the web pages it used. */
export async function research(
  settings: Settings,
  prompt: string,
  images: GeminiImage[],
  signal: AbortSignal,
): Promise<{ text: string; sources: Source[] }> {
  const json = await call(
    settings,
    settings.textModel,
    { contents: [{ role: "user", parts: buildParts(prompt, images) }], tools: [{ google_search: {} }] },
    signal,
  );
  const candidate = json.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("").trim();
  if (!text) throw new Error(explainEmpty(json));
  const seen = new Set<string>();
  const sources = (candidate?.groundingMetadata?.groundingChunks ?? []).flatMap((c) => {
    const url = c.web?.uri;
    if (!url || seen.has(url)) return [];
    seen.add(url);
    return [{ title: c.web?.title ?? url, url }];
  });
  return { text, sources };
}
