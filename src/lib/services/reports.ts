import "server-only";
import { prisma } from "@/lib/db";
import { diffDays, fromDbDate, monthKey, toDbDate } from "@/lib/dates";
import { summarizeFinances } from "@/lib/finance";
import { getOverdueItems, getMoneyOutstanding } from "./dashboard";

export interface Range {
  from: string;
  to: string;
}

const between = (r: Range) => ({ gte: toDbDate(r.from), lte: toDbDate(r.to) });

export async function inventoryReport() {
  const [byStatus, cleanings, alterations, archived, disposed] = await Promise.all([
    prisma.gown.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.cleaningRecord.findMany({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
      include: { gown: { select: { id: true, number: true, description: true } } },
      orderBy: { identifiedDate: "asc" },
    }),
    prisma.alterationRecord.findMany({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
      include: { gown: { select: { id: true, number: true, description: true } } },
      orderBy: { identifiedDate: "asc" },
    }),
    prisma.gown.findMany({ where: { status: "ARCHIVED" }, orderBy: { archivedAt: "desc" } }),
    prisma.gown.findMany({ where: { status: "DISPOSED" }, orderBy: { disposedDate: "desc" } }),
  ]);
  return { byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])) as Record<string, number>, cleanings, alterations, archived, disposed };
}

export async function donationReport(r: Range, donorId?: string) {
  const gowns = await prisma.gown.findMany({
    where: { intakeDate: between(r), ...(donorId ? { donorId } : {}) },
    include: { donor: { select: { id: true, name: true, number: true } } },
    orderBy: [{ intakeDate: "asc" }, { number: "asc" }],
  });
  const byDonor = new Map<string, { donorId: string | null; name: string; count: number }>();
  for (const g of gowns) {
    const key = g.donor?.id ?? "none";
    const cur = byDonor.get(key) ?? { donorId: g.donor?.id ?? null, name: g.donor?.name ?? "No donor recorded", count: 0 };
    cur.count++;
    byDonor.set(key, cur);
  }
  return { gowns, byDonor: [...byDonor.values()].sort((a, b) => b.count - a.count) };
}

export async function reservationReport(r: Range) {
  const reservations = await prisma.reservation.findMany({
    where: { requestDate: between(r) },
    include: {
      customer: { select: { fullName: true, number: true } },
      items: { include: { gown: { select: { number: true, description: true } } } },
    },
    orderBy: { requestDate: "asc" },
  });
  const byMonth = new Map<string, { total: number; cancelled: number }>();
  for (const res of reservations) {
    const k = monthKey(fromDbDate(res.requestDate));
    const cur = byMonth.get(k) ?? { total: 0, cancelled: 0 };
    cur.total++;
    if (res.status === "CANCELLED") cur.cancelled++;
    byMonth.set(k, cur);
  }
  const cancelled = reservations.filter((x) => x.status === "CANCELLED");
  const borrowed = await prisma.reservationItem.groupBy({
    by: ["gownId"],
    where: { status: { in: ["CHECKED_OUT", "RETURNED"] }, actualPickupDate: between(r) },
    _count: { _all: true },
    orderBy: { _count: { gownId: "desc" } },
    take: 15,
  });
  const gowns = await prisma.gown.findMany({ where: { id: { in: borrowed.map((b) => b.gownId) } }, select: { id: true, number: true, description: true, size: true, color: true } });
  const gmap = new Map(gowns.map((g) => [g.id, g]));
  return {
    reservations,
    byMonth: [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v })),
    cancelled,
    mostBorrowed: borrowed.map((b) => ({ gown: gmap.get(b.gownId)!, count: b._count._all })).filter((x) => x.gown),
  };
}

export async function customerReport(r: Range) {
  const customers = await prisma.customer.findMany({
    include: {
      reservations: {
        include: { items: { include: { gownReturn: true } }, payments: true, deposits: true },
      },
    },
    orderBy: { fullName: "asc" },
  });
  const rows = customers
    .map((c) => {
      const inRange = c.reservations.filter((res) => {
        const d = fromDbDate(res.requestDate);
        return d >= r.from && d <= r.to;
      });
      let paid = 0;
      let balance = 0;
      let late = 0;
      let gowns = 0;
      for (const res of c.reservations) {
        const s = summarizeFinances({
          status: res.status,
          itemFeesCents: res.items.filter((i) => i.status !== "CANCELLED").map((i) => i.rentalFeeCents),
          depositRequiredCents: res.depositRequiredCents,
          payments: res.payments,
          deposits: res.deposits,
        });
        balance += s.balanceDueCents;
      }
      for (const res of inRange) {
        for (const p of res.payments) if (!p.isVoided && p.kind === "PAYMENT") paid += p.amountCents;
        for (const it of res.items) {
          if (it.status === "CHECKED_OUT" || it.status === "RETURNED") gowns++;
          if (it.gownReturn && it.gownReturn.daysLate > 0) late++;
        }
      }
      return { customer: c, reservations: inRange.length, gowns, paid, balance, late };
    })
    .filter((x) => x.reservations > 0 || x.balance > 0);
  const payments = await prisma.payment.findMany({
    where: { paymentDate: between(r) },
    include: { reservation: { select: { id: true, number: true, customer: { select: { id: true, fullName: true } } } } },
    orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }],
  });
  return { rows, payments };
}

export async function overdueReport(r: Range, today: string) {
  const current = await getOverdueItems(today);
  const late = await prisma.gownReturn.findMany({
    where: { daysLate: { gt: 0 }, returnDate: between(r) },
    include: {
      item: {
        include: {
          gown: { select: { number: true, description: true } },
          reservation: { select: { id: true, number: true, customer: { select: { id: true, fullName: true, phone: true } } } },
        },
      },
    },
    orderBy: { returnDate: "desc" },
  });
  return { current, late };
}

export async function financialReport(r: Range) {
  const [payments, deposits, outstanding] = await Promise.all([
    prisma.payment.findMany({
      where: { paymentDate: between(r), isVoided: false },
      include: { reservation: { select: { id: true, number: true, customer: { select: { fullName: true } } } } },
      orderBy: { paymentDate: "asc" },
    }),
    prisma.depositTransaction.findMany({
      where: { transactionDate: between(r), isVoided: false },
      include: { reservation: { select: { id: true, number: true, customer: { select: { fullName: true } } } } },
      orderBy: { transactionDate: "asc" },
    }),
    getMoneyOutstanding(),
  ]);
  const sum = <T extends { kind: string; amountCents: number }>(xs: T[], kind: string) => xs.filter((x) => x.kind === kind).reduce((a, x) => a + x.amountCents, 0);
  const rentalCollected = sum(payments, "PAYMENT");
  const refunds = sum(payments, "REFUND");
  const waived = sum(payments, "WAIVER");
  return {
    totals: {
      rentalCollected,
      refunds,
      netRentalIncome: rentalCollected - refunds,
      waived,
      depositsCollected: sum(deposits, "COLLECTED"),
      depositsReturned: sum(deposits, "RETURNED"),
      depositsRetained: sum(deposits, "RETAINED"),
      outstandingBalance: outstanding.balanceCents,
      outstandingBalanceCount: outstanding.balanceCount,
      depositsHeld: outstanding.heldCents,
    },
    payments,
    deposits,
    outstandingRows: outstanding.rows.filter((x) => x.summary.balanceDueCents > 0),
  };
}

export function daysBetween(a: Date, b: string) {
  return diffDays(fromDbDate(a), b);
}
