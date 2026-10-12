"use client";

export type Settings = {
  geminiKey: string;
  falKey: string;
  /** Gemini model that returns images (generation and editing). */
  imageModel: string;
  /** Gemini model that reads images and answers in JSON (analysis tasks). */
  textModel: string;
  videoModel: string;
  upscaleModel: string;
};

export const DEFAULT_SETTINGS: Settings = {
  geminiKey: "",
  falKey: "",
  imageModel: "gemini-3.1-flash-image",
  textModel: "gemini-3.8-flash",
  videoModel: "fal-ai/kling-video/v3/standard/image-to-video",
  upscaleModel: "clarityai/crystal-upscaler",
};

export const IMAGE_MODEL_SUGGESTIONS = [
  { value: "gemini-3.1-flash-image", label: "Nano Banana 2 (fast, balanced)" },
  { value: "gemini-3-pro-image", label: "Nano Banana Pro (highest quality)" },
  { value: "gemini-nano-banana-2.1", label: "Nano Banana 2.1" },
  { value: "gemini-3.1-flash-lite-image", label: "Nano Banana 2 Lite (cheapest)" },
];

const STORAGE_KEY = "open-fashion-studio.settings";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage blocked (private mode): settings live for this session only.
  }
}
