import Link from "next/link";
import { AlertTriangle, Phone } from "lucide-react";
import type { UpcomingConflictWarning } from "@/lib/services/dashboard";
import { formatDate } from "@/lib/dates";
import { formatPhone, gownCode, reservationCode } from "@/lib/format";
import { cx, GownSilhouette, Ornament } from "./ui";

export function GownThumb({ url, alt, className }: { url: string | null | undefined; alt: string; className?: string }) {
  return (
    <div className={cx("relative overflow-hidden bg-gradient-to-b from-champagne-50 to-blush-50", className)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center text-blush-300">
          <GownSilhouette className="h-3/5 w-3/5" />
        </div>
      )}
    </div>
  );
}

export function Dedication({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cx("relative overflow-hidden rounded-[var(--radius-card)] border border-gold-300/60 bg-gradient-to-br from-blush-50 via-ivory to-champagne-50 text-center shadow-soft", compact ? "px-6 py-6" : "px-6 py-9 sm:px-12")}>
      <div className="pointer-events-none absolute -top-16 -left-16 h-48 w-48 rounded-full bg-blush-100/60 blur-2xl" />
      <div className="pointer-events-none absolute -right-16 -bottom-16 h-48 w-48 rounded-full bg-champagne-100/80 blur-2xl" />
      <div className="relative">
        <p className="eyebrow">In Loving Memory</p>
        <Ornament className="my-3.5" />
        <p className={cx("mx-auto max-w-2xl font-display leading-snug text-ink italic", compact ? "text-xl" : "text-[1.55rem] sm:text-[1.9rem]")}>
          Sharing beauty, kindness and generosity in loving memory of Chaya Surah Feldman.
        </p>
      </div>
    </div>
  );
}

export function OverdueUpcomingWarning({ warnings }: { warnings: UpcomingConflictWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="space-y-3" role="alert">
      {warnings.map((w) => (
        <div key={w.customerId} className="overflow-hidden rounded-[var(--radius-card)] border-2 border-red-200 bg-gradient-to-r from-red-50 to-blush-50 shadow-soft">
          <div className="flex items-start gap-3 border-b border-red-100 px-5 py-3.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-red-100 text-red-700">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[13px] font-semibold tracking-[0.12em] text-red-800 uppercase">Attention</p>
              <p className="text-[15px] text-red-900">This customer has an overdue gown and another reservation scheduled for an upcoming date.</p>
            </div>
          </div>
          <div className="grid gap-4 px-5 py-4 sm:grid-cols-3">
            <div>
              <p className="text-[11px] tracking-[0.14em] text-muted uppercase">Customer</p>
              <Link href={`/customers/${w.customerId}`} className="font-display text-xl font-semibold text-ink hover:text-blush-700">
                {w.customerName}
              </Link>
              <a href={`tel:${w.customerPhone}`} className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-soft hover:text-blush-700">
                <Phone className="h-3.5 w-3.5" /> {formatPhone(w.customerPhone)}
              </a>
            </div>
            <div>
              <p className="text-[11px] tracking-[0.14em] text-muted uppercase">Overdue gown</p>
              {w.overdue.map((o) => (
                <div key={o.itemId} className="text-sm">
                  <Link href={`/reservations/${o.reservationId}`} className="font-medium text-ink hover:text-blush-700">
                    {gownCode(o.gownNumber)} · {o.gownDescription}
                  </Link>
                  <p className="text-ink-soft">
                    Expected {formatDate(o.expectedReturnDate)} · <span className="font-semibold text-red-700">{o.daysOverdue} day{o.daysOverdue === 1 ? "" : "s"} overdue</span>
                  </p>
                </div>
              ))}
            </div>
            <div>
              <p className="text-[11px] tracking-[0.14em] text-muted uppercase">Upcoming reservation</p>
              {w.upcoming.map((u) => (
                <div key={u.itemId} className="text-sm">
                  <Link href={`/reservations/${u.reservationId}`} className="font-medium text-ink hover:text-blush-700">
                    {reservationCode(u.reservationNumber)} · {gownCode(u.gownNumber)}
                  </Link>
                  <p className="text-ink-soft">
                    Pickup {formatDate(u.pickupDate)} {u.status === "PENDING" ? "(pending)" : ""}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <p className="border-t border-red-100 bg-white/50 px-5 py-2 text-[12.5px] text-ink-soft">Nothing has been cancelled automatically. Please contact the customer and decide how to proceed.</p>
        </div>
      ))}
    </div>
  );
}
