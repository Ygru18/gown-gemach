"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { buttonClass, cx } from "./ui";
import { PrintButton } from "./PrintButton";

const TABS = [
  ["inventory", "Inventory"],
  ["donations", "Donations"],
  ["reservations", "Reservations"],
  ["customers", "Customers"],
  ["overdue", "Overdue"],
  ["financial", "Financial"],
  ["activity", "Activity log"],
] as const;

export function ReportControls({ from, to }: { from: string; to: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = params.get("tab") ?? "inventory";
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params.toString());
    if (v) n.set(k, v);
    else n.delete(k);
    router.push(`${pathname}?${n}`, { scroll: false });
  };
  return (
    <div className="no-print mb-6 space-y-4">
      <div className="flex flex-wrap gap-1.5 rounded-2xl border border-line bg-white/70 p-1.5">
        {TABS.map(([v, l]) => (
          <button key={v} type="button" onClick={() => set("tab", v)} className={cx("rounded-xl px-3.5 py-2 text-sm transition", tab === v ? "bg-blush-100 font-medium text-blush-700" : "text-ink-soft hover:bg-champagne-50")}>
            {l}
          </button>
        ))}
      </div>
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <label className="flex flex-col text-[11px] tracking-[0.12em] text-muted uppercase">From<input type="date" value={from} onChange={(e) => set("from", e.target.value)} className="input mt-1 py-2 text-sm" /></label>
        <label className="flex flex-col text-[11px] tracking-[0.12em] text-muted uppercase">To<input type="date" value={to} onChange={(e) => set("to", e.target.value)} className="input mt-1 py-2 text-sm" /></label>
        <div className="flex flex-wrap gap-1.5">
          {[
            ["This month", () => { const t = to.slice(0, 7); set("from", `${t}-01`); }],
            ["This year", () => set("from", `${to.slice(0, 4)}-01-01`)],
          ].map(([l, fn]) => (
            <button key={l as string} type="button" onClick={fn as () => void} className={buttonClass("ghost", "sm")}>{l as string}</button>
          ))}
        </div>
        <div className="ml-auto"><PrintButton label="Print report" /></div>
      </div>
    </div>
  );
}

export function CsvLink({ report, from, to, label = "CSV" }: { report: string; from: string; to: string; label?: string }) {
  return (
    <a href={`/reports/export?report=${report}&from=${from}&to=${to}`} className={buttonClass("secondary", "sm", "no-print")}>
      <Download className="h-3.5 w-3.5" /> {label}
    </a>
  );
}
