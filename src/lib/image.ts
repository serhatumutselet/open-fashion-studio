"use client";

/** Read a picked file as a data URL, shrunk so its long edge is at most maxEdge. */
export async function fileToDataUrl(file: File, maxEdge = 2048): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  // Keep PNG for inputs that may carry transparency; JPEG keeps photos small.
  return file.type === "image/png"
    ? canvas.toDataURL("image/png")
    : canvas.toDataURL("image/jpeg", 0.92);
}

export function splitDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = /^data:([^;]+);base64,([\s\S]*)$/.exec(dataUrl);
  if (!match) throw new Error("Could not read the image (expected a data URL).");
  return { mimeType: match[1], data: match[2] };
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Download a provider's hosted file so it outlives the provider's expiry. Falls back to the URL. */
export async function persistUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url);
    if (!res.ok) return url;
    return await blobToDataUrl(await res.blob());
  } catch {
    return url;
  }
}

export async function imageSize(src: string): Promise<{ width: number; height: number }> {
  const img = new Image();
  img.src = src;
  await img.decode();
  return { width: img.naturalWidth, height: img.naturalHeight };
}

export function downloadName(label: string | undefined, src: string): string {
  const ext = src.startsWith("data:")
    ? (/^data:[^/]+\/([a-z0-9+]+)/.exec(src)?.[1] ?? "png").replace("svg+xml", "svg").replace("jpeg", "jpg")
    : (src.split("?")[0].split(".").pop() ?? "png");
  const base = (label ?? "open-fashion-studio").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${base || "open-fashion-studio"}.${ext}`;
}
