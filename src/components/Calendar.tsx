import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, fromDbDate } from "@/lib/dates";
import { cx } from "./ui";

export interface CalItem {
  id: string;
  status: string;
  pickup: string;
  expectedReturn: string;
  actualReturn: string | null;
  gownNumber: number;
  customer: string;
  reservationId: string;
}

const code = (n: number) => `G-${String(n).padStart(4, "0")}`;

export function MonthCalendar({ month, items, today, baseHref }: { month: string; items: CalItem[]; today: string; baseHref: (m: string) => string }) {
  const first = `${month}-01`;
  const firstDate = new Date(`${first}T00:00:00Z`);
  const startOffset = firstDate.getUTCDay();
  const gridStart = addDays(first, -startOffset);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const prev = new Date(firstDate);
  prev.setUTCMonth(prev.getUTCMonth() - 1);
  const next = new Date(firstDate);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const label = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" }).format(firstDate);

  const events = (d: string) => {
    const out: { key: string; kind: "pickup" | "return" | "overdue" | "out"; tone: string; text: string; href: string }[] = [];
    for (const it of items) {
      const overdue = it.status === "CHECKED_OUT" && it.expectedReturn < today;
      if (it.pickup === d && it.status !== "CANCELLED") {
        out.push({
          key: `p${it.id}`,
          kind: "pickup",
          tone: it.status === "PENDING" ? "bg-champagne-100 text-[#86672c] ring-champagne-200 border-dashed" : "bg-blush-100 text-blush-700 ring-blush-200",
          text: `↑ ${code(it.gownNumber)} ${it.customer}`,
          href: `/reservations/${it.reservationId}`,
        });
      }
      if (it.expectedReturn === d && it.status !== "CANCELLED") {
        out.push({
          key: `r${it.id}`,
          kind: "return",
          tone: overdue ? "bg-[#fde4e4] text-[#a2353a] ring-[#f5c6c8]" : it.status === "RETURNED" ? "bg-[#ebf4ee] text-[#3d6a4c] ring-[#cfe5d6]" : it.status === "CHECKED_OUT" ? "bg-[#f0e8f4] text-[#6a4b7c] ring-[#e0d0ea]" : "bg-white text-ink-soft ring-line-strong",
          text: `↓ ${code(it.gownNumber)} ${it.customer}`,
          href: `/reservations/${it.reservationId}`,
        });
      }
      if (overdue && d === today) {
        out.push({ key: `o${it.id}`, kind: "overdue", tone: "bg-[#a2353a] text-white ring-[#a2353a]", text: `Overdue ${code(it.gownNumber)} ${it.customer}`, href: `/reservations/${it.reservationId}` });
      }
    }
    return out;
  };
  const outCount = (d: string) =>
    items.filter((it) => it.status === "CHECKED_OUT" ? it.pickup <= d && d <= (it.expectedReturn < today ? today : it.expectedReturn) : it.status === "RETURNED" && it.actualReturn ? it.pickup <= d && d < it.actualReturn : false).length;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <Link href={baseHref(`${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`)} className="rounded-full p-2 text-ink-soft hover:bg-blush-50" aria-label="Previous month"><ChevronLeft className="h-5 w-5" /></Link>
        <div className="text-center">
          <h2 className="font-display text-2xl font-semibold">{label}</h2>
          <Link href={baseHref(today.slice(0, 7))} className="text-[12px] text-gold-600 hover:underline">Today</Link>
        </div>
        <Link href={baseHref(`${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`)} className="rounded-full p-2 text-ink-soft hover:bg-blush-50" aria-label="Next month"><ChevronRight className="h-5 w-5" /></Link>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-b border-line px-5 py-2.5 text-[12px] text-ink-soft">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-champagne-300 bg-champagne-100" /> Pending pickup</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blush-200" /> Confirmed pickup</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#e0d0ea]" /> Return due (checked out)</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#cfe5d6]" /> Returned</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#f5c6c8]" /> Overdue</span>
        <span className="flex items-center gap-1.5"><span className="font-medium text-[#6a4b7c]">•3 out</span> gowns checked out that day</span>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[720px] grid-cols-7">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="border-b border-line bg-champagne-50/60 px-2 py-2 text-center text-[11px] tracking-[0.14em] text-muted uppercase">{d}</div>
          ))}
          {days.map((d) => {
            const inMonth = d.slice(0, 7) === month;
            const ev = events(d);
            const out = outCount(d);
            return (
              <div key={d} className={cx("min-h-[118px] border-r border-b border-line/70 p-1.5", !inMonth && "bg-page/60", d === today && "bg-blush-50/50")}>
                <div className="mb-1 flex items-center justify-between px-1">
                  <span className={cx("grid h-6 w-6 place-items-center rounded-full text-[12.5px]", d === today ? "bg-blush-600 font-semibold text-white" : inMonth ? "text-ink" : "text-muted/60")}>{Number(d.slice(8))}</span>
                  {out ? <span className="text-[10.5px] font-medium text-[#6a4b7c]">•{out} out</span> : null}
                </div>
                <div className="space-y-1">
                  {ev.slice(0, 4).map((e) => (
                    <Link key={e.key} href={e.href} className={cx("block truncate rounded-md border border-transparent px-1.5 py-0.5 text-[11px] ring-1 ring-inset", e.tone)} title={e.text}>
                      {e.text}
                    </Link>
                  ))}
                  {ev.length > 4 ? <p className="px-1 text-[10.5px] text-muted">+{ev.length - 4} more</p> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function toCalItems(rows: { id: string; status: string; requestedPickupDate: Date; confirmedPickupDate: Date | null; actualPickupDate: Date | null; expectedReturnDate: Date; actualReturnDate: Date | null; gown: { number: number }; reservation: { id: string; customer: { fullName: string } } }[]): CalItem[] {
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    pickup: fromDbDate(r.actualPickupDate ?? r.confirmedPickupDate ?? r.requestedPickupDate),
    expectedReturn: fromDbDate(r.expectedReturnDate),
    actualReturn: r.actualReturnDate ? fromDbDate(r.actualReturnDate) : null,
    gownNumber: r.gown.number,
    customer: r.reservation.customer.fullName,
    reservationId: r.reservation.id,
  }));
}
