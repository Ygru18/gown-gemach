import "server-only";
import { z } from "zod";
import { prisma, type Tx } from "@/lib/db";
import { assertCan, can, type Actor } from "@/lib/permissions";
import { logActivity } from "@/lib/audit";
import { moneyCents, optText, parseInput, reqText, ymd } from "@/lib/validation";
import { CONDITIONS, customerCode, gownCode, reservationCode, parseCode, phoneDigits } from "@/lib/format";
import { addDays, diffDays, fromDbDate, rangesOverlap, toDbDate } from "@/lib/dates";
import { AppError, ConflictError, ForbiddenError, NotFoundError, isDoubleBookingViolation } from "@/lib/errors";
import { deriveReservationStatus, isItemOverdue, READY_STATES, TERMINAL_STATES } from "@/lib/gownStatus";
import { checkAvailability, type AvailabilityIssue } from "./availability";
import { getSettings } from "./settings";
import { lockGown, refreshGownStatus, setGownStatus } from "./gownState";
import { createCustomerTx, customerSchema } from "./customers";
import { registerPhotosTx } from "./gowns";
import { todayYmd } from "@/lib/dates";
import type { GownCondition, Prisma, ReservationItemStatus } from "@/generated/prisma/client";

const condition = z
  .union([z.enum(CONDITIONS as [GownCondition, ...GownCondition[]]), z.literal("")]).nullish()
  .transform((v) => (v ? (v as GownCondition) : null));

const bool = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.boolean()]).nullish()
  .transform((v) => v === "on" || v === "true" || v === true);

const itemInput = z
  .object({
    gownId: z.string().uuid("Please choose a gown"),
    pickupDate: ymd("Pickup date"),
    returnDate: ymd("Expected return date"),
    rentalFeeCents: moneyCents("Rental fee"),
    notes: optText(1000).optional(),
  })
  .refine((v) => v.returnDate >= v.pickupDate, { message: "The expected return date must be on or after the pickup date", path: ["returnDate"] });

export const createReservationSchema = z
  .object({
    customerId: z.string().uuid().optional().nullable(),
    newCustomer: customerSchema.optional().nullable(),
    requestDate: ymd("Request date"),
    depositRequiredCents: moneyCents("Security deposit"),
    notes: optText(5000),
    items: z.array(itemInput).min(1, "Please add at least one gown"),
  })
  .refine((v) => v.customerId || v.newCustomer, { message: "Please choose or add a customer", path: ["customerId"] });

function conflictMessage(gownLabel: string, issues: AvailabilityIssue[]) {
  return `${gownLabel} is not available for those dates: ${issues.map((i) => i.message).join(" ")}`;
}

function mapDbError(err: unknown): never {
  if (isDoubleBookingViolation(err)) {
    throw new ConflictError(
      "That gown was just booked for overlapping dates (possibly by another staff member at the same moment). Nothing was saved — please refresh and check availability again."
    );
  }
  throw err;
}

async function recomputeReservationStatus(tx: Tx, reservationId: string) {
  const items = await tx.reservationItem.findMany({ where: { reservationId }, select: { status: true } });
  const status = deriveReservationStatus(items.map((i) => i.status));
  await tx.reservation.update({ where: { id: reservationId }, data: { status } });
  return status;
}

function blocks(status: ReservationItemStatus) {
  return status === "CONFIRMED" || status === "CHECKED_OUT";
}

// ---------------------------------------------------------------------------
// Step 1: create a pending reservation
// ---------------------------------------------------------------------------

export async function createReservation(actor: Actor, input: unknown) {
  assertCan(actor, "operate");
  const data = parseInput(createReservationSchema, input);
  // The same gown twice with overlapping dates in one request is a mistake.
  for (let i = 0; i < data.items.length; i++) {
    for (let j = i + 1; j < data.items.length; j++) {
      const a = data.items[i]!;
      const b = data.items[j]!;
      if (a.gownId === b.gownId && rangesOverlap(a.pickupDate, a.returnDate, b.pickupDate, b.returnDate)) {
        throw new AppError("The same gown appears twice with overlapping dates.");
      }
    }
  }
  try {
    return await prisma.$transaction(async (tx) => {
      const settings = await getSettings(tx);
      const today = todayYmd(settings.timezone);
      let customerId = data.customerId ?? null;
      if (!customerId && data.newCustomer) {
        customerId = (await createCustomerTx(tx, actor, data.newCustomer)).id;
      }
      const customer = await tx.customer.findUnique({ where: { id: customerId! } });
      if (!customer) throw new NotFoundError("Customer");

      const gownIds = [...new Set(data.items.map((i) => i.gownId))].sort();
      for (const id of gownIds) await lockGown(tx, id);
      const gowns = await tx.gown.findMany({ where: { id: { in: gownIds } } });
      const byId = new Map(gowns.map((g) => [g.id, g]));

      for (const it of data.items) {
        const g = byId.get(it.gownId);
        if (!g) throw new NotFoundError("Gown");
        const res = await checkAvailability(it.gownId, it.pickupDate, it.returnDate, { today, tx });
        if (res.conflicts.length) throw new ConflictError(conflictMessage(gownCode(g.number), res.conflicts));
      }

      const reservation = await tx.reservation.create({
        data: {
          customerId: customer.id,
          status: "PENDING",
          requestDate: toDbDate(data.requestDate),
          depositRequiredCents: data.depositRequiredCents,
          notes: data.notes,
          createdById: actor.id,
          items: {
            create: data.items.map((it) => ({
              gownId: it.gownId,
              status: "PENDING" as const,
              requestedPickupDate: toDbDate(it.pickupDate),
              expectedReturnDate: toDbDate(it.returnDate),
              blockedThroughDate: toDbDate(addDays(it.returnDate, settings.turnaroundBufferDays)),
              rentalFeeCents: it.rentalFeeCents,
              notes: it.notes ?? null,
            })),
          },
        },
      });
      for (const id of gownIds) await refreshGownStatus(tx, actor, id, `Pending reservation ${reservationCode(reservation.number)}`);
      await logActivity(tx, actor, {
        action: "reservation.create",
        entityType: "reservation",
        entityId: reservation.id,
        summary: `Created pending reservation ${reservationCode(reservation.number)} for ${customer.fullName} (${data.items.map((i) => gownCode(byId.get(i.gownId)!.number)).join(", ")})`,
      });
      return reservation;
    });
  } catch (err) {
    mapDbError(err);
  }
}

// ---------------------------------------------------------------------------
// Step 2: confirm
// ---------------------------------------------------------------------------

export const confirmSchema = z.object({
  pickupDates: z.record(z.string(), ymd("Confirmed pickup date")).default({}),
  override: bool,
  overrideReason: optText(1000),
});

export async function confirmReservation(actor: Actor, reservationId: string, input: unknown) {
  assertCan(actor, "operate");
  const data = parseInput(confirmSchema, input ?? {});
  try {
    return await prisma.$transaction(async (tx) => {
      const settings = await getSettings(tx);
      const today = todayYmd(settings.timezone);
      if (data.override) {
        if (!can(actor, "availability.override", { allowAssistantOverride: settings.allowAssistantOverride })) {
          throw new ForbiddenError("Only an administrator can override an availability conflict.");
        }
        if (!data.overrideReason) throw new AppError("Please give a reason for overriding the conflict.", { overrideReason: "A reason is required" });
      }
      const reservation = await tx.reservation.findUnique({
        where: { id: reservationId },
        include: { items: { include: { gown: true } }, customer: true },
      });
      if (!reservation) throw new NotFoundError("Reservation");
      const pending = reservation.items.filter((i) => i.status === "PENDING");
      if (pending.length === 0) throw new ConflictError("This reservation has no pending gowns to confirm.");

      for (const id of [...new Set(pending.map((i) => i.gownId))].sort()) await lockGown(tx, id);
      const overridden: string[] = [];
      for (const it of pending) {
        const pickup = data.pickupDates[it.id] ?? fromDbDate(it.requestedPickupDate);
        const ret = fromDbDate(it.expectedReturnDate);
        if (ret < pickup) throw new AppError(`${gownCode(it.gown.number)}: the confirmed pickup date is after the expected return date.`);
        if (TERMINAL_STATES.includes(it.gown.status)) {
          throw new ConflictError(`${gownCode(it.gown.number)} is ${it.gown.status === "DISPOSED" ? "disposed" : "archived"} and cannot be confirmed. Remove it from the reservation.`);
        }
        const res = await checkAvailability(it.gownId, pickup, ret, { today, tx, excludeItemIds: [it.id] });
        let conflictOverride = false;
        if (res.conflicts.length) {
          if (!data.override) throw new ConflictError(conflictMessage(gownCode(it.gown.number), res.conflicts));
          conflictOverride = true;
          overridden.push(`${gownCode(it.gown.number)}: ${res.conflicts.map((c) => c.message).join(" ")}`);
        }
        await tx.reservationItem.update({
          where: { id: it.id },
          data: {
            status: "CONFIRMED",
            confirmedPickupDate: toDbDate(pickup),
            blockedThroughDate: toDbDate(addDays(ret, settings.turnaroundBufferDays)),
            blocksAvailability: true,
            conflictOverride,
            overrideReason: conflictOverride ? data.overrideReason : null,
            overrideById: conflictOverride ? actor.id : null,
          },
        });
      }
      await tx.reservation.update({
        where: { id: reservationId },
        data: { confirmedAt: reservation.confirmedAt ?? new Date(), confirmedById: reservation.confirmedById ?? actor.id },
      });
      await recomputeReservationStatus(tx, reservationId);
      for (const id of new Set(pending.map((i) => i.gownId))) await refreshGownStatus(tx, actor, id, `Confirmed on ${reservationCode(reservation.number)}`);
      await logActivity(tx, actor, {
        action: "reservation.confirm",
        entityType: "reservation",
        entityId: reservationId,
        summary: `Confirmed reservation ${reservationCode(reservation.number)} for ${reservation.customer.fullName}`,
      });
      if (overridden.length) {
        await logActivity(tx, actor, {
          action: "reservation.override",
          entityType: "reservation",
          entityId: reservationId,
          summary: `OVERRODE availability conflict on ${reservationCode(reservation.number)}. Reason: ${data.overrideReason}`,
          details: { conflicts: overridden, reason: data.overrideReason },
        });
      }
    });
  } catch (err) {
    mapDbError(err);
  }
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

export const reservationDetailsSchema = z.object({
  requestDate: ymd("Request date"),
  depositRequiredCents: moneyCents("Security deposit"),
  notes: optText(5000),
});

export async function updateReservationDetails(actor: Actor, reservationId: string, input: unknown) {
  assertCan(actor, "operate");
  const data = parseInput(reservationDetailsSchema, input);
  return prisma.$transaction(async (tx) => {
    const r = await tx.reservation.update({
      where: { id: reservationId },
      data: { requestDate: toDbDate(data.requestDate), depositRequiredCents: data.depositRequiredCents, notes: data.notes },
    });
    await logActivity(tx, actor, { action: "reservation.update", entityType: "reservation", entityId: reservationId, summary: `Updated reservation ${reservationCode(r.number)}` });
    return r;
  });
}

export const itemUpdateSchema = z.object({
  pickupDate: ymd("Pickup date"),
  returnDate: ymd("Expected return date"),
  rentalFeeCents: moneyCents("Rental fee"),
  notes: optText(1000),
  override: bool,
  overrideReason: optText(1000),
});

export async function updateReservationItem(actor: Actor, itemId: string, input: unknown) {
  assertCan(actor, "operate");
  const data = parseInput(itemUpdateSchema, input);
  try {
    return await prisma.$transaction(async (tx) => {
      const settings = await getSettings(tx);
      const today = todayYmd(settings.timezone);
      const item = await tx.reservationItem.findUnique({ where: { id: itemId }, include: { gown: true, reservation: true } });
      if (!item) throw new NotFoundError("Reservation item");
      await lockGown(tx, item.gownId);
      const label = gownCode(item.gown.number);
      const changes: Prisma.ReservationItemUpdateInput = { rentalFeeCents: data.rentalFeeCents, notes: data.notes };

      if (item.status === "PENDING" || item.status === "CONFIRMED" || item.status === "CHECKED_OUT") {
        const pickup = item.status === "CHECKED_OUT" ? fromDbDate(item.actualPickupDate ?? item.confirmedPickupDate ?? item.requestedPickupDate) : data.pickupDate;
        if (data.returnDate < pickup) throw new AppError("The expected return date must be on or after the pickup date.", { returnDate: "Must be on or after pickup" });
        const res = await checkAvailability(item.gownId, pickup, data.returnDate, { today, tx, excludeItemIds: [item.id] });
        let conflictOverride = item.conflictOverride;
        if (res.conflicts.length && item.status !== "PENDING") {
          if (!data.override) throw new ConflictError(conflictMessage(label, res.conflicts));
          if (!can(actor, "availability.override", { allowAssistantOverride: settings.allowAssistantOverride })) {
            throw new ForbiddenError("Only an administrator can override an availability conflict.");
          }
          if (!data.overrideReason) throw new AppError("Please give a reason for overriding the conflict.", { overrideReason: "A reason is required" });
          conflictOverride = true;
          await logActivity(tx, actor, {
            action: "reservation.override",
            entityType: "reservation",
            entityId: item.reservationId,
            summary: `OVERRODE availability conflict changing ${label} on ${reservationCode(item.reservation.number)}. Reason: ${data.overrideReason}`,
            details: { conflicts: res.conflicts.map((c) => c.message) },
          });
        } else if (res.conflicts.length && item.status === "PENDING") {
          throw new ConflictError(conflictMessage(label, res.conflicts));
        }
        if (item.status === "PENDING") changes.requestedPickupDate = toDbDate(pickup);
        if (item.status === "CONFIRMED") changes.confirmedPickupDate = toDbDate(pickup);
        changes.expectedReturnDate = toDbDate(data.returnDate);
        changes.blockedThroughDate = toDbDate(addDays(data.returnDate, settings.turnaroundBufferDays));
        changes.conflictOverride = conflictOverride;
        if (conflictOverride && data.override) {
          changes.overrideReason = data.overrideReason;
          changes.overrideById = actor.id;
        }
      }
      await tx.reservationItem.update({ where: { id: itemId }, data: changes });
      await logActivity(tx, actor, {
        action: "reservation.item.update",
        entityType: "reservation",
        entityId: item.reservationId,
        summary: `Updated ${label} on ${reservationCode(item.reservation.number)}`,
      });
    });
  } catch (err) {
    mapDbError(err);
  }
}

export const addItemSchema = z
  .object({
    gownId: z.string().uuid("Please choose a gown"),
    pickupDate: ymd("Pickup date"),
    returnDate: ymd("Expected return date"),
    rentalFeeCents: moneyCents("Rental fee"),
  })
  .refine((v) => v.returnDate >= v.pickupDate, { message: "The expected return date must be on or after the pickup date", path: ["returnDate"] });

export async function addReservationItem(actor: Actor, reservationId: string, input: unknown) {
  assertCan(actor, "operate");
  const data = parseInput(addItemSchema, input);
  try {
    return await prisma.$transaction(async (tx) => {
      const settings = await getSettings(tx);
      const today = todayYmd(settings.timezone);
      const reservation = await tx.reservation.findUnique({ where: { id: reservationId } });
      if (!reservation) throw new NotFoundError("Reservation");
      if (reservation.status === "CANCELLED" || reservation.status === "RETURNED") {
        throw new ConflictError("Gowns cannot be added to a cancelled or completed reservation. Create a new reservation instead.");
      }
      await lockGown(tx, data.gownId);
      const gown = await tx.gown.findUniqueOrThrow({ where: { id: data.gownId } });
      const res = await checkAvailability(data.gownId, data.pickupDate, data.returnDate, { today, tx });
      if (res.conflicts.length) throw new ConflictError(conflictMessage(gownCode(gown.number), res.conflicts));
      const confirmed = reservation.status !== "PENDING";
      await tx.reservationItem.create({
        data: {
          reservationId,
          gownId: data.gownId,
          status: confirmed ? "CONFIRMED" : "PENDING",
          requestedPickupDate: toDbDate(data.pickupDate),
          confirmedPickupDate: confirmed ? toDbDate(data.pickupDate) : null,
          expectedReturnDate: toDbDate(data.returnDate),
          blockedThroughDate: toDbDate(addDays(data.returnDate, settings.turnaroundBufferDays)),
          blocksAvailability: confirmed,
          rentalFeeCents: data.rentalFeeCents,
        },
      });
      await recomputeReservationStatus(tx, reservationId);
      await refreshGownStatus(tx, actor, data.gownId, `Added to ${reservationCode(reservation.number)}`);
      await logActivity(tx, actor, {
        action: "reservation.item.add",
        entityType: "reservation",
        entityId: reservationId,
        summary: `Added ${gownCode(gown.number)} to ${reservationCode(reservation.number)}${confirmed ? " (confirmed)" : ""}`,
      });
    });
  } catch (err) {
    mapDbError(err);
  }
}

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

export async function cancelReservationItem(actor: Actor, itemId: string, reason: string | null) {
  assertCan(actor, "operate");
  const why = parseInput(optText(1000), reason);
  return prisma.$transaction(async (tx) => {
    const item = await tx.reservationItem.findUnique({ where: { id: itemId }, include: { gown: true, reservation: true } });
    if (!item) throw new NotFoundError("Reservation item");
    if (item.status === "CHECKED_OUT") throw new ConflictError("This gown is checked out — process the return instead of cancelling.");
    if (item.status === "RETURNED" || item.status === "CANCELLED") throw new ConflictError("This gown is already returned or cancelled.");
    await lockGown(tx, item.gownId);
    await tx.reservationItem.update({ where: { id: itemId }, data: { status: "CANCELLED", blocksAvailability: false, cancelledAt: new Date() } });
    const status = await recomputeReservationStatus(tx, item.reservationId);
    if (status === "CANCELLED") {
      await tx.reservation.update({ where: { id: item.reservationId }, data: { cancelledAt: new Date(), cancelledById: actor.id, cancellationReason: why } });
    }
    await refreshGownStatus(tx, actor, item.gownId, `Removed from ${reservationCode(item.reservation.number)}`);
    await logActivity(tx, actor, {
      action: "reservation.item.cancel",
      entityType: "reservation",
      entityId: item.reservationId,
      summary: `Removed ${gownCode(item.gown.number)} from ${reservationCode(item.reservation.number)}${why ? `: ${why}` : ""}`,
    });
  });
}

export async function cancelReservation(actor: Actor, reservationId: string, reason: string | null) {
  assertCan(actor, "operate");
  const why = parseInput(optText(1000), reason);
  return prisma.$transaction(async (tx) => {
    const r = await tx.reservation.findUnique({ where: { id: reservationId }, include: { items: true, customer: true } });
    if (!r) throw new NotFoundError("Reservation");
    if (r.status === "CANCELLED") return;
    if (r.items.some((i) => i.status === "CHECKED_OUT")) {
      throw new ConflictError("A gown on this reservation is checked out. Process its return first; then the rest can be cancelled.");
    }
    const open = r.items.filter((i) => i.status === "PENDING" || i.status === "CONFIRMED");
    if (open.length === 0) throw new ConflictError("There is nothing left to cancel on this reservation.");
    for (const id of [...new Set(open.map((i) => i.gownId))].sort()) await lockGown(tx, id);
    await tx.reservationItem.updateMany({
      where: { id: { in: open.map((i) => i.id) } },
      data: { status: "CANCELLED", blocksAvailability: false, cancelledAt: new Date() },
    });
    const status = await recomputeReservationStatus(tx, reservationId);
    await tx.reservation.update({
      where: { id: reservationId },
      data: status === "CANCELLED" ? { cancelledAt: new Date(), cancelledById: actor.id, cancellationReason: why } : {},
    });
    for (const id of new Set(open.map((i) => i.gownId))) await refreshGownStatus(tx, actor, id, `${reservationCode(r.number)} cancelled`);
    await logActivity(tx, actor, {
      action: "reservation.cancel",
      entityType: "reservation",
      entityId: reservationId,
      summary: `Cancelled reservation ${reservationCode(r.number)} for ${r.customer.fullName}${why ? `: ${why}` : ""}`,
    });
  });
}

// ---------------------------------------------------------------------------
// Pickup
// ---------------------------------------------------------------------------

export const pickupSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1, "Please select at least one gown"),
  pickupDate: ymd("Pickup date"),
  condition: condition,
  notes: optText(2000),
});

export async function confirmPickup(actor: Actor, input: unknown) {
  assertCan(actor, "operate");
  const data = parseInput(pickupSchema, input);
  return prisma.$transaction(async (tx) => {
    const items = await tx.reservationItem.findMany({ where: { id: { in: data.itemIds } }, include: { gown: true, reservation: true } });
    if (items.length !== data.itemIds.length) throw new NotFoundError("Reservation item");
    const reservationIds = new Set(items.map((i) => i.reservationId));
    for (const id of [...new Set(items.map((i) => i.gownId))].sort()) await lockGown(tx, id);
    for (const it of items) {
      const label = gownCode(it.gown.number);
      if (it.status === "PENDING") throw new ConflictError(`${label} is still pending. Confirm the reservation before pickup.`);
      if (it.status !== "CONFIRMED") throw new ConflictError(`${label} cannot be picked up (it is ${it.status.toLowerCase().replace("_", " ")}).`);
      const gown = await tx.gown.findUniqueOrThrow({ where: { id: it.gownId } });
      if (!READY_STATES.includes(gown.status)) {
        throw new ConflictError(
          gown.status === "CHECKED_OUT"
            ? `${label} is still checked out to another customer and has not been returned.`
            : `${label} is not ready (${gown.status.toLowerCase().replace(/_/g, " ")}). Complete its inspection/cleaning and mark it ready first.`
        );
      }
      await tx.pickup.create({
        data: { itemId: it.id, pickupDate: toDbDate(data.pickupDate), condition: data.condition, notes: data.notes, processedById: actor.id },
      });
      await tx.reservationItem.update({ where: { id: it.id }, data: { status: "CHECKED_OUT", actualPickupDate: toDbDate(data.pickupDate) } });
      await setGownStatus(tx, actor, it.gownId, "CHECKED_OUT", `Picked up on ${reservationCode(it.reservation.number)}`, data.condition ? { currentCondition: data.condition } : {});
      await logActivity(tx, actor, {
        action: "reservation.pickup",
        entityType: "reservation",
        entityId: it.reservationId,
        summary: `Pickup confirmed: ${label} on ${reservationCode(it.reservation.number)}`,
      });
    }
    for (const id of reservationIds) await recomputeReservationStatus(tx, id);
  });
}

// ---------------------------------------------------------------------------
// Return → Pending Inspection
// ---------------------------------------------------------------------------

export const returnSchema = z.object({
  itemId: z.string().uuid(),
  returnDate: ymd("Return date"),
  condition: condition,
  hasDamage: bool,
  damageNotes: optText(2000),
  notes: optText(2000),
  damagePhotos: z.array(z.object({ full: z.string(), thumb: z.string().nullable().optional() })).max(20).default([]),
});

export async function markReturned(actor: Actor, input: unknown) {
  assertCan(actor, "operate");
  const data = parseInput(returnSchema, input);
  if (data.hasDamage && !data.damageNotes) throw new AppError("Please describe the damage.", { damageNotes: "Describe the damage" });
  return prisma.$transaction(async (tx) => {
    const item = await tx.reservationItem.findUnique({ where: { id: data.itemId }, include: { gown: true, reservation: { include: { customer: true } } } });
    if (!item) throw new NotFoundError("Reservation item");
    const label = gownCode(item.gown.number);
    if (item.status !== "CHECKED_OUT") throw new ConflictError(`${label} is not checked out, so it cannot be returned.`);
    await lockGown(tx, item.gownId);
    const pickedUp = fromDbDate(item.actualPickupDate ?? item.confirmedPickupDate ?? item.requestedPickupDate);
    if (data.returnDate < pickedUp) throw new AppError("The return date cannot be before the pickup date.", { returnDate: "Before pickup date" });
    const daysLate = Math.max(0, diffDays(fromDbDate(item.expectedReturnDate), data.returnDate));
    const ret = await tx.gownReturn.create({
      data: {
        itemId: item.id,
        returnDate: toDbDate(data.returnDate),
        condition: data.condition,
        hasDamage: data.hasDamage,
        damageNotes: data.damageNotes,
        notes: data.notes,
        daysLate,
        processedById: actor.id,
      },
    });
    if (data.damagePhotos.length) await registerPhotosTx(tx, actor, item.gownId, data.damagePhotos, "DAMAGE", ret.id);
    await tx.reservationItem.update({
      where: { id: item.id },
      data: { status: "RETURNED", actualReturnDate: toDbDate(data.returnDate), blocksAvailability: false },
    });
    // NEVER straight to Available: an inspection decision is required.
    await setGownStatus(tx, actor, item.gownId, "PENDING_INSPECTION", `Returned on ${reservationCode(item.reservation.number)} — awaiting inspection`, data.condition ? { currentCondition: data.condition } : {});
    await recomputeReservationStatus(tx, item.reservationId);
    await logActivity(tx, actor, {
      action: "reservation.return",
      entityType: "reservation",
      entityId: item.reservationId,
      summary: `Returned: ${label} from ${item.reservation.customer.fullName} (${reservationCode(item.reservation.number)})${daysLate ? `, ${daysLate} day${daysLate === 1 ? "" : "s"} late` : ""}${data.hasDamage ? " — damage reported" : ""}`,
    });
    return ret;
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export interface ReservationFilters {
  q?: string;
  status?: string; // ReservationStatus | "OVERDUE" | "active" | "all"
  from?: string;
  to?: string;
}

export function reservationWhere(f: ReservationFilters, today: string): Prisma.ReservationWhereInput {
  const and: Prisma.ReservationWhereInput[] = [];
  const status = f.status || "active";
  if (status === "active") and.push({ status: { in: ["PENDING", "CONFIRMED", "CHECKED_OUT"] } });
  else if (status === "OVERDUE") and.push({ items: { some: { status: "CHECKED_OUT", expectedReturnDate: { lt: toDbDate(today) } } } });
  else if (["PENDING", "CONFIRMED", "CHECKED_OUT", "RETURNED", "CANCELLED"].includes(status)) and.push({ status: status as never });
  if (f.from) and.push({ items: { some: { expectedReturnDate: { gte: toDbDate(f.from) } } } });
  if (f.to) and.push({ items: { some: { requestedPickupDate: { lte: toDbDate(f.to) } } } });
  const q = f.q?.trim();
  if (q) {
    const or: Prisma.ReservationWhereInput[] = [
      { customer: { fullName: { contains: q, mode: "insensitive" } } },
      { notes: { contains: q, mode: "insensitive" } },
    ];
    const digits = phoneDigits(q);
    if (digits.length >= 3) or.push({ customer: { phoneDigits: { contains: digits } } });
    const r = parseCode(q, "R");
    if (r) or.push({ number: r });
    const g = /^g/i.test(q) ? parseCode(q, "G") : null;
    if (g) or.push({ items: { some: { gown: { number: g } } } });
    and.push({ OR: or });
  }
  return and.length ? { AND: and } : {};
}

export const reservationListInclude = {
  customer: { select: { id: true, fullName: true, phone: true, number: true } },
  items: {
    include: { gown: { select: { id: true, number: true, description: true, size: true, color: true } } },
    orderBy: { requestedPickupDate: "asc" as const },
  },
  payments: { select: { kind: true, amountCents: true, isVoided: true } },
  deposits: { select: { kind: true, amountCents: true, isVoided: true } },
} satisfies Prisma.ReservationInclude;

export async function listReservations(f: ReservationFilters, today: string, take = 200) {
  return prisma.reservation.findMany({
    where: reservationWhere(f, today),
    include: reservationListInclude,
    orderBy: [{ createdAt: "desc" }],
    take,
  });
}

export async function getReservationDetail(id: string) {
  return prisma.reservation.findUnique({
    where: { id },
    include: {
      customer: true,
      items: {
        orderBy: { requestedPickupDate: "asc" },
        include: {
          gown: { include: { photos: { where: { kind: "GALLERY" }, orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1 } } },
          pickup: true,
          gownReturn: { include: { damagePhotos: true, inspection: true } },
        },
      },
      payments: { orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }] },
      deposits: { orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }] },
    },
  });
}

export function displayReservationStatus(r: { status: string; items: { status: ReservationItemStatus; expectedReturnDate: Date }[] }, today: string) {
  if (r.items.some((i) => isItemOverdue({ status: i.status, expectedReturnDate: fromDbDate(i.expectedReturnDate) }, today))) return "OVERDUE" as const;
  return r.status as "PENDING" | "CONFIRMED" | "CHECKED_OUT" | "RETURNED" | "CANCELLED";
}

export async function calendarItems(from: string, to: string) {
  return prisma.reservationItem.findMany({
    where: {
      status: { in: ["PENDING", "CONFIRMED", "CHECKED_OUT", "RETURNED"] },
      requestedPickupDate: { lte: toDbDate(to) },
      OR: [{ expectedReturnDate: { gte: toDbDate(from) } }, { status: "CHECKED_OUT" }],
    },
    include: {
      gown: { select: { number: true, description: true } },
      reservation: { select: { id: true, number: true, customer: { select: { fullName: true } } } },
    },
    orderBy: { requestedPickupDate: "asc" },
  });
}

export const RESERVATION_CODE = (n: number) => reservationCode(n);
export const CUSTOMER_CODE = (n: number) => customerCode(n);
export { reqText };
