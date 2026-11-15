import "server-only";
import { signedUrls } from "./storage";

type P = { storagePath: string; thumbPath: string | null };

/** Signs the thumbnail (or full image) of each photo in one batch. */
export async function thumbUrls<T extends { photos: P[] }>(rows: T[]): Promise<(T & { photoUrl: string | null })[]> {
  const paths = rows.flatMap((r) => r.photos.slice(0, 1).map((p) => p.thumbPath ?? p.storagePath));
  const urls = await signedUrls(paths);
  return rows.map((r) => {
    const p = r.photos[0];
    return { ...r, photoUrl: p ? (urls.get(p.thumbPath ?? p.storagePath) ?? null) : null };
  });
}
