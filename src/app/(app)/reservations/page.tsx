import Link from "next/link";
import { Plus, List, CalendarDays, CalendarHeart } from "lucide-react";
import { requireStaffPage } from "@/lib/auth/session";
import { listReservations, calendarItems, displayReservationStatus } from "@/lib/services/reservations";
import { getOverdueWithUpcoming } from "@/lib/services/dashboard";
import { getSettings } from "@/lib/services/settings";
import { summarizeFinances } from "@/lib/finance";
import { addDays, formatDate, todayYmd } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { formatPhone, gownCode, reservationCode } from "@/lib/format";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { FilterBar, ViewToggle } from "@/components/FilterBar";
import { OverdueUpcomingWarning } from "@/components/bits";
import { PaymentStatusBadge, ReservationStatusBadge } from "@/components/status";
import { MonthCalendar, toCalItems } from "@/components/Calendar";

export const metadata = { title: "Reservations" };

export default async function ReservationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireStaffPage();
  const sp = await searchParams;
  const settings = await getSettings();
  const today = todayYmd(settings.timezone);
  const warnings = await getOverdueWithUpcoming(today);
  const view = sp.view === "calendar" ? "calendar" : "list";

  let content: React.ReactNode;
  if (view === "calendar") {
    const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7);
    const from = addDays(`${month}-01`, -7);
    const to = addDays(`${month}-01`, 45);
    const items = toCalItems(await calendarItems(from, to));
    content = <MonthCalendar month={month} items={items} today={today} baseHref={(m) => `/reservations?view=calendar&month=${m}`} />;
  } else {
    const rows = await listReservations({ q: sp.q, status: sp.status, from: sp.from, to: sp.to }, today);
    content =
      rows.length === 0 ? (
        <Card>
          <EmptyState icon={<CalendarHeart className="h-6 w-6" />} title="No reservations found" action={<LinkButton href="/reservations/new">New reservation</LinkButton>}>
            {sp.status || sp.q ? "Try another filter." : "Create a reservation from here, from a gown, or from a customer's profile."}
          </EmptyState>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-elegant">
              <thead>
                <tr><th>Reservation</th><th>Customer</th><th>Gowns</th><th>Pickup</th><th>Return</th><th>Fee</th><th>Balance</th><th>Payment</th><th>Status</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const live = r.items.filter((i) => i.status !== "CANCELLED");
                  const shown = live.length ? live : r.items;
                  const money = summarizeFinances({ status: r.status, itemFeesCents: live.map((i) => i.rentalFeeCents), depositRequiredCents: 0, payments: r.payments, deposits: r.deposits });
                  const firstPickup = shown.map((i) => i.actualPickupDate ?? i.confirmedPickupDate ?? i.requestedPickupDate).sort((a, b) => a.getTime() - b.getTime())[0];
                  const lastReturn = shown.map((i) => i.expectedReturnDate).sort((a, b) => b.getTime() - a.getTime())[0];
                  return (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap"><Link href={`/reservations/${r.id}`} className="font-medium text-gold-600 hover:underline">{reservationCode(r.number)}</Link></td>
                      <td className="min-w-[10rem]">
                        <Link href={`/reservations/${r.id}`} className="font-medium hover:text-blush-700">{r.customer.fullName}</Link>
                        <p className="text-[12px] text-muted">{formatPhone(r.customer.phone)}</p>
                      </td>
                      <td className="min-w-[10rem] text-ink-soft">{shown.map((i) => gownCode(i.gown.number)).join(", ")}</td>
                      <td className="whitespace-nowrap">{formatDate(firstPickup, "short")}</td>
                      <td className="whitespace-nowrap">{formatDate(lastReturn, "short")}</td>
                      <td>{formatCents(money.rentalFeeCents)}</td>
                      <td className={money.balanceDueCents ? "text-[#93602a]" : ""}>{formatCents(money.balanceDueCents)}</td>
                      <td><PaymentStatusBadge status={money.paymentStatus} /></td>
                      <td><ReservationStatusBadge status={displayReservationStatus(r, today)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      );
  }

  return (
    <div>
      <PageHeader eyebrow="Reservations" title="Reservations" subtitle="Pending requests, confirmed rentals, pickups and returns." actions={<LinkButton href="/reservations/new"><Plus className="h-4 w-4" /> New reservation</LinkButton>} />
      {warnings.length ? <div className="mb-6"><OverdueUpcomingWarning warnings={warnings} /></div> : null}
      <FilterBar
        placeholder="Search by reservation # (R-0001), customer name, phone, or gown (G-0012)…"
        extra={<ViewToggle options={[{ value: "list", label: "List", icon: <List className="h-4 w-4" /> }, { value: "calendar", label: "Calendar", icon: <CalendarDays className="h-4 w-4" /> }]} />}
        filters={
          view === "list"
            ? [
                {
                  name: "status",
                  label: "Status",
                  type: "select",
                  options: [
                    { value: "", label: "Active (pending, confirmed, out)" },
                    { value: "PENDING", label: "Pending" },
                    { value: "CONFIRMED", label: "Confirmed" },
                    { value: "CHECKED_OUT", label: "Checked out" },
                    { value: "OVERDUE", label: "Overdue" },
                    { value: "RETURNED", label: "Returned" },
                    { value: "CANCELLED", label: "Cancelled" },
                    { value: "all", label: "All reservations" },
                  ],
                },
                { name: "from", label: "Dates from", type: "date" },
                { name: "to", label: "Dates to", type: "date" },
              ]
            : []
        }
      />
      {content}
    </div>
  );
}
