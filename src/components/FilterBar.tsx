"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { cx } from "./ui";

export interface FilterDef {
  name: string;
  label: string;
  type: "select" | "date";
  options?: { value: string; label: string }[];
}

/** URL-driven search + filters (shareable, back-button friendly). */
export function FilterBar({ placeholder, filters = [], extra }: { placeholder: string; filters?: FilterDef[]; extra?: React.ReactNode }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [pending, start] = useTransition();

  const push = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    start(() => router.push(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };

  useEffect(() => {
    const current = params.get("q") ?? "";
    if (q === current) return;
    const t = setTimeout(() => push({ q }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = filters.some((f) => params.get(f.name)) || params.get("q");

  return (
    <div className="no-print card mb-6 p-3 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="input pl-10" aria-label="Search" type="search" />
          {pending ? <Loader2 className="absolute top-1/2 right-3.5 h-4 w-4 -translate-y-1/2 animate-spin text-muted" /> : null}
        </div>
        {extra}
      </div>
      {filters.length ? (
        <div className="mt-3 flex flex-wrap items-end gap-2.5">
          {filters.map((f) => (
            <label key={f.name} className="flex min-w-[9rem] flex-1 flex-col sm:flex-none">
              <span className="mb-1 pl-1 text-[11px] tracking-[0.12em] text-muted uppercase">{f.label}</span>
              {f.type === "select" ? (
                <select value={params.get(f.name) ?? ""} onChange={(e) => push({ [f.name]: e.target.value })} className={cx("input py-2 text-sm", params.get(f.name) && "border-gold-400 bg-champagne-50")}>
                  {f.options!.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : (
                <input type="date" value={params.get(f.name) ?? ""} onChange={(e) => push({ [f.name]: e.target.value })} className={cx("input py-2 text-sm", params.get(f.name) && "border-gold-400 bg-champagne-50")} />
              )}
            </label>
          ))}
          {active ? (
            <button
              type="button"
              onClick={() => {
                setQ("");
                const keep = new URLSearchParams();
                const view = params.get("view");
                if (view) keep.set("view", view);
                start(() => router.push(`${pathname}${keep.size ? `?${keep}` : ""}`));
              }}
              className="mb-0.5 flex h-10 items-center gap-1.5 rounded-full px-3 text-sm text-blush-700 hover:bg-blush-50"
            >
              <X className="h-4 w-4" /> Clear
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ViewToggle({ options, param = "view" }: { options: { value: string; label: string; icon?: React.ReactNode }[]; param?: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const current = params.get(param) ?? options[0]!.value;
  return (
    <div className="inline-flex rounded-full border border-line-strong bg-white p-1" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={current === o.value}
          onClick={() => {
            const next = new URLSearchParams(params.toString());
            if (o.value === options[0]!.value) next.delete(param);
            else next.set(param, o.value);
            router.push(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
          }}
          className={cx("flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition", current === o.value ? "bg-blush-100 font-medium text-blush-700" : "text-ink-soft hover:text-ink")}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}
