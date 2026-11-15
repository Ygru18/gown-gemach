"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star, Trash2, ChevronLeft, ChevronRight, X, Loader2, Expand } from "lucide-react";
import type { ActionResult } from "@/lib/actionTypes";
import { buttonClass, cx, GownSilhouette } from "./ui";
import { ConfirmDialog, useToast } from "./forms";
import { PhotoPicker } from "./PhotoPicker";
import { uploadPhotos, type PrepareFn } from "./photoUpload";

export interface GalleryPhoto {
  id: string;
  url: string | null;
  thumbUrl: string | null;
  isPrimary: boolean;
  kind: "GALLERY" | "DAMAGE";
  caption?: string | null;
}

export function GownGallery({
  gownId,
  photos,
  canEdit,
  prepareUploads,
  registerPhotos,
  setPrimary,
  removePhoto,
  startWithUploader,
}: {
  gownId: string;
  photos: GalleryPhoto[];
  canEdit: boolean;
  prepareUploads: PrepareFn;
  registerPhotos: (gownId: string, refs: { full: string; thumb: string | null }[]) => Promise<ActionResult>;
  setPrimary: (photoId: string) => Promise<ActionResult>;
  removePhoto: (photoId: string) => Promise<ActionResult>;
  startWithUploader?: boolean;
}) {
  const gallery = photos.filter((p) => p.kind === "GALLERY");
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [adding, setAdding] = useState(Boolean(startWithUploader) && gallery.length === 0);
  const [progress, setProgress] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const current = gallery[Math.min(index, Math.max(0, gallery.length - 1))];

  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast("success", r.message ?? "Done");
      else toast("error", r.error ?? "Something went wrong");
      router.refresh();
    });

  const doUpload = () =>
    start(async () => {
      try {
        setProgress(`Uploading 0 of ${files.length}…`);
        const refs = await uploadPhotos(gownId, files, prepareUploads, (d, t) => setProgress(`Uploading ${d} of ${t}…`));
        const r = await registerPhotos(gownId, refs);
        if (!r.ok) throw new Error(r.error);
        toast("success", r.message ?? "Photos added");
        setFiles([]);
        setAdding(false);
        router.refresh();
      } catch (e) {
        toast("error", (e as Error).message || "Upload failed");
      } finally {
        setProgress(null);
      }
    });

  return (
    <div>
      <div className="relative overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-b from-champagne-50 to-blush-50 ring-1 ring-line">
        {current?.url ? (
          <button type="button" className="group block w-full" onClick={() => setLightbox(gallery.indexOf(current))} aria-label="View larger">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current.url} alt="Gown photograph" className="aspect-[3/4] w-full object-cover" />
            <span className="absolute right-3 bottom-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-ink-soft opacity-0 shadow transition group-hover:opacity-100">
              <Expand className="h-4 w-4" />
            </span>
          </button>
        ) : (
          <div className="grid aspect-[3/4] place-items-center text-blush-300">
            <div className="flex flex-col items-center gap-3">
              <GownSilhouette className="h-40 w-32" />
              <span className="text-sm text-muted">No photographs yet</span>
            </div>
          </div>
        )}
        {current?.isPrimary ? <span className="absolute top-3 left-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium tracking-wide text-gold-600 shadow-sm">MAIN PHOTO</span> : null}
      </div>

      {gallery.length > 0 ? (
        <div className="mt-3 grid grid-cols-5 gap-2">
          {gallery.map((p, i) => (
            <button key={p.id} type="button" onClick={() => setIndex(i)} className={cx("relative aspect-square overflow-hidden rounded-xl ring-2 transition", i === index ? "ring-gold-400" : "ring-transparent hover:ring-line-strong")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.thumbUrl ? <img src={p.thumbUrl} alt="" className="h-full w-full object-cover" /> : <span className="block h-full w-full bg-champagne-50" />}
              {p.isPrimary ? <Star className="absolute top-1 right-1 h-3.5 w-3.5 fill-gold-400 text-gold-500" /> : null}
            </button>
          ))}
        </div>
      ) : null}

      {canEdit ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {current && !current.isPrimary ? (
            <button type="button" className={buttonClass("secondary", "sm")} disabled={pending} onClick={() => run(() => setPrimary(current.id))}>
              <Star className="h-3.5 w-3.5" /> Make main photo
            </button>
          ) : null}
          {current ? (
            <button type="button" className={buttonClass("ghost", "sm")} disabled={pending} onClick={() => setConfirmDelete(current.id)}>
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </button>
          ) : null}
          {!adding ? (
            <button type="button" className={buttonClass("secondary", "sm", "ml-auto")} onClick={() => setAdding(true)}>
              + Add photos
            </button>
          ) : null}
        </div>
      ) : null}

      {adding ? (
        <div className="mt-4 rounded-2xl border border-line bg-white/70 p-4">
          <PhotoPicker files={files} onChange={setFiles} compact label="Choose photos" />
          <div className="mt-3 flex items-center justify-end gap-2">
            {progress ? <span className="mr-auto text-[13px] text-muted">{progress}</span> : null}
            <button type="button" className={buttonClass("ghost", "sm")} onClick={() => { setAdding(false); setFiles([]); }}>Cancel</button>
            <button type="button" className={buttonClass("primary", "sm")} disabled={!files.length || pending} onClick={doUpload}>
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Upload {files.length || ""} photo{files.length === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      ) : null}

      {lightbox !== null && gallery[lightbox] ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/85 p-4" onClick={() => setLightbox(null)} role="dialog" aria-label="Photo viewer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={gallery[lightbox]!.url ?? ""} alt="" className="max-h-[92dvh] max-w-full rounded-xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <button className="absolute top-4 right-4 rounded-full bg-white/15 p-2 text-white hover:bg-white/25" onClick={() => setLightbox(null)} aria-label="Close"><X className="h-6 w-6" /></button>
          {gallery.length > 1 ? (
            <>
              <button className="absolute left-3 rounded-full bg-white/15 p-2 text-white hover:bg-white/25" onClick={(e) => { e.stopPropagation(); setLightbox((lightbox - 1 + gallery.length) % gallery.length); }} aria-label="Previous"><ChevronLeft className="h-7 w-7" /></button>
              <button className="absolute right-3 rounded-full bg-white/15 p-2 text-white hover:bg-white/25" onClick={(e) => { e.stopPropagation(); setLightbox((lightbox + 1) % gallery.length); }} aria-label="Next"><ChevronRight className="h-7 w-7" /></button>
            </>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Remove this photo?"
        body="The photograph will be permanently removed from this gown."
        confirmLabel="Remove photo"
        danger
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          const id = confirmDelete!;
          setConfirmDelete(null);
          setIndex(0);
          run(() => removePhoto(id));
        }}
      />
    </div>
  );
}

export function DamagePhotos({ photos }: { photos: { id: string; url: string | null; thumbUrl: string | null }[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!photos.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {photos.map((p) => (
        <button key={p.id} type="button" onClick={() => setOpen(p.url)} className="h-16 w-16 overflow-hidden rounded-lg ring-1 ring-line hover:ring-gold-300">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.thumbUrl ? <img src={p.thumbUrl} alt="Damage photo" className="h-full w-full object-cover" /> : null}
        </button>
      ))}
      {open ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/85 p-4" onClick={() => setOpen(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={open} alt="" className="max-h-[92dvh] max-w-full rounded-xl object-contain" />
        </div>
      ) : null}
    </div>
  );
}
