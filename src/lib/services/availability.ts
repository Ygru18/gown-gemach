import "server-only";
import { prisma, type Tx } from "@/lib/db";
import { addDays, fromDbDate, rangesOverlap, type Ymd } from "@/lib/dates";
import { customerCode, GOWN_STATUS_LABEL, reservationCode } from "@/lib/format";
import { getSettings } from "./settings";
import { TERMINAL_STATES, WORK_STATES } from "@/lib/gownStatus";

export interface AvailabilityIssue {
  kind:
    | "CONFIRMED_OVERLAP"
    | "CHECKED_OUT_OVERLAP"
    | "OVERDUE_NOT_RETURNED"
    | "PENDING_OVERLAP"
    | "NOT_RESERVABLE"
    | "WORK_IN_PROGRESS";
  message: string;
  reservationId?: string;
  reservationNumber?: number;
}

export interface AvailabilityResult {
  gownId: string;
  available: boolean;
  /** Hard conflicts: confirming would double-book. */
  conflicts: AvailabilityIssue[];
  /** Soft warnings: other pending requests, gown currently being cleaned, etc. */
  warnings: AvailabilityIssue[];
}

/**
 * Checks whether a gown can be held from `pickup` through `returnDate`
 * (+ turnaround buffer). Confirmed and checked-out items are hard
 * conflicts; an overdue gown that has not come back blocks any booking that
 * starts before it could be inspected. Pending requests are shown as
 * warnings so staff can see competing requests.
 */
export async function checkAvailability(
  gownId: string,
  pickup: Ymd,
  returnDate: Ymd,
  opts: { excludeItemIds?: string[]; today: Ymd; tx?: Tx }
): Promise<AvailabilityResult> {
  const tx = opts.tx ?? prisma;
  const settings = await getSettings(tx);
  const buffer = settings.turnaroundBufferDays;
  const blockedThrough = addDays(returnDate, buffer);
  const gown = await tx.gown.findUnique({ where: { id: gownId }, select: { status: true, statusReason: true } });
  const conflicts: AvailabilityIssue[] = [];
  const warnings: AvailabilityIssue[] = [];
  if (!gown) {
    return { gownId, available: false, conflicts: [{ kind: "NOT_RESERVABLE", message: "Gown not found." }], warnings };
  }
  if (TERMINAL_STATES.includes(gown.status)) {
    conflicts.push({ kind: "NOT_RESERVABLE", message: `This gown is ${GOWN_STATUS_LABEL[gown.status].toLowerCase()} and cannot be reserved.` });
  } else if (WORK_STATES.includes(gown.status)) {
    warnings.push({
      kind: "WORK_IN_PROGRESS",
      message: `Currently ${GOWN_STATUS_LABEL[gown.status]}${gown.statusReason ? ` (${gown.statusReason})` : ""}. It must be marked ready before pickup.`,
    });
  }

  const items = await tx.reservationItem.findMany({
    where: {
      gownId,
      status: { in: ["PENDING", "CONFIRMED", "CHECKED_OUT"] },
      id: opts.excludeItemIds?.length ? { notIn: opts.excludeItemIds } : undefined,
    },
    include: { reservation: { select: { id: true, number: true, customer: { select: { fullName: true, number: true } } } } },
  });

  for (const it of items) {
    const start = fromDbDate(it.confirmedPickupDate ?? it.requestedPickupDate);
    let end = fromDbDate(it.blockedThroughDate);
    const who = `${it.reservation.customer.fullName} (${customerCode(it.reservation.customer.number)})`;
    const ref = { reservationId: it.reservation.id, reservationNumber: it.reservation.number };
    if (it.status === "CHECKED_OUT" && fromDbDate(it.expectedReturnDate) < opts.today) {
      // Overdue: treat as held until it is back and inspected.
      end = addDays(opts.today, Math.max(buffer, 1));
      if (pickup <= end) {
        conflicts.push({
          kind: "OVERDUE_NOT_RETURNED",
          message: `Checked out to ${who} on ${reservationCode(it.reservation.number)} and overdue since ${fromDbDate(it.expectedReturnDate)} — not yet returned.`,
          ...ref,
        });
      }
      continue;
    }
    if (!rangesOverlap(pickup, blockedThrough, start, end)) continue;
    if (it.status === "PENDING") {
      warnings.push({
        kind: "PENDING_OVERLAP",
        message: `Pending request ${reservationCode(it.reservation.number)} from ${who} overlaps (${start} to ${fromDbDate(it.expectedReturnDate)}).`,
        ...ref,
      });
    } else {
      conflicts.push({
        kind: it.status === "CHECKED_OUT" ? "CHECKED_OUT_OVERLAP" : "CONFIRMED_OVERLAP",
        message: `${it.status === "CHECKED_OUT" ? "Checked out" : "Confirmed"} on ${reservationCode(it.reservation.number)} for ${who}, ${start} to ${fromDbDate(it.expectedReturnDate)}${buffer ? ` (+${buffer} day turnaround)` : ""}.`,
        ...ref,
      });
    }
  }

  return { gownId, available: conflicts.length === 0, conflicts, warnings };
}
