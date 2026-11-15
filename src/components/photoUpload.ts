"use client";

import type { ActionResult } from "@/lib/actionTypes";

type Target = { path: string; uploadUrl: string; token: string | null };
export type PrepareFn = (gownId: string, count: number) => Promise<ActionResult<{ full: Target; thumb: Target }[]>>;

/** Downscales a photo in the browser so uploads are fast and small. */
export async function resizeImage(file: File, maxSide: number, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  let width: number, height: number, source: CanvasImageSource;
  if (bitmap) {
    width = bitmap.width;
    height = bitmap.height;
    source = bitmap;
  } else {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error(`Could not read ${file.name}. Please use a JPEG or PNG photo.`));
      i.src = URL.createObjectURL(file);
    });
    width = img.naturalWidth;
    height = img.naturalHeight;
    source = img;
  }
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser could not process the photo.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not compress the photo."))), "image/jpeg", quality));
}

async function put(target: Target, blob: Blob) {
  let res: Response;
  if (target.uploadUrl.startsWith("/api/local-storage/")) {
    res = await fetch(target.uploadUrl, { method: "PUT", body: blob, headers: { "content-type": "image/jpeg" } });
  } else {
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", blob, "photo.jpg");
    res = await fetch(target.uploadUrl, {
      method: "PUT",
      body,
      headers: { "x-upsert": "false", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" },
    });
  }
  if (!res.ok) throw new Error(`Photo upload failed (${res.status}). Please try again.`);
}

/** Resizes and uploads photos; returns the storage paths to register. */
export async function uploadPhotos(gownId: string, files: File[], prepare: PrepareFn, onProgress?: (done: number, total: number) => void) {
  const prep = await prepare(gownId, files.length);
  if (!prep.ok || !prep.data) throw new Error(prep.error ?? "Could not prepare the upload.");
  const refs: { full: string; thumb: string | null }[] = [];
  let done = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const t = prep.data[i]!;
    const [full, thumb] = await Promise.all([resizeImage(file, 2000, 0.86), resizeImage(file, 640, 0.8)]);
    await put(t.full, full);
    await put(t.thumb, thumb);
    refs.push({ full: t.full.path, thumb: t.thumb.path });
    onProgress?.(++done, files.length);
  }
  return refs;
}
