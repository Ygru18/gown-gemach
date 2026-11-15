"use client";

import { useEffect, useMemo, useRef } from "react";
import { Camera, ImagePlus, X } from "lucide-react";
import { cx } from "./ui";

/** Lets staff choose several photos (or take them on a phone) and previews them. */
export function PhotoPicker({ files, onChange, label = "Add photographs", compact }: { files: File[]; onChange: (f: File[]) => void; label?: string; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  return (
    <div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        data-testid="photo-input"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name));
          onChange([...files, ...picked].slice(0, 20));
          e.target.value = "";
        }}
      />
      <div className={cx("grid gap-3", compact ? "grid-cols-4 sm:grid-cols-6" : "grid-cols-3 sm:grid-cols-4 lg:grid-cols-6")}>
        {previews.map((src, i) => (
          <div key={src} className="group relative aspect-[3/4] overflow-hidden rounded-xl ring-1 ring-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="h-full w-full object-cover" />
            {i === 0 && !compact ? <span className="absolute bottom-1.5 left-1.5 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium tracking-wide text-gold-600">MAIN</span> : null}
            <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} className="absolute top-1.5 right-1.5 rounded-full bg-white/90 p-1 text-ink-soft shadow hover:text-red-700" aria-label="Remove photo">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-blush-200 bg-blush-50/40 text-center text-[13px] text-blush-700 transition hover:border-blush-300 hover:bg-blush-50"
        >
          {files.length ? <ImagePlus className="h-6 w-6" /> : <Camera className="h-6 w-6" />}
          <span className="px-2 leading-tight">{label}</span>
        </button>
      </div>
    </div>
  );
}
