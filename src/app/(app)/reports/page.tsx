import Link from "next/link";
import { Suspense } from "react";
import { requireStaffPage } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/services/settings";
import { customerReport, donationReport, financialReport, inventoryReport, overdueReport, reservationReport } from "@/lib/services/reports";
import { formatDate, formatDateTime, formatMonth, isYmd, todayYmd } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { DEPOSIT_KIND_LABEL, GOWN_STATUS_ORDER, PAYMENT_KIND_LABEL, PAYMENT_METHOD_LABEL, customerCode, formatPhone, gownCode, reservationCode } from "@/lib/format";
import { Card, CardHeader, EmptyState, PageHeader, Pill } from "@/components/ui";
import { CsvLink, ReportControls } from "@/components/ReportControls";
import { GownStatusBadge, PaymentStatusBadge, ReservationStatusBadge } from "@/components/status";
import type { ReactNode } from "react";

export const metadata = { title: "Reports" };

function Metric({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card p-4 sm:p-5">
      <p className="font-display text-[1.8rem] leading-none font-semibold">{value}</p>
      <p className="mt-1.5 text-[13px] text-ink-soft">{label}</p>
      {sub ? <p className="text-[12px] text-muted">{sub}</p> : null}
    </div>
  );
}

function Empty() {
  return <p className="px-6 py-6 text-sm text-muted">No records for this period.</p>;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireStaffPage();
  const sp = await searchParams;
  const settings = await getSettings();
  const today = todayYmd(settings.timezone);
  const from = isYmd(sp.from) ? sp.from : `${today.slice(0, 4)}-01-01`;
  const to = isYmd(sp.to) ? sp.to : today;
  const range = { from, to };
  const tab = sp.tab ?? "inventory";

  let body: ReactNode = null;

  if (tab === "inventory") {
    const inv = await inventoryReport();
    const active = GOWN_STATUS_ORDER.filter((s) => s !== "ARCHIVED" && s !== "DISPOSED").reduce((a, s) => a + (inv.byStatus[s] ?? 0), 0);
    const unavailable = ["PENDING_INSPECTION", "PENDING_CLEANING", "NEEDS_ALTERATION", "UNAVAILABLE_OTHER"].reduce((a, s) => a + (inv.byStatus[s] ?? 0), 0);
    body = (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Metric label="Total gowns (active)" value={active} />
          <Metric label="Available" value={inv.byStatus.AVAILABLE ?? 0} />
          <Metric label="Checked out" value={inv.byStatus.CHECKED_OUT ?? 0} />
          <Metric label="Unavailable" value={unavailable} sub="inspection, cleaning, alterations, other" />
          <Metric label="Archived" value={inv.byStatus.ARCHIVED ?? 0} />
          <Metric label="Disposed" value={inv.byStatus.DISPOSED ?? 0} />
        </div>
        <Card>
          <CardHeader title="Gowns by status" action={<CsvLink report="inventory" from={from} to={to} label="Full inventory CSV" />} />
          <div className="overflow-x-auto">
            <table className="table-elegant">
              <thead><tr><th>Status</th><th>Gowns</th><th></th></tr></thead>
              <tbody>
                {GOWN_STATUS_ORDER.map((s) => (
                  <tr key={s}><td><GownStatusBadge status={s} /></td><td className="font-medium">{inv.byStatus[s] ?? 0}</td><td className="no-print text-right"><Link href={`/inventory?status=${s}`} className="text-[13px] text-gold-600 hover:underline">View</Link></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader title="Gowns needing cleaning" />
            {inv.cleanings.length === 0 ? <Empty /> : <ul className="divide-y divide-line">{inv.cleanings.map((c) => <li key={c.id} className="px-5 py-2.5 text-sm"><Link href={`/inventory/${c.gown.id}`} className="font-medium hover:text-blush-700">{gownCode(c.gown.number)} · {c.gown.description}</Link><span className="text-muted"> · since {formatDate(c.identifiedDate)}{c.reason ? ` · ${c.reason}` : ""}</span></li>)}</ul>}
          </Card>
          <Card>
            <CardHeader title="Gowns needing alterations" />
            {inv.alterations.length === 0 ? <Empty /> : <ul className="divide-y divide-line">{inv.alterations.map((c) => <li key={c.id} className="px-5 py-2.5 text-sm"><Link href={`/inventory/${c.gown.id}`} className="font-medium hover:text-blush-700">{gownCode(c.gown.number)} · {c.gown.description}</Link><span className="text-muted"> · {c.description}</span></li>)}</ul>}
          </Card>
          <Card>
            <CardHeader title="Archived gowns" />
            {inv.archived.length === 0 ? <Empty /> : <ul className="divide-y divide-line">{inv.archived.map((g) => <li key={g.id} className="px-5 py-2.5 text-sm"><Link href={`/inventory/${g.id}`} className="font-medium hover:text-blush-700">{gownCode(g.number)} · {g.description}</Link><span className="text-muted"> · {formatDateTime(g.archivedAt, settings.timezone)}{g.archiveReason ? ` · ${g.archiveReason}` : ""}</span></li>)}</ul>}
          </Card>
          <Card>
            <CardHeader title="Disposed gowns" />
            {inv.disposed.length === 0 ? <Empty /> : <ul className="divide-y divide-line">{inv.disposed.map((g) => <li key={g.id} className="px-5 py-2.5 text-sm"><Link href={`/inventory/${g.id}`} className="font-medium hover:text-blush-700">{gownCode(g.number)} · {g.description}</Link><span className="text-muted"> · {formatDate(g.disposedDate)}{g.disposalReason ? ` · ${g.disposalReason}` : ""}</span></li>)}</ul>}
          </Card>
        </div>
      </div>
    );
  } else if (tab === "donations") {
    const rep = await donationReport(range);
    body = (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3"><Metric label="Gowns donated in period" value={rep.gowns.length} /><Metric label="Donors in period" value={rep.byDonor.filter((d) => d.donorId).length} /></div>
        <Card>
          <CardHeader title="Gowns donated by donor" />
          {rep.byDonor.length === 0 ? <Empty /> : (
            <table className="table-elegant"><thead><tr><th>Donor</th><th>Gowns</th></tr></thead>
              <tbody>{rep.byDonor.map((d) => <tr key={d.donorId ?? "none"}><td>{d.donorId ? <Link href={`/donors/${d.donorId}`} className="hover:text-blush-700">{d.name}</Link> : <span className="text-muted">{d.name}</span>}</td><td className="font-medium">{d.count}</td></tr>)}</tbody></table>
          )}
        </Card>
        <Card>
          <CardHeader title="Gowns donated by date" action={<CsvLink report="donations" from={from} to={to} />} />
          {rep.gowns.length === 0 ? <Empty /> : (
            <div className="overflow-x-auto"><table className="table-elegant"><thead><tr><th>Date</th><th>Gown</th><th>Size</th><th>Color</th><th>Donor</th></tr></thead>
              <tbody>{rep.gowns.map((g) => <tr key={g.id}><td className="whitespace-nowrap">{formatDate(g.intakeDate)}</td><td><Link href={`/inventory/${g.id}`} className="hover:text-blush-700">{gownCode(g.number)} · {g.description}</Link></td><td>{g.size}</td><td>{g.color}</td><td className="text-ink-soft">{g.donor?.name ?? "—"}</td></tr>)}</tbody></table></div>
          )}
        </Card>
      </div>
    );
  } else if (tab === "reservations") {
    const rep = await reservationReport(range);
    body = (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Reservations in period" value={rep.reservations.length} />
          <Metric label="Cancelled" value={rep.cancelled.length} />
          <Metric label="Gowns reserved" value={rep.reservations.reduce((s, r) => s + r.items.filter((i) => i.status !== "CANCELLED").length, 0)} />
          <Metric label="Months" value={rep.byMonth.length} />
        </div>
        <Card>
          <CardHeader title="Reservations by month" />
          {rep.byMonth.length === 0 ? <Empty /> : (
            <table className="table-elegant"><thead><tr><th>Month</th><th>Reservations</th><th>Cancelled</th><th className="w-1/2"></th></tr></thead>
              <tbody>{rep.byMonth.map((m) => {
                const max = Math.max(...rep.byMonth.map((x) => x.total));
                return <tr key={m.month}><td>{formatMonth(m.month)}</td><td className="font-medium">{m.total}</td><td>{m.cancelled}</td><td><div className="h-2.5 rounded-full bg-blush-100"><div className="h-2.5 rounded-full bg-blush-400" style={{ width: `${(m.total / max) * 100}%` }} /></div></td></tr>;
              })}</tbody></table>
          )}
        </Card>
        <Card>
          <CardHeader title="Most frequently borrowed gowns" subtitle="By pickups in the period" action={<CsvLink report="most-borrowed" from={from} to={to} />} />
          {rep.mostBorrowed.length === 0 ? <Empty /> : (
            <table className="table-elegant"><thead><tr><th>Gown</th><th>Size</th><th>Color</th><th>Times borrowed</th></tr></thead>
              <tbody>{rep.mostBorrowed.map((m) => <tr key={m.gown.id}><td><Link href={`/inventory/${m.gown.id}`} className="hover:text-blush-700">{gownCode(m.gown.number)} · {m.gown.description}</Link></td><td>{m.gown.size}</td><td>{m.gown.color}</td><td className="font-medium">{m.count}</td></tr>)}</tbody></table>
          )}
        </Card>
        <Card>
          <CardHeader title="Reservations in date range" action={<CsvLink report="reservations" from={from} to={to} />} />
          {rep.reservations.length === 0 ? <Empty /> : (
            <div className="overflow-x-auto"><table className="table-elegant"><thead><tr><th>Reservation</th><th>Requested</th><th>Customer</th><th>Gowns</th><th>Status</th></tr></thead>
              <tbody>{rep.reservations.map((r) => <tr key={r.id}><td><Link href={`/reservations/${r.id}`} className="font-medium text-gold-600 hover:underline">{reservationCode(r.number)}</Link></td><td>{formatDate(r.requestDate)}</td><td>{r.customer.fullName}</td><td className="text-ink-soft">{r.items.map((i) => gownCode(i.gown.number)).join(", ")}</td><td><ReservationStatusBadge status={r.status} /></td></tr>)}</tbody></table></div>
          )}
        </Card>
        <Card>
          <CardHeader title="Cancelled reservations" action={<CsvLink report="cancelled" from={from} to={to} />} />
          {rep.cancelled.length === 0 ? <Empty /> : (
            <div className="overflow-x-auto"><table className="table-elegant"><thead><tr><th>Reservation</th><th>Customer</th><th>Cancelled</th><th>Reason</th></tr></thead>
              <tbody>{rep.cancelled.map((r) => <tr key={r.id}><td><Link href={`/reservations/${r.id}`} className="font-medium text-gold-600 hover:underline">{reservationCode(r.number)}</Link></td><td>{r.customer.fullName}</td><td>{formatDateTime(r.cancelledAt, settings.timezone)}</td><td className="text-ink-soft">{r.cancellationReason ?? "—"}</td></tr>)}</tbody></table></div>
          )}
        </Card>
      </div>
    );
  } else if (tab === "customers") {
    const rep = await customerReport(range);
    body = (
      <div className="space-y-6">
        <Card>
          <CardHeader title="Customer rental history" subtitle="Customers with reservations in the period, or an outstanding balance" action={<CsvLink report="customers" from={from} to={to} />} />
          {rep.rows.length === 0 ? <Empty /> : (
            <div className="overflow-x-auto"><table className="table-elegant"><thead><tr><th>Customer</th><th>Phone</th><th>Reservations</th><th>Gowns borrowed</th><th>Paid (period)</th><th>Balance</th><th>Late returns</th></tr></thead>
              <tbody>{rep.rows.map((x) => <tr key={x.customer.id}><td><Link href={`/customers/${x.customer.id}`} className="font-medium hover:text-blush-700">{x.customer.fullName}</Link><span className="ml-1.5 text-[11px] text-muted">{customerCode(x.customer.number)}</span></td><td>{formatPhone(x.customer.phone)}</td><td>{x.reservations}</td><td>{x.gowns}</td><td>{formatCents(x.paid)}</td><td className={x.balance ? "text-[#93602a]" : ""}>{formatCents(x.balance)}</td><td>{x.late ? <Pill tone="red">{x.late}</Pill> : 0}</td></tr>)}</tbody></table></div>
          )}
        </Card>
        <Card>
          <CardHeader title="Customer payment history" action={<CsvLink report="payments" from={from} to={to} />} />
          {rep.payments.length === 0 ? <Empty /> : (
            <div className="overflow-x-auto"><table className="table-elegant"><thead><tr><th>Date</th><th>Customer</th><th>Reservation</th><th>Type</th><th>Method</th><th>Amount</th></tr></thead>
              <tbody>{rep.payments.map((p) => <tr key={p.id} className={p.isVoided ? "opacity-50 line-through" : ""}><td>{formatDate(p.paymentDate)}</td><td><Link href={`/customers/${p.reservation.customer.id}`} className="hover:text-blush-700">{p.reservation.customer.fullName}</Link></td><td><Link href={`/reservations/${p.reservation.id}`} className="text-gold-600 hover:underline">{reservationCode(p.reservation.number)}</Link></td><td>{PAYMENT_KIND_LABEL[p.kind]}</td><td>{p.method ? PAYMENT_METHOD_LABEL[p.method] : "—"}</td><td className="font-medium">{p.kind === "REFUND" ? "−" : ""}{formatCents(p.amountCents)}</td></tr>)}</tbody></table></div>
          )}
        </Card>
      </div>
    );
  } else if (tab === "overdue") {
    const rep = await overdueReport(range, today);
    body = (
      <div className="space-y-6">
        <Card className={rep.current.length ? "border-red-200" : ""}>
          <CardHeader title="Currently overdue" action={<CsvLink report="overdue" from={from} to={to} />} />
          {rep.current.length === 0 ? <EmptyState title="Nothing overdue" /> : (
            <div className="overflow-x-auto"><table className="table-elegant"><thead><tr><th>Customer</th><th>Phone</th><th>Gown</th><th>Expected</th><th>Days overdue</th></tr></thead>
              <tbody>{rep.current.map((o) => <tr key={o.itemId}><td><Link href={`/customers/${o.customerId}`} className="font-medium hover:text-blush-700">{o.customerName}</Link></td><td>{formatPhone(o.customerPhone)}</td><td><Link href={`/reservations/${o.reservationId}`} className="hover:text-blush-700">{gownCode(o.gownNumber)} · {o.gownDescription}</Link></td><td>{formatDate(o.expectedReturnDate)}</td><td className="font-semibold text-red-700">{o.daysOverdue}</td></tr>)}</tbody></table></div>
          )}
        </Card>
        <Card>
          <CardHeader title="Late returns in period" action={<CsvLink report="late-returns" from={from} to={to} />} />
          {rep.late.length === 0 ? <Empty /> : (
            <div className="overflow-x-auto"><table className="table-elegant"><thead><tr><th>Returned</th><th>Customer</th><th>Gown</th><th>Days late</th></tr></thead>
              <tbody>{rep.late.map((x) => <tr key={x.id}><td>{formatDate(x.returnDate)}</td><td><Link href={`/customers/${x.item.reservation.customer.id}`} className="hover:text-blush-700">{x.item.reservation.customer.fullName}</Link></td><td>{gownCode(x.item.gown.number)} · {x.item.gown.description}</td><td className="font-medium text-red-700">{x.daysLate}</td></tr>)}</tbody></table></div>
          )}
        </Card>
      </div>
    );
  } else if (tab === "financial") {
    const rep = await financialReport(range);
    const t = rep.totals;
    body = (
      <div className="space-y-6">
        <div>
          <p className="eyebrow mb-3">Rental income</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Rental fees collected" value={formatCents(t.rentalCollected)} />
            <Metric label="Refunds" value={formatCents(t.refunds)} />
            <Metric label="Net rental income" value={formatCents(t.netRentalIncome)} />
            <Metric label="Fees waived" value={formatCents(t.waived)} />
          </div>
        </div>
        <div id="deposits">
          <p className="eyebrow mb-3">Security deposits (refundable — not income)</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Deposits collected" value={formatCents(t.depositsCollected)} />
            <Metric label="Deposits returned" value={formatCents(t.depositsReturned)} />
            <Metric label="Deposits retained" value={formatCents(t.depositsRetained)} />
            <Metric label="Currently held (all time)" value={formatCents(t.depositsHeld)} />
          </div>
        </div>
        <Card id="outstanding">
          <CardHeader title="Outstanding rental balances" subtitle={`${t.outstandingBalanceCount} reservation${t.outstandingBalanceCount === 1 ? "" : "s"} · ${formatCents(t.outstandingBalance)} (current, all dates)`} action={<CsvLink report="outstanding" from={from} to={to} />} />
          {rep.outstandingRows.length === 0 ? <EmptyState title="Everything is paid up" /> : (
            <div className="overflow-x-auto"><table className="table-elegant"><thead><tr><th>Reservation</th><th>Customer</th><th>Fee</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead>
              <tbody>{rep.outstandingRows.map((x) => <tr key={x.reservation.id}><td><Link href={`/reservations/${x.reservation.id}`} className="font-medium text-gold-600 hover:underline">{reservationCode(x.reservation.number)}</Link></td><td>{x.reservation.customer.fullName}</td><td>{formatCents(x.summary.rentalFeeCents)}</td><td>{formatCents(x.summary.netPaidCents)}</td><td className="font-medium text-[#93602a]">{formatCents(x.summary.balanceDueCents)}</td><td><PaymentStatusBadge status={x.summary.paymentStatus} /></td></tr>)}</tbody></table></div>
          )}
        </Card>
        <Card>
          <CardHeader title="Payments, refunds & waivers" action={<CsvLink report="financial-payments" from={from} to={to} />} />
          {rep.payments.length === 0 ? <Empty /> : (
            <div className="overflow-x-auto"><table className="table-elegant"><thead><tr><th>Date</th><th>Reservation</th><th>Customer</th><th>Type</th><th>Method</th><th>Amount</th></tr></thead>
              <tbody>{rep.payments.map((p) => <tr key={p.id}><td>{formatDate(p.paymentDate)}</td><td><Link href={`/reservations/${p.reservation.id}`} className="text-gold-600 hover:underline">{reservationCode(p.reservation.number)}</Link></td><td>{p.reservation.customer.fullName}</td><td>{PAYMENT_KIND_LABEL[p.kind]}</td><td>{p.method ? PAYMENT_METHOD_LABEL[p.method] : "—"}</td><td className="font-medium">{p.kind === "REFUND" ? "−" : ""}{formatCents(p.amountCents)}</td></tr>)}</tbody></table></div>
          )}
        </Card>
        <Card>
          <CardHeader title="Security deposit transactions" action={<CsvLink report="financial-deposits" from={from} to={to} />} />
          {rep.deposits.length === 0 ? <Empty /> : (
            <div className="overflow-x-auto"><table className="table-elegant"><thead><tr><th>Date</th><th>Reservation</th><th>Customer</th><th>Type</th><th>Amount</th><th>Reason</th></tr></thead>
              <tbody>{rep.deposits.map((d) => <tr key={d.id}><td>{formatDate(d.transactionDate)}</td><td><Link href={`/reservations/${d.reservation.id}`} className="text-gold-600 hover:underline">{reservationCode(d.reservation.number)}</Link></td><td>{d.reservation.customer.fullName}</td><td>{DEPOSIT_KIND_LABEL[d.kind]}</td><td className="font-medium">{formatCents(d.amountCents)}</td><td className="text-ink-soft">{d.reason ?? "—"}</td></tr>)}</tbody></table></div>
          )}
        </Card>
      </div>
    );
  } else if (tab === "activity") {
    const logs = await prisma.activityLog.findMany({ where: { createdAt: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T23:59:59Z`) } }, orderBy: { createdAt: "desc" }, take: 500 });
    body = (
      <Card>
        <CardHeader title="Activity & audit history" subtitle="Who did what, and when (latest 500 in range)" action={<CsvLink report="activity" from={from} to={to} />} />
        {logs.length === 0 ? <Empty /> : (
          <div className="overflow-x-auto"><table className="table-elegant"><thead><tr><th>When</th><th>Staff member</th><th>What happened</th></tr></thead>
            <tbody>{logs.map((l) => <tr key={l.id}><td className="whitespace-nowrap text-ink-soft">{formatDateTime(l.createdAt, settings.timezone)}</td><td className="whitespace-nowrap">{l.actorName}</td><td>{l.summary}</td></tr>)}</tbody></table></div>
        )}
      </Card>
    );
  }

  return (
    <div>
      <PageHeader eyebrow="Reports" title="Reports & records" subtitle={tab === "inventory" ? "Current inventory snapshot." : `${formatDate(from)} – ${formatDate(to)}`} />
      <Suspense><ReportControls from={from} to={to} /></Suspense>
      <div className="hidden print:block mb-4">
        <p className="font-display text-2xl">Chaya Surah Feldman Gown Gemach — {tab[0]!.toUpperCase() + tab.slice(1)} report</p>
        <p className="text-sm">{formatDate(from)} – {formatDate(to)} · printed {formatDate(today)}</p>
      </div>
      {body}
    </div>
  );
}
