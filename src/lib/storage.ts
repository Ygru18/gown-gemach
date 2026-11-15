import "server-only";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEnv, isLocalTestMode } from "@/lib/env";

// Photos live in a PRIVATE Supabase Storage bucket. Nothing is publicly
// readable: the server issues short-lived signed URLs to signed-in staff.
// The browser uploads straight to Storage with a one-time signed upload URL
// (so large phone photos never pass through a size-limited function).

export const SIGNED_URL_TTL_SECONDS = 60 * 60;
const LOCAL_DIR = path.join(process.cwd(), ".local-storage");

function bucket() {
  return getEnv().SUPABASE_STORAGE_BUCKET;
}

export interface UploadTarget {
  path: string;
  /** Absolute URL to PUT the file to. */
  uploadUrl: string;
  token: string | null;
}

export function newPhotoPaths(gownId: string) {
  const id = randomUUID();
  return { full: `gowns/${gownId}/${id}.jpg`, thumb: `gowns/${gownId}/${id}_thumb.jpg` };
}

export function isPathForGown(p: string, gownId: string): boolean {
  return new RegExp(`^gowns/${gownId}/[0-9a-f-]{36}(_thumb)?\\.jpg$`).test(p);
}

export async function createUploadTarget(objectPath: string): Promise<UploadTarget> {
  if (isLocalTestMode()) {
    return { path: objectPath, uploadUrl: `/api/local-storage/${objectPath}`, token: null };
  }
  const { data, error } = await createAdminClient().storage.from(bucket()).createSignedUploadUrl(objectPath);
  if (error || !data) throw new Error(`Could not prepare photo upload: ${error?.message ?? "unknown error"}`);
  return { path: objectPath, uploadUrl: data.signedUrl, token: data.token };
}

export async function signedUrls(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return out;
  if (isLocalTestMode()) {
    for (const p of unique) out.set(p, `/api/local-storage/${p}`);
    return out;
  }
  const { data, error } = await createAdminClient().storage.from(bucket()).createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    console.error("createSignedUrls failed", error);
    return out;
  }
  for (const row of data) if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
  return out;
}

export async function removeObjects(paths: string[]): Promise<void> {
  const list = paths.filter(Boolean);
  if (list.length === 0) return;
  if (isLocalTestMode()) {
    await Promise.all(list.map((p) => fs.rm(localPath(p), { force: true })));
    return;
  }
  const { error } = await createAdminClient().storage.from(bucket()).remove(list);
  if (error) console.error("Storage remove failed", error);
}

export function localPath(objectPath: string): string {
  const resolved = path.resolve(LOCAL_DIR, objectPath);
  if (!resolved.startsWith(LOCAL_DIR + path.sep)) throw new Error("Invalid path");
  return resolved;
}
