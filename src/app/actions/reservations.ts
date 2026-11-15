"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { formToObject } from "@/lib/validation";
import * as res from "@/lib/services/reservations";
import * as pay from "@/lib/services/payments";
import { checkAvailability } from "@/lib/services/availability";
import { getToday } from "@/lib/services/settings";
import { prisma } from "@/lib/db";
import { reservationCode } from "@/lib/format";
import { isYmd } from "@/lib/dates";
import { ACTIVE_INVENTORY } from "@/lib/services/gowns";
import { parseCode } from "@/lib/format";
import { signedUrls } from "@/lib/storage";
import type { Prisma } from "@/generated/prisma/client";

const refreshAll = (id?: string) => {
  revalidatePath("/reservations");
  revalidatePath("/dashboard");
  revalidatePath("/inventory", "layout");
  revalidatePath("/returns");
  revalidatePath("/customers", "layout");
  if (id) revalidatePath(`/reservations/${id}`);
};

export interface NewReservationPayload {
  customerId: string | null;
  requestDate: string;
  depositRequired: string;
  notes: string;
  items: { gownId: string; pickupDate: string; returnDate: string; rentalFee: string }[];
}

export async function createReservationAction(payload: NewReservationPayload) {
  return runAction(async (actor) => {
    const r = await res.createReservation(actor, {
      customerId: payload.customerId,
      requestDate: payload.requestDate,
      depositRequiredCents: payload.depositRequired || "0",
      notes: payload.notes,
      items: payload.items.map((i) => ({ gownId: i.gownId, pickupDate: i.pickupDate, returnDate: i.returnDate, rentalFeeCents: i.rentalFee || "0" })),
    });
    refreshAll();
    return { ok: true, redirect: `/reservations/${r!.id}?msg=${encodeURIComponent(`Pending reservation ${reservationCode(r!.number)} created`)}` };
  });
}

/** Search gowns for the reservation picker, with live availability for the chosen dates. */
export async function searchGownsForReservationAction(q: string, pickup: string, ret: string) {
  return runAction(async () => {
    const term = q.trim();
    const where: Prisma.GownWhereInput = { status: { in: ACTIVE_INVENTORY } };
    if (term) {
      const code = parseCode(term, "G");
      where.OR = [
        { description: { contains: term, mode: "insensitive" } },
        { style: { contains: term, mode: "insensitive" } },
        { color: { contains: term, mode: "insensitive" } },
        { size: { equals: term, mode: "insensitive" } },
        ...(code ? [{ number: code }] : []),
      ];
    }
    const gowns = await prisma.gown.findMany({
      where,
      orderBy: { number: "asc" },
      take: 24,
      include: { photos: { where: { kind: "GALLERY" }, orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1 } },
    });
    const urls = await signedUrls(gowns.flatMap((g) => g.photos.map((p) => p.thumbPath ?? p.storagePath)));
    const today = await getToday();
    const datesOk = isYmd(pickup) && isYmd(ret) && ret >= pickup;
    const out = [];
    for (const g of gowns) {
      const av = datesOk ? await checkAvailability(g.id, pickup, ret, { today }) : null;
      const photo = g.photos[0];
      out.push({
        id: g.id,
        number: g.number,
        description: g.description,
        size: g.size,
        color: g.color,
        style: g.style,
        status: g.status,
        photoUrl: photo ? (urls.get(photo.thumbPath ?? photo.storagePath) ?? null) : null,
        availability: av ? { available: av.available, conflicts: av.conflicts.map((c) => c.message), warnings: av.warnings.map((w) => w.message) } : null,
      });
    }
    return { ok: true, data: out };
  });
}

export async function checkAvailabilityAction(gownId: string, pickup: string, ret: string, excludeItemId?: string) {
  return runAction(async () => {
    if (!isYmd(pickup) || !isYmd(ret) || ret < pickup) return { ok: true, data: null };
    const av = await checkAvailability(gownId, pickup, ret, { today: await getToday(), excludeItemIds: excludeItemId ? [excludeItemId] : [] });
    return { ok: true, data: { available: av.available, conflicts: av.conflicts.map((c) => c.message), warnings: av.warnings.map((w) => w.message) } };
  });
}

export async function confirmReservationAction(reservationId: string, fd: FormData) {
  return runAction(async (actor) => {
    const obj = formToObject(fd);
    const pickupDates: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) if (k.startsWith("pickup_") && typeof v === "string") pickupDates[k.slice(7)] = v;
    await res.confirmReservation(actor, reservationId, { pickupDates, override: obj.override, overrideReason: obj.overrideReason });
    refreshAll(reservationId);
    return { ok: true, message: "Reservation confirmed" };
  });
}

export async function updateReservationDetailsAction(reservationId: string, fd: FormData) {
  return runAction(async (actor) => {
    await res.updateReservationDetails(actor, reservationId, formToObject(fd));
    refreshAll(reservationId);
    return { ok: true, message: "Reservation updated" };
  });
}

export async function updateItemAction(itemId: string, reservationId: string, fd: FormData) {
  return runAction(async (actor) => {
    await res.updateReservationItem(actor, itemId, formToObject(fd));
    refreshAll(reservationId);
    return { ok: true, message: "Gown dates and fee updated" };
  });
}

export async function addItemAction(reservationId: string, fd: FormData) {
  return runAction(async (actor) => {
    await res.addReservationItem(actor, reservationId, formToObject(fd));
    refreshAll(reservationId);
    return { ok: true, message: "Gown added to the reservation" };
  });
}

export async function cancelItemAction(itemId: string, reservationId: string, fd: FormData) {
  return runAction(async (actor) => {
    await res.cancelReservationItem(actor, itemId, String(fd.get("reason") ?? ""));
    refreshAll(reservationId);
    return { ok: true, message: "Gown removed from the reservation" };
  });
}

export async function cancelReservationAction(reservationId: string, fd: FormData) {
  return runAction(async (actor) => {
    await res.cancelReservation(actor, reservationId, String(fd.get("reason") ?? ""));
    refreshAll(reservationId);
    return { ok: true, message: "Reservation cancelled — history kept" };
  });
}

export async function pickupAction(reservationId: string, fd: FormData) {
  return runAction(async (actor) => {
    const obj = formToObject(fd);
    await res.confirmPickup(actor, { ...obj, itemIds: obj.itemIds ?? [] });
    refreshAll(reservationId);
    return { ok: true, message: "Pickup confirmed — enjoy the simcha!" };
  });
}

export async function returnAction(reservationId: string, payload: Record<string, unknown>) {
  return runAction(async (actor) => {
    await res.markReturned(actor, payload);
    refreshAll(reservationId);
    return { ok: true, message: "Return recorded — the gown is now pending inspection" };
  });
}

export async function recordPaymentAction(reservationId: string, fd: FormData) {
  return runAction(async (actor) => {
    await pay.recordPayment(actor, reservationId, formToObject(fd));
    refreshAll(reservationId);
    return { ok: true, message: "Saved" };
  });
}

export async function updatePaymentAction(paymentId: string, reservationId: string, fd: FormData) {
  return runAction(async (actor) => {
    await pay.updatePayment(actor, paymentId, formToObject(fd));
    refreshAll(reservationId);
    return { ok: true, message: "Entry updated" };
  });
}

export async function voidPaymentAction(paymentId: string, reservationId: string, fd: FormData) {
  return runAction(async (actor) => {
    await pay.voidPayment(actor, paymentId, formToObject(fd));
    refreshAll(reservationId);
    return { ok: true, message: "Entry voided" };
  });
}

export async function recordDepositAction(reservationId: string, fd: FormData) {
  return runAction(async (actor) => {
    await pay.recordDeposit(actor, reservationId, formToObject(fd));
    refreshAll(reservationId);
    return { ok: true, message: "Deposit entry saved" };
  });
}

export async function voidDepositAction(depositId: string, reservationId: string, fd: FormData) {
  return runAction(async (actor) => {
    await pay.voidDeposit(actor, depositId, formToObject(fd));
    refreshAll(reservationId);
    return { ok: true, message: "Deposit entry voided" };
  });
}
