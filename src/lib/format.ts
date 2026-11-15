import type {
  GownCondition,
  GownStatus,
  InspectionOutcome,
  PaymentKind,
  PaymentMethod,
  ReservationItemStatus,
  ReservationStatus,
  DepositTransactionKind,
  WorkStatus,
} from "@/generated/prisma/enums";

export const gownCode = (n: number) => `G-${String(n).padStart(4, "0")}`;
export const customerCode = (n: number) => `C-${String(n).padStart(4, "0")}`;
export const donorCode = (n: number) => `D-${String(n).padStart(4, "0")}`;
export const reservationCode = (n: number) => `R-${String(n).padStart(4, "0")}`;

/** "G-0012", "g12", "12" → 12 for the given prefix. */
export function parseCode(input: string, prefix: "G" | "C" | "D" | "R"): number | null {
  const m = new RegExp(`^\\s*(?:${prefix}\\s*-?\\s*)?(\\d{1,9})\\s*$`, "i").exec(input);
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export const GOWN_STATUS_LABEL: Record<GownStatus, string> = {
  AVAILABLE: "Available",
  PENDING_RESERVATION: "Pending Reservation",
  RESERVED: "Reserved",
  CHECKED_OUT: "Checked Out",
  PENDING_INSPECTION: "Pending Inspection",
  PENDING_CLEANING: "Pending Cleaning",
  NEEDS_ALTERATION: "Needs Alteration",
  UNAVAILABLE_OTHER: "Unavailable – Other",
  DISPOSED: "Disposed",
  ARCHIVED: "Archived",
};

export const GOWN_STATUS_ORDER: GownStatus[] = [
  "AVAILABLE",
  "PENDING_RESERVATION",
  "RESERVED",
  "CHECKED_OUT",
  "PENDING_INSPECTION",
  "PENDING_CLEANING",
  "NEEDS_ALTERATION",
  "UNAVAILABLE_OTHER",
  "DISPOSED",
  "ARCHIVED",
];

export const CONDITION_LABEL: Record<GownCondition, string> = {
  NEW_WITH_TAGS: "New with tags",
  EXCELLENT: "Excellent",
  VERY_GOOD: "Very good",
  GOOD: "Good",
  FAIR: "Fair",
  POOR: "Poor",
};
export const CONDITIONS = Object.keys(CONDITION_LABEL) as GownCondition[];

export const RESERVATION_STATUS_LABEL: Record<ReservationStatus | "OVERDUE", string> = {
  PENDING: "Pending Reservation",
  CONFIRMED: "Confirmed",
  CHECKED_OUT: "Checked Out",
  RETURNED: "Returned",
  CANCELLED: "Cancelled",
  OVERDUE: "Overdue",
};

export const ITEM_STATUS_LABEL: Record<ReservationItemStatus | "OVERDUE", string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  CHECKED_OUT: "Checked Out",
  RETURNED: "Returned",
  CANCELLED: "Cancelled",
  OVERDUE: "Overdue",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = { CASH: "Cash", CHECK: "Check", OTHER: "Other" };
export const PAYMENT_KIND_LABEL: Record<PaymentKind, string> = { PAYMENT: "Payment", REFUND: "Refund", WAIVER: "Fee waived" };
export const DEPOSIT_KIND_LABEL: Record<DepositTransactionKind, string> = {
  COLLECTED: "Deposit collected",
  RETURNED: "Deposit returned",
  RETAINED: "Deposit retained",
};

export const INSPECTION_OUTCOME_LABEL: Record<InspectionOutcome, string> = {
  READY: "Ready for next rental",
  NEEDS_CLEANING: "Needs cleaning",
  NEEDS_ALTERATION: "Needs alteration",
  DAMAGED: "Damaged / Unavailable",
  OTHER: "Other",
};

export const WORK_STATUS_LABEL: Record<WorkStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function phoneDigits(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const d = phoneDigits(phone);
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d.startsWith("1")) return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return phone;
}

/** Numeric part of a size for sorting: "10" → 10, "8-10" → 8, "XS" → null. */
export function sizeSortValue(size: string): number | null {
  const m = /(\d+(?:\.\d+)?)/.exec(size);
  if (!m) {
    const letters: Record<string, number> = { XXS: -3, XS: -2, S: -1, M: 0.5, L: 1.5, XL: 2.5, XXL: 3.5 };
    return letters[size.trim().toUpperCase()] ?? null;
  }
  const n = Number(m[1]);
  return Number.isFinite(n) && n < 10000 ? n : null;
}
