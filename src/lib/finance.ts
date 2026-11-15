import type { DepositTransactionKind, PaymentKind, ReservationStatus } from "@/generated/prisma/enums";

export type PaymentStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID" | "REFUNDED" | "WAIVED" | "NO_FEE";

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  UNPAID: "Unpaid",
  PARTIALLY_PAID: "Partially Paid",
  PAID: "Paid",
  REFUNDED: "Refunded",
  WAIVED: "Waived",
  NO_FEE: "No fee",
};

export interface LedgerPayment {
  kind: PaymentKind;
  amountCents: number;
  isVoided?: boolean;
}
export interface LedgerDeposit {
  kind: DepositTransactionKind;
  amountCents: number;
  isVoided?: boolean;
}

export interface FinancialSummary {
  rentalFeeCents: number;
  paidCents: number;
  refundedCents: number;
  waivedCents: number;
  /** paid − refunded */
  netPaidCents: number;
  /** What the customer still owes on rental fees (never negative). */
  balanceDueCents: number;
  /** Money we owe back to the customer (overpaid, or paid on a cancelled reservation). */
  creditCents: number;
  paymentStatus: PaymentStatus;
  depositRequiredCents: number;
  depositCollectedCents: number;
  depositReturnedCents: number;
  depositRetainedCents: number;
  /** Deposit money we are currently holding. */
  depositHeldCents: number;
  /** Required deposit not yet collected. */
  depositOutstandingCents: number;
}

/**
 * Computes a reservation's money position from its ledgers. All integer
 * cents. Rental fees and refundable deposits are kept strictly separate.
 * A cancelled reservation owes nothing; anything paid becomes a credit.
 */
export function summarizeFinances(input: {
  status: ReservationStatus;
  itemFeesCents: number[];
  depositRequiredCents: number;
  payments: LedgerPayment[];
  deposits: LedgerDeposit[];
}): FinancialSummary {
  const live = <T extends { isVoided?: boolean }>(xs: T[]) => xs.filter((x) => !x.isVoided);
  const pay = live(input.payments);
  const dep = live(input.deposits);
  const total = (xs: { amountCents: number }[]) => xs.reduce((s, x) => s + x.amountCents, 0);

  const cancelled = input.status === "CANCELLED";
  const rentalFeeCents = input.itemFeesCents.reduce((s, c) => s + c, 0);
  const paidCents = total(pay.filter((p) => p.kind === "PAYMENT"));
  const refundedCents = total(pay.filter((p) => p.kind === "REFUND"));
  const waivedCents = total(pay.filter((p) => p.kind === "WAIVER"));
  const netPaidCents = paidCents - refundedCents;

  const owed = cancelled ? 0 : rentalFeeCents;
  const covered = netPaidCents + waivedCents;
  const balanceDueCents = Math.max(0, owed - covered);
  const creditCents = Math.max(0, netPaidCents - Math.max(0, owed - waivedCents));

  let paymentStatus: PaymentStatus;
  if (refundedCents > 0 && netPaidCents <= 0) paymentStatus = "REFUNDED";
  else if (owed === 0 && rentalFeeCents === 0) paymentStatus = "NO_FEE";
  else if (cancelled) paymentStatus = netPaidCents > 0 ? "PAID" : waivedCents > 0 ? "WAIVED" : "UNPAID";
  else if (waivedCents >= owed && netPaidCents <= 0) paymentStatus = "WAIVED";
  else if (balanceDueCents === 0) paymentStatus = "PAID";
  else if (netPaidCents > 0 || waivedCents > 0) paymentStatus = "PARTIALLY_PAID";
  else paymentStatus = "UNPAID";

  const depositCollectedCents = total(dep.filter((d) => d.kind === "COLLECTED"));
  const depositReturnedCents = total(dep.filter((d) => d.kind === "RETURNED"));
  const depositRetainedCents = total(dep.filter((d) => d.kind === "RETAINED"));
  const depositHeldCents = depositCollectedCents - depositReturnedCents - depositRetainedCents;
  const depositOutstandingCents = cancelled ? 0 : Math.max(0, input.depositRequiredCents - depositCollectedCents);

  return {
    rentalFeeCents,
    paidCents,
    refundedCents,
    waivedCents,
    netPaidCents,
    balanceDueCents,
    creditCents,
    paymentStatus,
    depositRequiredCents: input.depositRequiredCents,
    depositCollectedCents,
    depositReturnedCents,
    depositRetainedCents,
    depositHeldCents,
    depositOutstandingCents,
  };
}

/** Validates a new deposit transaction against what is currently held. */
export function validateDepositTransaction(
  summary: Pick<FinancialSummary, "depositHeldCents">,
  kind: DepositTransactionKind,
  amountCents: number
): string | null {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return "Amount must be greater than zero.";
  if ((kind === "RETURNED" || kind === "RETAINED") && amountCents > summary.depositHeldCents) {
    return `Only ${(summary.depositHeldCents / 100).toFixed(2)} of deposit is currently held for this reservation.`;
  }
  return null;
}

/** Validates a new refund against net payments. */
export function validateRefund(summary: Pick<FinancialSummary, "netPaidCents">, amountCents: number): string | null {
  if (amountCents > summary.netPaidCents) {
    return `A refund cannot exceed the ${(summary.netPaidCents / 100).toFixed(2)} paid so far.`;
  }
  return null;
}
