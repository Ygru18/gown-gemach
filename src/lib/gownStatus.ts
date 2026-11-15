import type { GownStatus, ReservationItemStatus, ReservationStatus } from "@/generated/prisma/enums";

/** States driven by physical condition / work. Reservations never override them. */
export const WORK_STATES: GownStatus[] = ["PENDING_INSPECTION", "PENDING_CLEANING", "NEEDS_ALTERATION", "UNAVAILABLE_OTHER"];
export const TERMINAL_STATES: GownStatus[] = ["DISPOSED", "ARCHIVED"];
/** States in which the gown is on the rack and ready for a customer. */
export const READY_STATES: GownStatus[] = ["AVAILABLE", "PENDING_RESERVATION", "RESERVED"];

export function isReservable(status: GownStatus): boolean {
  return !TERMINAL_STATES.includes(status);
}

/**
 * Recomputes a gown's status from its current status and its active
 * reservation items. Work and terminal states are preserved — a gown only
 * becomes Available again through an explicit "ready" inspection.
 */
export function deriveGownStatus(
  current: GownStatus,
  activeItemStatuses: ReservationItemStatus[]
): GownStatus {
  if (TERMINAL_STATES.includes(current)) return current;
  if (activeItemStatuses.includes("CHECKED_OUT")) return "CHECKED_OUT";
  if (current === "CHECKED_OUT") {
    // Not checked out any more but no return was recorded through the
    // return workflow — keep it out of circulation until inspected.
    return "PENDING_INSPECTION";
  }
  if (WORK_STATES.includes(current)) return current;
  if (activeItemStatuses.includes("CONFIRMED")) return "RESERVED";
  if (activeItemStatuses.includes("PENDING")) return "PENDING_RESERVATION";
  return "AVAILABLE";
}

/** The "ready" status a gown takes when inspection/work marks it ready. */
export function readyStatus(activeItemStatuses: ReservationItemStatus[]): GownStatus {
  return deriveGownStatus("AVAILABLE", activeItemStatuses);
}

/** Overall reservation status from its items. */
export function deriveReservationStatus(items: ReservationItemStatus[]): ReservationStatus {
  const live = items.filter((s) => s !== "CANCELLED");
  if (items.length === 0 || live.length === 0) return "CANCELLED";
  if (live.includes("CHECKED_OUT")) return "CHECKED_OUT";
  if (live.every((s) => s === "RETURNED")) return "RETURNED";
  if (live.includes("RETURNED")) {
    // Some returned, the rest still to be picked up.
    return live.some((s) => s === "CONFIRMED") ? "CONFIRMED" : "PENDING";
  }
  if (live.includes("CONFIRMED")) return "CONFIRMED";
  return "PENDING";
}

export function isItemOverdue(item: { status: ReservationItemStatus; expectedReturnDate: string }, today: string): boolean {
  return item.status === "CHECKED_OUT" && item.expectedReturnDate < today;
}
