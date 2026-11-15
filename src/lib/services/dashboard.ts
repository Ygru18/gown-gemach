import "server-only";
import { prisma } from "@/lib/db";
import { addDays, diffDays, fromDbDate, toDbDate } from "@/lib/dates";
import { summarizeFinances } from "@/lib/finance";
import type { GownStatus } from "@/generated/prisma/enums";

export interface OverdueRow {
  itemId: string;
  reservationId: string;
  reservationNumber: number;
  customerId: string;
  customerName: string;
  customerPhone: string;
  gownId: string;
  gownNumber: number;
  gownDescription: string;
  expectedReturnDate: string;
  daysOverdue: number;
}

export interface UpcomingConflictWarning {
  customerId: string;
  customerName: string;
  customerPhone: string;
  overdue: OverdueRow[];
  upcoming: {
    itemId: string;
    reservationId: string;
    reservationNumber: number;
    gownNumber: number;
    gownDescription: string;
    pickupDate: string;
    status: string;
  }[];
}

export async function getOverdueItems(today: string, customerId?: string): Promise<OverdueRow[]> {
  const items = await prisma.reservationItem.findMany({
    where: {
      status: "CHECKED_OUT",
      expectedReturnDate: { lt: toDbDate(today) },
      ...(customerId ? { reservation: { customerId } } : {}),
    },
    include: {
      gown: { select: { id: true, number: true, description: true } },
      reservation: { select: { id: true, number: true, customer: { select: { id: true, fullName: true, phone: true } } } },
    },
    orderBy: { expectedReturnDate: "asc" },
  });
  return items.map((i) => ({
    itemId: i.id,
    reservationId: i.reservation.id,
    reservationNumber: i.reservation.number,
    customerId: i.reservation.customer.id,
    customerName: i.reservation.customer.fullName,
    customerPhone: i.reservation.customer.phone,
    gownId: i.gown.id,
    gownNumber: i.gown.number,
    gownDescription: i.gown.description,
    expectedReturnDate: fromDbDate(i.expectedReturnDate),
    daysOverdue: diffDays(fromDbDate(i.expectedReturnDate), today),
  }));
}

/**
 * Customers who have an overdue gown AND another reservation still to be
 * picked up. Never cancels anything — it only surfaces the situation.
 */
export async function getOverdueWithUpcoming(today: string, customerId?: string): Promise<UpcomingConflictWarning[]> {
  const overdue = await getOverdueItems(today, customerId);
  if (overdue.length === 0) return [];
  const customerIds = [...new Set(overdue.map((o) => o.customerId))];
  const upcoming = await prisma.reservationItem.findMany({
    where: { status: { in: ["PENDING", "CONFIRMED"] }, reservation: { customerId: { in: customerIds } } },
    include: {
      gown: { select: { number: true, description: true } },
      reservation: { select: { id: true, number: true, customerId: true } },
    },
    orderBy: { requestedPickupDate: "asc" },
  });
  const out: UpcomingConflictWarning[] = [];
  for (const cid of customerIds) {
    const ups = upcoming.filter((u) => u.reservation.customerId === cid);
    if (ups.length === 0) continue;
    const od = overdue.filter((o) => o.customerId === cid);
    out.push({
      customerId: cid,
      customerName: od[0]!.customerName,
      customerPhone: od[0]!.customerPhone,
      overdue: od,
      upcoming: ups.map((u) => ({
        itemId: u.id,
        reservationId: u.reservation.id,
        reservationNumber: u.reservation.number,
        gownNumber: u.gown.number,
        gownDescription: u.gown.description,
        pickupDate: fromDbDate(u.confirmedPickupDate ?? u.requestedPickupDate),
        status: u.status,
      })),
    });
  }
  return out;
}

export async function getMoneyOutstanding() {
  const reservations = await prisma.reservation.findMany({
    where: { status: { not: "CANCELLED" } },
    include: {
      items: { select: { rentalFeeCents: true, status: true } },
      payments: { select: { kind: true, amountCents: true, isVoided: true } },
      deposits: { select: { kind: true, amountCents: true, isVoided: true } },
      customer: { select: { id: true, fullName: true, phone: true } },
    },
  });
  let balanceCount = 0;
  let balanceCents = 0;
  let depositCount = 0;
  let depositCents = 0;
  let heldCount = 0;
  let heldCents = 0;
  const rows = [];
  for (const r of reservations) {
    const s = summarizeFinances({
      status: r.status,
      itemFeesCents: r.items.filter((i) => i.status !== "CANCELLED").map((i) => i.rentalFeeCents),
      depositRequiredCents: r.depositRequiredCents,
      payments: r.payments,
      deposits: r.deposits,
    });
    if (s.balanceDueCents > 0) {
      balanceCount++;
      balanceCents += s.balanceDueCents;
    }
    const activeForDeposit = r.status === "PENDING" || r.status === "CONFIRMED" || r.status === "CHECKED_OUT";
    if (activeForDeposit && s.depositOutstandingCents > 0) {
      depositCount++;
      depositCents += s.depositOutstandingCents;
    }
    if (s.depositHeldCents > 0) {
      heldCount++;
      heldCents += s.depositHeldCents;
    }
    rows.push({ reservation: r, summary: s });
  }
  return { balanceCount, balanceCents, depositCount, depositCents, heldCount, heldCents, rows };
}

export async function getDashboard(today: string, windowDays: number) {
  const until = toDbDate(addDays(today, windowDays));
  const [statusCounts, pendingCount, confirmedCount, overdue, warnings, money, upcomingPickups, upcomingReturns, recentGowns, recentReturns, recentReservations, activity, inspectionQueue] =
    await Promise.all([
      prisma.gown.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.reservation.count({ where: { status: "PENDING" } }),
      prisma.reservation.count({ where: { status: "CONFIRMED" } }),
      getOverdueItems(today),
      getOverdueWithUpcoming(today),
      getMoneyOutstanding(),
      prisma.reservationItem.findMany({
        where: { status: { in: ["CONFIRMED", "PENDING"] }, requestedPickupDate: { lte: until } },
        include: {
          gown: { select: { id: true, number: true, description: true, status: true } },
          reservation: { select: { id: true, number: true, customer: { select: { id: true, fullName: true, phone: true } } } },
        },
        orderBy: [{ requestedPickupDate: "asc" }],
        take: 30,
      }),
      prisma.reservationItem.findMany({
        where: { status: "CHECKED_OUT", expectedReturnDate: { gte: toDbDate(today), lte: until } },
        include: {
          gown: { select: { id: true, number: true, description: true } },
          reservation: { select: { id: true, number: true, customer: { select: { id: true, fullName: true, phone: true } } } },
        },
        orderBy: { expectedReturnDate: "asc" },
        take: 30,
      }),
      prisma.gown.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
        include: { photos: { where: { kind: "GALLERY" }, orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1 } },
      }),
      prisma.gownReturn.findMany({
        orderBy: [{ createdAt: "desc" }],
        take: 6,
        include: {
          item: {
            include: {
              gown: { select: { id: true, number: true, description: true, status: true } },
              reservation: { select: { id: true, number: true, customer: { select: { fullName: true } } } },
            },
          },
        },
      }),
      prisma.reservation.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
        include: { customer: { select: { fullName: true } }, items: { select: { status: true, expectedReturnDate: true } } },
      }),
      prisma.activityLog.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
      prisma.gown.count({ where: { status: "PENDING_INSPECTION" } }),
    ]);

  const byStatus = Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all])) as Partial<Record<GownStatus, number>>;
  const total = Object.entries(byStatus)
    .filter(([s]) => s !== "DISPOSED" && s !== "ARCHIVED")
    .reduce((a, [, n]) => a + (n ?? 0), 0);

  // An upcoming pickup whose date is before today but not yet picked up is "late for pickup".
  return {
    counts: {
      total,
      byStatus,
      pendingReservations: pendingCount,
      confirmedReservations: confirmedCount,
      overdue: overdue.length,
      inspectionQueue,
    },
    overdue,
    warnings,
    money,
    upcomingPickups: upcomingPickups.map((i) => ({ ...i, pickupDate: fromDbDate(i.confirmedPickupDate ?? i.requestedPickupDate) })).sort((a, b) => a.pickupDate.localeCompare(b.pickupDate)),
    upcomingReturns,
    recentGowns,
    recentReturns,
    recentReservations,
    activity,
  };
}
