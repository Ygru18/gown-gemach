import type { GownStatus } from "@/generated/prisma/enums";
import { GOWN_STATUS_LABEL, RESERVATION_STATUS_LABEL, ITEM_STATUS_LABEL, WORK_STATUS_LABEL } from "@/lib/format";
import { PAYMENT_STATUS_LABEL, type PaymentStatus } from "@/lib/finance";
import { Pill, type Tone } from "./ui";

export const GOWN_TONE: Record<GownStatus, Tone> = {
  AVAILABLE: "green",
  PENDING_RESERVATION: "champagne",
  RESERVED: "blush",
  CHECKED_OUT: "mauve",
  PENDING_INSPECTION: "amber",
  PENDING_CLEANING: "sky",
  NEEDS_ALTERATION: "peach",
  UNAVAILABLE_OTHER: "stone",
  DISPOSED: "grey",
  ARCHIVED: "grey",
};

const RES_TONE: Record<string, Tone> = {
  PENDING: "champagne",
  CONFIRMED: "blush",
  CHECKED_OUT: "mauve",
  RETURNED: "green",
  CANCELLED: "grey",
  OVERDUE: "red",
};

const PAY_TONE: Record<PaymentStatus, Tone> = {
  UNPAID: "amber",
  PARTIALLY_PAID: "champagne",
  PAID: "green",
  REFUNDED: "sky",
  WAIVED: "stone",
  NO_FEE: "neutral",
};

function DotPill({ tone, label }: { tone: Tone; label: string }) {
  return (
    <Pill tone={tone}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {label}
    </Pill>
  );
}

export function GownStatusBadge({ status }: { status: GownStatus }) {
  return <DotPill tone={GOWN_TONE[status]} label={GOWN_STATUS_LABEL[status]} />;
}

export function ReservationStatusBadge({ status }: { status: keyof typeof RESERVATION_STATUS_LABEL }) {
  return <DotPill tone={RES_TONE[status] ?? "neutral"} label={RESERVATION_STATUS_LABEL[status]} />;
}

export function ItemStatusBadge({ status }: { status: keyof typeof ITEM_STATUS_LABEL }) {
  return <DotPill tone={RES_TONE[status] ?? "neutral"} label={ITEM_STATUS_LABEL[status]} />;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <DotPill tone={PAY_TONE[status]} label={PAYMENT_STATUS_LABEL[status]} />;
}

export function WorkStatusBadge({ status }: { status: keyof typeof WORK_STATUS_LABEL }) {
  const tone: Tone = status === "COMPLETED" ? "green" : status === "CANCELLED" ? "grey" : status === "IN_PROGRESS" ? "sky" : "amber";
  return <DotPill tone={tone} label={WORK_STATUS_LABEL[status]} />;
}
