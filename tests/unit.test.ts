import { describe, expect, it } from "vitest";
import { centsToInput, formatCents, parseMoneyToCents } from "@/lib/money";
import { addDays, diffDays, isYmd, rangesOverlap, todayYmd } from "@/lib/dates";
import { summarizeFinances, validateDepositTransaction, validateRefund } from "@/lib/finance";
import { deriveGownStatus, deriveReservationStatus, isItemOverdue } from "@/lib/gownStatus";
import { can } from "@/lib/permissions";
import { parseCode, sizeSortValue, formatPhone } from "@/lib/format";

describe("money (integer cents, never floats)", () => {
  it("parses dollar strings exactly", () => {
    expect(parseMoneyToCents("36")).toBe(3600);
    expect(parseMoneyToCents("36.5")).toBe(3650);
    expect(parseMoneyToCents("$1,250.05")).toBe(125005);
    expect(parseMoneyToCents("0.10")).toBe(10);
    expect(parseMoneyToCents("0.29")).toBe(29); // 0.29*100 = 28.999… in floats
    expect(parseMoneyToCents("")).toBeNull();
    expect(parseMoneyToCents("abc")).toBeNull();
    expect(parseMoneyToCents("1.234")).toBeNull();
    expect(parseMoneyToCents("-5")).toBeNull();
  });
  it("formats cents", () => {
    expect(formatCents(125005)).toBe("$1,250.05");
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(-500)).toBe("−$5.00");
    expect(centsToInput(3650)).toBe("36.50");
  });
});

describe("dates", () => {
  it("validates and does arithmetic in UTC", () => {
    expect(isYmd("2026-02-29")).toBe(false);
    expect(isYmd("2028-02-29")).toBe(true);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09"); // DST day
    expect(diffDays("2026-11-01", "2026-11-15")).toBe(14);
    expect(rangesOverlap("2026-01-01", "2026-01-05", "2026-01-05", "2026-01-09")).toBe(true);
    expect(rangesOverlap("2026-01-01", "2026-01-04", "2026-01-05", "2026-01-09")).toBe(false);
  });
  it("computes today in the Gemach's timezone", () => {
    const lateNightUtc = new Date("2026-11-16T03:30:00Z"); // 10:30pm Nov 15 in New York
    expect(todayYmd("America/New_York", lateNightUtc)).toBe("2026-11-15");
    expect(todayYmd("UTC", lateNightUtc)).toBe("2026-11-16");
  });
});

describe("finance summary", () => {
  const base = { status: "CONFIRMED" as const, itemFeesCents: [3600, 2400], depositRequiredCents: 10000, payments: [], deposits: [] };
  it("unpaid", () => {
    const s = summarizeFinances(base);
    expect(s.rentalFeeCents).toBe(6000);
    expect(s.balanceDueCents).toBe(6000);
    expect(s.paymentStatus).toBe("UNPAID");
    expect(s.depositOutstandingCents).toBe(10000);
  });
  it("partial, paid, waived, refunded", () => {
    expect(summarizeFinances({ ...base, payments: [{ kind: "PAYMENT", amountCents: 2000 }] }).paymentStatus).toBe("PARTIALLY_PAID");
    const paid = summarizeFinances({ ...base, payments: [{ kind: "PAYMENT", amountCents: 2000 }, { kind: "PAYMENT", amountCents: 4000 }] });
    expect(paid.paymentStatus).toBe("PAID");
    expect(paid.balanceDueCents).toBe(0);
    const waived = summarizeFinances({ ...base, payments: [{ kind: "WAIVER", amountCents: 6000 }] });
    expect(waived.paymentStatus).toBe("WAIVED");
    expect(waived.balanceDueCents).toBe(0);
    const partWaived = summarizeFinances({ ...base, payments: [{ kind: "PAYMENT", amountCents: 3000 }, { kind: "WAIVER", amountCents: 3000 }] });
    expect(partWaived.paymentStatus).toBe("PAID");
    const refunded = summarizeFinances({ ...base, status: "CANCELLED", payments: [{ kind: "PAYMENT", amountCents: 6000 }, { kind: "REFUND", amountCents: 6000 }] });
    expect(refunded.paymentStatus).toBe("REFUNDED");
    expect(refunded.creditCents).toBe(0);
  });
  it("ignores voided entries", () => {
    const s = summarizeFinances({ ...base, payments: [{ kind: "PAYMENT", amountCents: 6000, isVoided: true }] });
    expect(s.balanceDueCents).toBe(6000);
  });
  it("cancelled reservations owe nothing; payments become a credit", () => {
    const s = summarizeFinances({ ...base, status: "CANCELLED", payments: [{ kind: "PAYMENT", amountCents: 2500 }] });
    expect(s.balanceDueCents).toBe(0);
    expect(s.creditCents).toBe(2500);
    expect(s.depositOutstandingCents).toBe(0);
  });
  it("keeps deposits separate from rental fees", () => {
    const s = summarizeFinances({
      ...base,
      payments: [{ kind: "PAYMENT", amountCents: 6000 }],
      deposits: [
        { kind: "COLLECTED", amountCents: 10000 },
        { kind: "RETAINED", amountCents: 2500 },
        { kind: "RETURNED", amountCents: 7500 },
      ],
    });
    expect(s.balanceDueCents).toBe(0);
    expect(s.netPaidCents).toBe(6000);
    expect(s.depositHeldCents).toBe(0);
    expect(s.depositRetainedCents).toBe(2500);
  });
  it("validates deposit returns and refunds", () => {
    expect(validateDepositTransaction({ depositHeldCents: 5000 }, "RETURNED", 6000)).toMatch(/currently held/);
    expect(validateDepositTransaction({ depositHeldCents: 5000 }, "RETURNED", 5000)).toBeNull();
    expect(validateRefund({ netPaidCents: 1000 }, 1500)).toMatch(/cannot exceed/);
  });
});

describe("gown status rules", () => {
  it("never makes a returned gown available without inspection", () => {
    expect(deriveGownStatus("PENDING_INSPECTION", [])).toBe("PENDING_INSPECTION");
    expect(deriveGownStatus("PENDING_CLEANING", ["CONFIRMED"])).toBe("PENDING_CLEANING");
    expect(deriveGownStatus("CHECKED_OUT", [])).toBe("PENDING_INSPECTION");
  });
  it("reflects reservations on ready gowns", () => {
    expect(deriveGownStatus("AVAILABLE", ["PENDING"])).toBe("PENDING_RESERVATION");
    expect(deriveGownStatus("PENDING_RESERVATION", ["PENDING", "CONFIRMED"])).toBe("RESERVED");
    expect(deriveGownStatus("RESERVED", [])).toBe("AVAILABLE");
    expect(deriveGownStatus("RESERVED", ["CHECKED_OUT"])).toBe("CHECKED_OUT");
    expect(deriveGownStatus("ARCHIVED", ["CONFIRMED"])).toBe("ARCHIVED");
  });
  it("derives reservation status from items", () => {
    expect(deriveReservationStatus(["PENDING", "PENDING"])).toBe("PENDING");
    expect(deriveReservationStatus(["CONFIRMED", "CANCELLED"])).toBe("CONFIRMED");
    expect(deriveReservationStatus(["CHECKED_OUT", "RETURNED"])).toBe("CHECKED_OUT");
    expect(deriveReservationStatus(["RETURNED", "CANCELLED"])).toBe("RETURNED");
    expect(deriveReservationStatus(["CANCELLED"])).toBe("CANCELLED");
    expect(deriveReservationStatus(["RETURNED", "CONFIRMED"])).toBe("CONFIRMED");
  });
  it("flags overdue", () => {
    expect(isItemOverdue({ status: "CHECKED_OUT", expectedReturnDate: "2026-11-14" }, "2026-11-15")).toBe(true);
    expect(isItemOverdue({ status: "CHECKED_OUT", expectedReturnDate: "2026-11-15" }, "2026-11-15")).toBe(false);
    expect(isItemOverdue({ status: "RETURNED", expectedReturnDate: "2026-11-01" }, "2026-11-15")).toBe(false);
  });
});

describe("permissions", () => {
  const admin = { role: "ADMIN" as const };
  const asst = { role: "ASSISTANT" as const };
  it("gives assistants every operational permission", () => {
    expect(can(asst, "operate")).toBe(true);
  });
  it("restricts exactly the four admin-only areas", () => {
    expect(can(asst, "staff.manage")).toBe(false);
    expect(can(asst, "settings.manage")).toBe(false);
    expect(can(asst, "gown.delete")).toBe(false);
    for (const p of ["staff.manage", "settings.manage", "gown.delete", "operate", "availability.override"] as const) expect(can(admin, p)).toBe(true);
  });
  it("lets the admin extend availability override to assistants", () => {
    expect(can(asst, "availability.override")).toBe(false);
    expect(can(asst, "availability.override", { allowAssistantOverride: true })).toBe(true);
  });
});

describe("formatting", () => {
  it("parses codes", () => {
    expect(parseCode("G-0012", "G")).toBe(12);
    expect(parseCode("g12", "G")).toBe(12);
    expect(parseCode("12", "G")).toBe(12);
    expect(parseCode("lace", "G")).toBeNull();
  });
  it("sorts sizes sensibly and formats phones", () => {
    expect(sizeSortValue("10")).toBe(10);
    expect(sizeSortValue("8-10")).toBe(8);
    expect(sizeSortValue("XS")).toBe(-2);
    expect(formatPhone("7185551234")).toBe("(718) 555-1234");
  });
});
