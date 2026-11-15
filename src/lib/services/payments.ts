import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertCan, type Actor } from "@/lib/permissions";
import { logActivity } from "@/lib/audit";
import { moneyCents, optText, parseInput, reqText, ymd } from "@/lib/validation";
import { reservationCode, PAYMENT_KIND_LABEL, DEPOSIT_KIND_LABEL } from "@/lib/format";
import { formatCents } from "@/lib/money";
import { toDbDate } from "@/lib/dates";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { summarizeFinances, validateDepositTransaction, validateRefund } from "@/lib/finance";
import type { Tx } from "@/lib/db";

const method = z
  .union([z.enum(["CASH", "CHECK", "OTHER"]), z.literal("")]).nullish()
  .transform((v) => (v ? (v as "CASH" | "CHECK" | "OTHER") : null));

export const paymentSchema = z.object({
  kind: z.enum(["PAYMENT", "REFUND", "WAIVER"]),
  amountCents: moneyCents("Amount", { allowZero: false }),
  method,
  paymentDate: ymd("Date"),
  reference: optText(200),
  notes: optText(2000),
});

export const depositSchema = z.object({
  kind: z.enum(["COLLECTED", "RETURNED", "RETAINED"]),
  amountCents: moneyCents("Amount", { allowZero: false }),
  method,
  transactionDate: ymd("Date"),
  reason: optText(1000),
  notes: optText(2000),
});

async function loadSummary(tx: Tx, reservationId: string) {
  const r = await tx.reservation.findUnique({
    where: { id: reservationId },
    include: { items: { select: { rentalFeeCents: true, status: true } }, payments: true, deposits: true },
  });
  if (!r) throw new NotFoundError("Reservation");
  const summary = summarizeFinances({
    status: r.status,
    itemFeesCents: r.items.filter((i) => i.status !== "CANCELLED").map((i) => i.rentalFeeCents),
    depositRequiredCents: r.depositRequiredCents,
    payments: r.payments,
    deposits: r.deposits,
  });
  return { r, summary };
}

async function lockReservation(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM reservations WHERE id = ${id}::uuid FOR UPDATE`;
}

export async function recordPayment(actor: Actor, reservationId: string, input: unknown) {
  assertCan(actor, "operate");
  const data = parseInput(paymentSchema, input);
  if (data.kind !== "WAIVER" && !data.method) throw new AppError("Please choose the payment method.", { method: "Choose cash, check or other" });
  return prisma.$transaction(async (tx) => {
    await lockReservation(tx, reservationId);
    const { r, summary } = await loadSummary(tx, reservationId);
    if (data.kind === "REFUND") {
      const err = validateRefund(summary, data.amountCents);
      if (err) throw new AppError(err, { amountCents: err });
    }
    if (data.kind === "WAIVER" && data.amountCents > summary.balanceDueCents) {
      throw new AppError(`Only ${formatCents(summary.balanceDueCents)} is outstanding, so at most that much can be waived.`, { amountCents: "Too much" });
    }
    const p = await tx.payment.create({
      data: {
        reservationId,
        kind: data.kind,
        amountCents: data.amountCents,
        method: data.method,
        paymentDate: toDbDate(data.paymentDate),
        reference: data.reference,
        notes: data.notes,
        recordedById: actor.id,
      },
    });
    await logActivity(tx, actor, {
      action: `payment.${data.kind.toLowerCase()}`,
      entityType: "reservation",
      entityId: reservationId,
      summary: `${PAYMENT_KIND_LABEL[data.kind]} of ${formatCents(data.amountCents)} recorded on ${reservationCode(r.number)}`,
    });
    return p;
  });
}

export async function updatePayment(actor: Actor, paymentId: string, input: unknown) {
  assertCan(actor, "operate");
  const data = parseInput(paymentSchema, input);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!existing) throw new NotFoundError("Payment");
    if (existing.isVoided) throw new ConflictError("A voided entry cannot be edited.");
    await lockReservation(tx, existing.reservationId);
    const p = await tx.payment.update({
      where: { id: paymentId },
      data: {
        kind: data.kind,
        amountCents: data.amountCents,
        method: data.method,
        paymentDate: toDbDate(data.paymentDate),
        reference: data.reference,
        notes: data.notes,
      },
    });
    const { r, summary } = await loadSummary(tx, existing.reservationId);
    if (summary.netPaidCents < 0) throw new AppError("That change would make refunds larger than payments.");
    await logActivity(tx, actor, {
      action: "payment.edit",
      entityType: "reservation",
      entityId: existing.reservationId,
      summary: `Edited ${PAYMENT_KIND_LABEL[existing.kind].toLowerCase()} on ${reservationCode(r.number)}: ${formatCents(existing.amountCents)} → ${formatCents(p.amountCents)}`,
      details: { before: { ...existing, createdAt: undefined, updatedAt: undefined } as never },
    });
    return p;
  });
}

const voidSchema = z.object({ reason: reqText("Reason", 500) });

export async function voidPayment(actor: Actor, paymentId: string, input: unknown) {
  assertCan(actor, "operate");
  const { reason } = parseInput(voidSchema, input);
  return prisma.$transaction(async (tx) => {
    const p = await tx.payment.findUnique({ where: { id: paymentId }, include: { reservation: true } });
    if (!p) throw new NotFoundError("Payment");
    if (p.isVoided) return;
    await lockReservation(tx, p.reservationId);
    await tx.payment.update({ where: { id: paymentId }, data: { isVoided: true, voidedAt: new Date(), voidedById: actor.id, voidReason: reason } });
    const { summary } = await loadSummary(tx, p.reservationId);
    if (summary.netPaidCents < 0) throw new AppError("Void the refund first — voiding this payment would leave refunds larger than payments.");
    await logActivity(tx, actor, {
      action: "payment.void",
      entityType: "reservation",
      entityId: p.reservationId,
      summary: `Voided ${PAYMENT_KIND_LABEL[p.kind].toLowerCase()} of ${formatCents(p.amountCents)} on ${reservationCode(p.reservation.number)}: ${reason}`,
    });
  });
}

export async function recordDeposit(actor: Actor, reservationId: string, input: unknown) {
  assertCan(actor, "operate");
  const data = parseInput(depositSchema, input);
  if (data.kind !== "RETAINED" && !data.method) throw new AppError("Please choose the payment method.", { method: "Choose cash, check or other" });
  if (data.kind === "RETAINED" && !data.reason) throw new AppError("Please give the reason the deposit is being kept.", { reason: "Reason required" });
  return prisma.$transaction(async (tx) => {
    await lockReservation(tx, reservationId);
    const { r, summary } = await loadSummary(tx, reservationId);
    const err = validateDepositTransaction(summary, data.kind, data.amountCents);
    if (err) throw new AppError(err, { amountCents: err });
    const d = await tx.depositTransaction.create({
      data: {
        reservationId,
        kind: data.kind,
        amountCents: data.amountCents,
        method: data.method,
        transactionDate: toDbDate(data.transactionDate),
        reason: data.reason,
        notes: data.notes,
        recordedById: actor.id,
      },
    });
    await logActivity(tx, actor, {
      action: `deposit.${data.kind.toLowerCase()}`,
      entityType: "reservation",
      entityId: reservationId,
      summary: `${DEPOSIT_KIND_LABEL[data.kind]}: ${formatCents(data.amountCents)} on ${reservationCode(r.number)}`,
    });
    return d;
  });
}

export async function voidDeposit(actor: Actor, depositId: string, input: unknown) {
  assertCan(actor, "operate");
  const { reason } = parseInput(voidSchema, input);
  return prisma.$transaction(async (tx) => {
    const d = await tx.depositTransaction.findUnique({ where: { id: depositId }, include: { reservation: true } });
    if (!d) throw new NotFoundError("Deposit entry");
    if (d.isVoided) return;
    await lockReservation(tx, d.reservationId);
    await tx.depositTransaction.update({ where: { id: depositId }, data: { isVoided: true, voidedAt: new Date(), voidedById: actor.id, voidReason: reason } });
    const { summary } = await loadSummary(tx, d.reservationId);
    if (summary.depositHeldCents < 0) throw new AppError("Void the deposit return/retention first — this would leave a negative deposit balance.");
    await logActivity(tx, actor, {
      action: "deposit.void",
      entityType: "reservation",
      entityId: d.reservationId,
      summary: `Voided ${DEPOSIT_KIND_LABEL[d.kind].toLowerCase()} of ${formatCents(d.amountCents)} on ${reservationCode(d.reservation.number)}: ${reason}`,
    });
  });
}
