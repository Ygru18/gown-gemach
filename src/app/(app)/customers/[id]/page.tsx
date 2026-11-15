import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarPlus, Pencil, Phone, Mail, MapPin, UserX, UserCheck } from "lucide-react";
import { requireStaffPage } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/services/settings";
import { getOverdueWithUpcoming } from "@/lib/services/dashboard";
import { displayReservationStatus } from "@/lib/services/reservations";
import { summarizeFinances } from "@/lib/finance";
import { formatDate, fromDbDate, todayYmd } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { CONDITION_LABEL, DEPOSIT_KIND_LABEL, PAYMENT_KIND_LABEL, PAYMENT_METHOD_LABEL, customerCode, formatPhone, gownCode, reservationCode } from "@/lib/format";
import { Card, CardHeader, EmptyState, LinkButton, PageHeader, Pill } from "@/components/ui";
import { OverdueUpcomingWarning } from "@/components/bits";
import { ItemStatusBadge, PaymentStatusBadge, ReservationStatusBadge } from "@/components/status";
import { ActionButton } from "@/components/forms";
import { setCustomerArchivedAction } from "@/app/actions/people";
import { isItemOverdue } from "@/lib/gownStatus";

export const metadata = { title: "Customer" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const c = await prisma.customer.findUnique({
    where: { id },
    include: {
      reservations: {
        orderBy: { createdAt: "desc" },
        include: {
          items: { include: { gown: { select: { id: true, number: true, description: true } }, pickup: true, gownReturn: true }, orderBy: { requestedPickupDate: "asc" } },
          payments: true,
          deposits: true,
        },
      },
    },
  });
  if (!c) notFound();
  const settings = await getSettings();
  const today = todayYmd(settings.timezone);
  const warnings = await getOverdueWithUpcoming(today, c.id);

  const withMoney = c.reservations.map((r) => ({
    r,
    status: displayReservationStatus(r, today),
    money: summarizeFinances({
      status: r.status,
      itemFeesCents: r.items.filter((i) => i.status !== "CANCELLED").map((i) => i.rentalFeeCents),
      depositRequiredCents: r.depositRequiredCents,
      payments: r.payments,
      deposits: r.deposits,
    }),
  }));
  const current = withMoney.filter((x) => ["PENDING", "CONFIRMED", "CHECKED_OUT"].includes(x.r.status));
  const previous = withMoney.filter((x) => !["PENDING", "CONFIRMED", "CHECKED_OUT"].includes(x.r.status));
  const items = c.reservations.flatMap((r) => r.items.map((i) => ({ ...i, reservation: r })));
  const borrowed = items.filter((i) => i.pickup);
  const returns = items.filter((i) => i.gownReturn);
  const late = returns.filter((i) => (i.gownReturn?.daysLate ?? 0) > 0);
  const overdueNow = items.filter((i) => isItemOverdue({ status: i.status, expectedReturnDate: fromDbDate(i.expectedReturnDate) }, today));
  const balance = withMoney.reduce((s, x) => s + x.money.balanceDueCents, 0);
  const held = withMoney.reduce((s, x) => s + x.money.depositHeldCents, 0);
  const payments = c.reservations.flatMap((r) => r.payments.map((p) => ({ ...p, rnum: r.number, rid: r.id }))).sort((a, b) => b.paymentDate.getTime() - a.paymentDate.getTime());
  const deposits = c.reservations.flatMap((r) => r.deposits.map((p) => ({ ...p, rnum: r.number, rid: r.id }))).sort((a, b) => b.transactionDate.getTime() - a.transactionDate.getTime());

  const resTable = (rows: typeof withMoney) => (
    <div className="overflow-x-auto">
      <table className="table-elegant">
        <thead><tr><th>Reservation</th><th>Gowns</th><th>Dates</th><th>Fee</th><th>Balance</th><th>Payment</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map(({ r, status, money }) => (
            <tr key={r.id}>
              <td><Link href={`/reservations/${r.id}`} className="font-medium text-gold-600 hover:underline">{reservationCode(r.number)}</Link></td>
              <td className="min-w-[12rem] text-ink-soft">{r.items.map((i) => gownCode(i.gown.number)).join(", ")}</td>
              <td className="whitespace-nowrap text-ink-soft">{r.items[0] ? `${formatDate(r.items[0].confirmedPickupDate ?? r.items[0].requestedPickupDate, "short")} – ${formatDate(r.items[r.items.length - 1]!.expectedReturnDate, "short")}` : "—"}</td>
              <td>{formatCents(money.rentalFeeCents)}</td>
              <td className={money.balanceDueCents ? "font-medium text-[#93602a]" : ""}>{formatCents(money.balanceDueCents)}</td>
              <td><PaymentStatusBadge status={money.paymentStatus} /></td>
              <td><ReservationStatusBadge status={status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      <div className="mb-3 text-sm"><Link href="/customers" className="text-muted hover:text-blush-700">← Customers</Link></div>
      <PageHeader
        eyebrow={customerCode(c.number)}
        title={<span className="flex flex-wrap items-center gap-3">{c.fullName}{c.isArchived ? <Pill tone="grey">Inactive</Pill> : null}</span>}
        actions={
          <>
            <LinkButton href={`/reservations/new?customerId=${c.id}`}><CalendarPlus className="h-4 w-4" /> New reservation</LinkButton>
            <LinkButton href={`/customers/${c.id}/edit`} variant="secondary"><Pencil className="h-4 w-4" /> Edit</LinkButton>
            {c.isArchived ? (
              <ActionButton action={setCustomerArchivedAction.bind(null, c.id, false)} label="Reactivate" icon={<UserCheck className="h-4 w-4" />} />
            ) : (
              <ActionButton action={setCustomerArchivedAction.bind(null, c.id, true)} label="Mark inactive" variant="ghost" icon={<UserX className="h-4 w-4" />} confirm={{ title: "Mark this customer inactive?", body: "They will be hidden from searches. All their history is kept and they can be reactivated at any time." }} />
            )}
          </>
        }
      />

      <div className="mb-6"><OverdueUpcomingWarning warnings={warnings} /></div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <h3 className="mb-4 font-display text-lg font-semibold">Contact</h3>
            <ul className="space-y-3 text-[15px]">
              <li className="flex items-center gap-3"><Phone className="h-4 w-4 text-gold-500" /><a href={`tel:${c.phone}`} className="hover:text-blush-700">{formatPhone(c.phone)}</a></li>
              <li className="flex items-center gap-3"><Mail className="h-4 w-4 text-gold-500" />{c.email ? <a href={`mailto:${c.email}`} className="hover:text-blush-700">{c.email}</a> : <span className="text-muted">No email</span>}</li>
              <li className="flex items-start gap-3"><MapPin className="mt-1 h-4 w-4 text-gold-500" />{c.address ?? <span className="text-muted">No address</span>}</li>
            </ul>
            {c.notes ? (<><div className="my-4 ornament" /><p className="text-sm whitespace-pre-line text-ink-soft">{c.notes}</p></>) : null}
            <p className="mt-4 text-[12px] text-muted">Customer since {formatDate(c.createdAt)}</p>
          </Card>
          <div className="grid grid-cols-2 gap-3">
            {[
              ["Reservations", c.reservations.length],
              ["Gowns borrowed", borrowed.length],
              ["Outstanding balance", formatCents(balance)],
              ["Deposits held", formatCents(held)],
              ["Late returns", late.length],
              ["Overdue now", overdueNow.length],
            ].map(([label, v]) => (
              <div key={label as string} className="card p-4">
                <p className="font-display text-2xl font-semibold">{v}</p>
                <p className="text-[12.5px] text-muted">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Current reservations" />
            {current.length ? resTable(current) : <EmptyState title="No current reservations" action={<LinkButton href={`/reservations/new?customerId=${c.id}`} size="sm">New reservation</LinkButton>} />}
          </Card>
          <Card>
            <CardHeader title="Previous reservations" />
            {previous.length ? resTable(previous) : <p className="px-6 py-5 text-sm text-muted">None yet.</p>}
          </Card>
          <Card>
            <CardHeader title="Gowns borrowed · pickups & returns" />
            {items.filter((i) => i.pickup || i.gownReturn).length === 0 ? (
              <p className="px-6 py-5 text-sm text-muted">No pickups yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table-elegant">
                  <thead><tr><th>Gown</th><th>Picked up</th><th>Expected back</th><th>Returned</th><th>Condition</th><th>Status</th></tr></thead>
                  <tbody>
                    {items.filter((i) => i.pickup || i.gownReturn).map((i) => {
                      const od = isItemOverdue({ status: i.status, expectedReturnDate: fromDbDate(i.expectedReturnDate) }, today);
                      return (
                        <tr key={i.id}>
                          <td className="min-w-[12rem]"><Link href={`/inventory/${i.gown.id}`} className="hover:text-blush-700">{gownCode(i.gown.number)} · {i.gown.description}</Link></td>
                          <td className="whitespace-nowrap">{formatDate(i.pickup?.pickupDate)}</td>
                          <td className="whitespace-nowrap">{formatDate(i.expectedReturnDate)}</td>
                          <td className="whitespace-nowrap">
                            {formatDate(i.gownReturn?.returnDate)}
                            {i.gownReturn && i.gownReturn.daysLate > 0 ? <Pill tone="red" className="ml-2">{i.gownReturn.daysLate}d late</Pill> : null}
                          </td>
                          <td className="text-ink-soft">{i.gownReturn?.condition ? CONDITION_LABEL[i.gownReturn.condition] : i.pickup?.condition ? CONDITION_LABEL[i.pickup.condition] : "—"}{i.gownReturn?.hasDamage ? " · damage" : ""}</td>
                          <td><ItemStatusBadge status={od ? "OVERDUE" : i.status} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader title="Payment history" />
              {payments.length === 0 ? <p className="px-6 py-5 text-sm text-muted">No payments recorded.</p> : (
                <ul className="divide-y divide-line">
                  {payments.map((p) => (
                    <li key={p.id} className={`flex items-center justify-between gap-3 px-5 py-2.5 text-sm ${p.isVoided ? "opacity-50 line-through" : ""}`}>
                      <div>
                        <p className="font-medium">{PAYMENT_KIND_LABEL[p.kind]} {p.method ? `· ${PAYMENT_METHOD_LABEL[p.method]}` : ""}</p>
                        <p className="text-[12px] text-muted">{formatDate(p.paymentDate)} · <Link href={`/reservations/${p.rid}`} className="hover:text-blush-700">{reservationCode(p.rnum)}</Link></p>
                      </div>
                      <span className="font-medium">{p.kind === "REFUND" ? "−" : ""}{formatCents(p.amountCents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title="Security deposit history" />
              {deposits.length === 0 ? <p className="px-6 py-5 text-sm text-muted">No deposits recorded.</p> : (
                <ul className="divide-y divide-line">
                  {deposits.map((p) => (
                    <li key={p.id} className={`flex items-center justify-between gap-3 px-5 py-2.5 text-sm ${p.isVoided ? "opacity-50 line-through" : ""}`}>
                      <div>
                        <p className="font-medium">{DEPOSIT_KIND_LABEL[p.kind]}</p>
                        <p className="text-[12px] text-muted">{formatDate(p.transactionDate)} · <Link href={`/reservations/${p.rid}`} className="hover:text-blush-700">{reservationCode(p.rnum)}</Link>{p.reason ? ` · ${p.reason}` : ""}</p>
                      </div>
                      <span className="font-medium">{formatCents(p.amountCents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
