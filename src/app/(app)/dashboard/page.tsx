import Link from "next/link";
import {
  CalendarClock,
  CalendarCheck,
  Clock,
  ClipboardCheck,
  Droplets,
  Scissors,
  CircleSlash,
  AlarmClock,
  Wallet,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Undo2,
  Activity,
  Plus,
  Gift,
} from "lucide-react";
import { requireStaffPage } from "@/lib/auth/session";
import { getDashboard } from "@/lib/services/dashboard";
import { getSettings } from "@/lib/services/settings";
import { todayYmd, formatDate, fromDbDate, diffDays, formatDateTime } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { formatPhone, gownCode, reservationCode } from "@/lib/format";
import { Card, CardHeader, EmptyState, LinkButton, cx, DressIcon } from "@/components/ui";
import { Dedication, GownThumb, OverdueUpcomingWarning } from "@/components/bits";
import { GownStatusBadge, ReservationStatusBadge } from "@/components/status";
import { thumbUrls } from "@/lib/photos";
import { displayReservationStatus } from "@/lib/services/reservations";
import type { ReactNode } from "react";

export const metadata = { title: "Dashboard" };

function Stat({ href, label, value, icon, tone = "blush", sub, alert }: { href: string; label: string; value: ReactNode; icon: ReactNode; tone?: "blush" | "gold" | "green" | "mauve" | "amber" | "sky" | "peach" | "stone" | "red"; sub?: ReactNode; alert?: boolean }) {
  const tones = {
    blush: "bg-blush-50 text-blush-600",
    gold: "bg-champagne-100 text-gold-600",
    green: "bg-[#ebf4ee] text-[#3d6a4c]",
    mauve: "bg-[#f0e8f4] text-[#6a4b7c]",
    amber: "bg-[#fcefdc] text-[#93602a]",
    sky: "bg-[#e6eff7] text-[#3e6285]",
    peach: "bg-[#fce9df] text-[#985237]",
    stone: "bg-[#efebe7] text-[#675e58]",
    red: "bg-[#fde4e4] text-[#a2353a]",
  };
  return (
    <Link
      href={href}
      className={cx(
        "group card flex flex-col gap-3 p-4 transition hover:-translate-y-0.5 hover:border-gold-300 hover:shadow-lift sm:p-5",
        alert && "border-red-200 bg-gradient-to-br from-white to-red-50/60"
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cx("grid h-9 w-9 place-items-center rounded-full", tones[tone])}>{icon}</span>
        <ArrowRight className="h-4 w-4 text-line-strong transition group-hover:translate-x-0.5 group-hover:text-gold-500" />
      </div>
      <div>
        <p className={cx("font-display text-[2rem] leading-none font-semibold", alert ? "text-red-700" : "text-ink")}>{value}</p>
        <p className="mt-1.5 text-[13px] leading-tight text-ink-soft">{label}</p>
        {sub ? <p className="mt-0.5 text-[12px] text-muted">{sub}</p> : null}
      </div>
    </Link>
  );
}

export default async function DashboardPage() {
  const staff = await requireStaffPage();
  const settings = await getSettings();
  const today = todayYmd(settings.timezone);
  const d = await getDashboard(today, settings.upcomingWindowDays);
  const s = d.counts.byStatus;
  const recentGowns = await thumbUrls(d.recentGowns);
  const unavailableOther = s.UNAVAILABLE_OTHER ?? 0;
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: settings.timezone, hour: "numeric", hour12: false }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow mb-2">{formatDate(today, "long")}</p>
          <h1 className="font-display text-[2.3rem] leading-tight font-semibold sm:text-[2.7rem]">
            {greeting}, {staff.fullName.split(" ")[0]}
          </h1>
          <p className="mt-1 text-[15px] text-muted">Here is the whole Gemach at a glance.</p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <LinkButton href="/intake" variant="secondary">
            <Gift className="h-4 w-4" /> Add a gown
          </LinkButton>
          <LinkButton href="/reservations/new">
            <Plus className="h-4 w-4" /> New reservation
          </LinkButton>
        </div>
      </div>

      <Dedication />

      <OverdueUpcomingWarning warnings={d.warnings} />

      <section aria-label="Summary">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          <Stat href="/inventory?status=active" label="Gowns in inventory" value={d.counts.total} icon={<DressIcon />} tone="gold" />
          <Stat href="/inventory?status=AVAILABLE" label="Available gowns" value={s.AVAILABLE ?? 0} icon={<Sparkles className="h-[18px] w-[18px]" />} tone="green" />
          <Stat href="/reservations?status=PENDING" label="Pending reservations" value={d.counts.pendingReservations} icon={<Clock className="h-[18px] w-[18px]" />} tone="gold" />
          <Stat href="/reservations?status=CONFIRMED" label="Confirmed reservations" value={d.counts.confirmedReservations} icon={<CalendarCheck className="h-[18px] w-[18px]" />} tone="blush" />
          <Stat href="/inventory?status=CHECKED_OUT" label="Checked out" value={s.CHECKED_OUT ?? 0} icon={<CalendarClock className="h-[18px] w-[18px]" />} tone="mauve" />
          <Stat href="/returns#inspection" label="Pending inspection" value={s.PENDING_INSPECTION ?? 0} icon={<ClipboardCheck className="h-[18px] w-[18px]" />} tone="amber" />
          <Stat href="/inventory?status=PENDING_CLEANING" label="Pending cleaning" value={s.PENDING_CLEANING ?? 0} icon={<Droplets className="h-[18px] w-[18px]" />} tone="sky" />
          <Stat href="/inventory?status=NEEDS_ALTERATION" label="Needs alterations" value={s.NEEDS_ALTERATION ?? 0} icon={<Scissors className="h-[18px] w-[18px]" />} tone="peach" />
          <Stat href="/inventory?status=UNAVAILABLE_OTHER" label="Other unavailable" value={unavailableOther} icon={<CircleSlash className="h-[18px] w-[18px]" />} tone="stone" />
          <Stat href="/reservations?status=OVERDUE" label="Overdue returns" value={d.counts.overdue} icon={<AlarmClock className="h-[18px] w-[18px]" />} tone="red" alert={d.counts.overdue > 0} />
          <Stat href="/reports?tab=financial#outstanding" label="Outstanding rental payments" value={formatCents(d.money.balanceCents)} sub={`${d.money.balanceCount} reservation${d.money.balanceCount === 1 ? "" : "s"}`} icon={<Wallet className="h-[18px] w-[18px]" />} tone="gold" />
          <Stat href="/reports?tab=financial#deposits" label="Outstanding security deposits" value={formatCents(d.money.depositCents)} sub={`${d.money.depositCount} to collect · ${formatCents(d.money.heldCents)} held`} icon={<ShieldCheck className="h-[18px] w-[18px]" />} tone="blush" />
        </div>
      </section>

      {d.overdue.length ? (
        <Card className="border-red-200">
          <CardHeader title="Overdue returns" subtitle="Gowns past their expected return date" icon={<AlarmClock className="h-[18px] w-[18px]" />} />
          <div className="overflow-x-auto">
            <table className="table-elegant">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Gown</th>
                  <th>Expected back</th>
                  <th>Overdue</th>
                </tr>
              </thead>
              <tbody>
                {d.overdue.map((o) => (
                  <tr key={o.itemId}>
                    <td>
                      <Link className="font-medium hover:text-blush-700" href={`/customers/${o.customerId}`}>{o.customerName}</Link>
                    </td>
                    <td><a href={`tel:${o.customerPhone}`} className="hover:text-blush-700">{formatPhone(o.customerPhone)}</a></td>
                    <td>
                      <Link className="hover:text-blush-700" href={`/reservations/${o.reservationId}`}>{gownCode(o.gownNumber)} · {o.gownDescription}</Link>
                    </td>
                    <td>{formatDate(o.expectedReturnDate)}</td>
                    <td className="font-semibold text-red-700">{o.daysOverdue} day{o.daysOverdue === 1 ? "" : "s"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Upcoming pickups" subtitle={`Next ${settings.upcomingWindowDays} days`} icon={<CalendarClock className="h-[18px] w-[18px]" />} action={<LinkButton href="/reservations?view=calendar" variant="ghost" size="sm">Calendar</LinkButton>} />
          {d.upcomingPickups.length === 0 ? (
            <EmptyState title="No pickups coming up">Confirmed reservations will appear here as their pickup date approaches.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {d.upcomingPickups.map((i) => {
                const late = i.pickupDate < today;
                return (
                  <li key={i.id}>
                    <Link href={`/reservations/${i.reservation.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-champagne-50/60 sm:px-6">
                      <DateChip ymd={i.pickupDate} today={today} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{i.reservation.customer.fullName}</p>
                        <p className="truncate text-[13px] text-muted">{gownCode(i.gown.number)} · {i.gown.description}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <ReservationStatusBadge status={i.status === "PENDING" ? "PENDING" : "CONFIRMED"} />
                        {late ? <span className="text-[11px] text-red-700">pickup date passed</span> : i.gown.status !== "RESERVED" && i.gown.status !== "PENDING_RESERVATION" && i.gown.status !== "AVAILABLE" ? <GownStatusBadge status={i.gown.status} /> : null}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Upcoming returns" subtitle={`Expected back in the next ${settings.upcomingWindowDays} days`} icon={<Undo2 className="h-[18px] w-[18px]" />} action={<LinkButton href="/returns" variant="ghost" size="sm">Returns</LinkButton>} />
          {d.upcomingReturns.length === 0 ? (
            <EmptyState title="No returns expected">Gowns that are checked out will appear here before they are due back.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {d.upcomingReturns.map((i) => (
                <li key={i.id}>
                  <Link href={`/reservations/${i.reservation.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-champagne-50/60 sm:px-6">
                    <DateChip ymd={fromDbDate(i.expectedReturnDate)} today={today} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{i.reservation.customer.fullName}</p>
                      <p className="truncate text-[13px] text-muted">{gownCode(i.gown.number)} · {i.gown.description}</p>
                    </div>
                    <span className="text-[13px] text-ink-soft">{formatPhone(i.reservation.customer.phone)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Recently added gowns" icon={<Gift className="h-[18px] w-[18px]" />} action={<LinkButton href="/inventory" variant="ghost" size="sm">All inventory</LinkButton>} />
        {recentGowns.length === 0 ? (
          <EmptyState title="Your collection starts here" icon={<DressIcon className="h-6 w-6" />} action={<LinkButton href="/intake">Add the first gown</LinkButton>}>
            Record each donated gown with photographs; it will appear in the inventory straight away.
          </EmptyState>
        ) : (
          <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 sm:p-6 lg:grid-cols-6">
            {recentGowns.map((g) => (
              <Link key={g.id} href={`/inventory/${g.id}`} className="group">
                <GownThumb url={g.photoUrl} alt={g.description} className="aspect-[3/4] rounded-2xl ring-1 ring-line transition group-hover:ring-gold-300" />
                <p className="mt-2 text-[12px] tracking-[0.12em] text-gold-600 uppercase">{gownCode(g.number)}</p>
                <p className="truncate text-sm font-medium">{g.description}</p>
                <p className="text-[12px] text-muted">Size {g.size} · {g.color}</p>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Recently returned" icon={<Undo2 className="h-[18px] w-[18px]" />} />
          {d.recentReturns.length === 0 ? (
            <EmptyState title="No returns yet" />
          ) : (
            <ul className="divide-y divide-line">
              {d.recentReturns.map((r) => (
                <li key={r.id} className="px-5 py-3">
                  <Link href={`/inventory/${r.item.gown.id}`} className="font-medium hover:text-blush-700">
                    {gownCode(r.item.gown.number)} · {r.item.gown.description}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted">
                    <span>{formatDate(r.returnDate)} · {r.item.reservation.customer.fullName}</span>
                    <GownStatusBadge status={r.item.gown.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Recent reservations" icon={<CalendarCheck className="h-[18px] w-[18px]" />} />
          {d.recentReservations.length === 0 ? (
            <EmptyState title="No reservations yet" action={<LinkButton href="/reservations/new" size="sm">Create one</LinkButton>} />
          ) : (
            <ul className="divide-y divide-line">
              {d.recentReservations.map((r) => (
                <li key={r.id}>
                  <Link href={`/reservations/${r.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-champagne-50/60">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r.customer.fullName}</p>
                      <p className="text-[12px] text-muted">{reservationCode(r.number)} · {r.items.length} gown{r.items.length === 1 ? "" : "s"}</p>
                    </div>
                    <ReservationStatusBadge status={displayReservationStatus(r, today)} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Recent activity" icon={<Activity className="h-[18px] w-[18px]" />} action={<LinkButton href="/reports?tab=activity" variant="ghost" size="sm">All</LinkButton>} />
          {d.activity.length === 0 ? (
            <EmptyState title="Nothing yet" />
          ) : (
            <ul className="divide-y divide-line">
              {d.activity.map((a) => (
                <li key={a.id} className="px-5 py-2.5">
                  <p className="text-[13.5px] leading-snug">{a.summary}</p>
                  <p className="mt-0.5 text-[11.5px] text-muted">{a.actorName} · {formatDateTime(a.createdAt, settings.timezone)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function DateChip({ ymd, today }: { ymd: string; today: string }) {
  const days = diffDays(today, ymd);
  const label = days === 0 ? "Today" : days === 1 ? "Tomorrow" : days < 0 ? `${-days}d ago` : `in ${days}d`;
  const d = new Date(`${ymd}T00:00:00Z`);
  return (
    <div className={cx("flex w-14 shrink-0 flex-col items-center rounded-xl py-1.5 ring-1", days <= 0 ? "bg-blush-50 ring-blush-200" : "bg-champagne-50 ring-champagne-200")}>
      <span className="text-[10px] tracking-[0.14em] text-muted uppercase">{d.toLocaleString("en-US", { month: "short", timeZone: "UTC" })}</span>
      <span className="font-display text-xl leading-none font-semibold">{d.getUTCDate()}</span>
      <span className={cx("mt-0.5 text-[10px]", days <= 0 ? "text-blush-700" : "text-muted")}>{label}</span>
    </div>
  );
}
