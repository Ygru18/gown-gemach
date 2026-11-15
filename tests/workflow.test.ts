import { beforeEach, describe, expect, it } from "vitest";
import { prisma, resetDb, makeStaff, gownInput, day, TODAY } from "./support/db";
import type { Actor } from "@/lib/permissions";
import { createGown, archiveGown, disposeGown, deleteGownPermanently, restoreArchivedGown, markGownUnavailable, registerPhotos, setPrimaryPhoto, deletePhoto } from "@/lib/services/gowns";
import { createCustomer, DuplicateCustomerError } from "@/lib/services/customers";
import { createDonor } from "@/lib/services/donors";
import {
  createReservation,
  confirmReservation,
  cancelReservation,
  confirmPickup,
  markReturned,
  addReservationItem,
  updateReservationItem,
  cancelReservationItem,
} from "@/lib/services/reservations";
import { recordInspection, updateWork, createAlteration } from "@/lib/services/care";
import { recordPayment, recordDeposit, voidPayment, updatePayment } from "@/lib/services/payments";
import { checkAvailability } from "@/lib/services/availability";
import { getOverdueItems, getOverdueWithUpcoming, getDashboard } from "@/lib/services/dashboard";
import { financialReport, donationReport, reservationReport, inventoryReport, overdueReport } from "@/lib/services/reports";
import { updateSettings } from "@/lib/services/settings";
import { ConflictError, ForbiddenError } from "@/lib/errors";
import { toDbDate } from "@/lib/dates";

let admin: Actor;
let asst: Actor;

beforeEach(async () => {
  await resetDb();
  admin = await makeStaff("ADMIN");
  asst = await makeStaff("ASSISTANT");
});

async function newCustomer(name = "Rivka Klein", phone = "718-555-0101") {
  return createCustomer(asst, { fullName: name, phone });
}

async function pendingFor(gownId: string, customerId: string, from = day(10), to = day(14), fee = "36") {
  return createReservation(asst, {
    customerId,
    requestDate: TODAY(),
    depositRequiredCents: "100",
    notes: null,
    items: [{ gownId, pickupDate: from, returnDate: to, rentalFeeCents: fee }],
  });
}

describe("gown intake", () => {
  it("creates a gown with auto ID, default status and optional donor", async () => {
    const g1 = await createGown(asst, gownInput());
    const g2 = await createGown(asst, gownInput({ donorMode: "new", donorName: "Leah Gold", donorPhone: "(718) 555-2222" }));
    expect(g1.number).toBe(1);
    expect(g2.number).toBe(2);
    expect(g1.status).toBe("AVAILABLE");
    expect(g1.donorId).toBeNull();
    const donor = await prisma.donor.findFirstOrThrow({ where: { name: "Leah Gold" } });
    expect(g2.donorId).toBe(donor.id);
    // Same donor again is re-used, not duplicated.
    await createGown(asst, gownInput({ donorMode: "new", donorName: "leah gold", donorPhone: "7185552222" }));
    expect(await prisma.donor.count()).toBe(1);
    expect(await prisma.gownStatusChange.count({ where: { gownId: g1.id } })).toBe(1);
    expect(await prisma.activityLog.count({ where: { action: "gown.create", actorId: asst.id } })).toBe(3);
  });

  it("requires description, style, size and color", async () => {
    await expect(createGown(asst, gownInput({ description: "  " }))).rejects.toThrow(/Description is required/);
    await expect(createGown(asst, gownInput({ size: "" }))).rejects.toThrow(/Size is required/);
  });

  it("registers photos with a single primary image", async () => {
    const g = await createGown(asst, gownInput());
    const p = (n: string) => `gowns/${g.id}/0000000${n}-0000-4000-8000-000000000000.jpg`;
    await registerPhotos(asst, g.id, [{ full: p("1"), thumb: null }, { full: p("2"), thumb: null }]);
    let photos = await prisma.gownPhoto.findMany({ where: { gownId: g.id }, orderBy: { sortOrder: "asc" } });
    expect(photos.filter((x) => x.isPrimary)).toHaveLength(1);
    expect(photos[0]!.isPrimary).toBe(true);
    await setPrimaryPhoto(asst, photos[1]!.id);
    photos = await prisma.gownPhoto.findMany({ where: { gownId: g.id }, orderBy: { sortOrder: "asc" } });
    expect(photos[1]!.isPrimary).toBe(true);
    await deletePhoto(asst, photos[1]!.id);
    const left = await prisma.gownPhoto.findMany({ where: { gownId: g.id } });
    expect(left).toHaveLength(1);
    expect(left[0]!.isPrimary).toBe(true);
    await expect(registerPhotos(asst, g.id, [{ full: "gowns/other/../../x.jpg" }])).rejects.toThrow(/Invalid photo/);
  });
});

describe("customers & donors", () => {
  it("never requires an email; name + phone suffice", async () => {
    const c = await createCustomer(asst, { fullName: "Chana Weiss", phone: "718 555 0199" });
    expect(c.email).toBeNull();
    expect(c.phoneDigits).toBe("7185550199");
    expect(c.number).toBe(1);
  });
  it("detects likely duplicates but allows a deliberate new record", async () => {
    await createCustomer(asst, { fullName: "Chana Weiss", phone: "718 555 0199" });
    await expect(createCustomer(asst, { fullName: "C. Weiss", phone: "(718) 555-0199" })).rejects.toBeInstanceOf(DuplicateCustomerError);
    const c2 = await createCustomer(asst, { fullName: "C. Weiss", phone: "(718) 555-0199", allowDuplicate: "on" });
    expect(c2.number).toBe(2);
  });
  it("rejects invalid email but accepts blank", async () => {
    await expect(createCustomer(asst, { fullName: "A", phone: "7185550000", email: "nope" })).rejects.toThrow(/valid email/);
    const d = await createDonor(asst, { name: "Anonymous friend" });
    expect(d.phone).toBeNull();
  });
});

describe("two-step reservations and double-booking prevention", () => {
  it("pending → confirmed updates gown availability", async () => {
    const g = await createGown(asst, gownInput());
    const c = await newCustomer();
    const r = await pendingFor(g.id, c.id);
    expect(r!.status).toBe("PENDING");
    expect((await prisma.gown.findUniqueOrThrow({ where: { id: g.id } })).status).toBe("PENDING_RESERVATION");
    await confirmReservation(asst, r!.id, {});
    const after = await prisma.reservation.findUniqueOrThrow({ where: { id: r!.id }, include: { items: true } });
    expect(after.status).toBe("CONFIRMED");
    expect(after.confirmedById).toBe(asst.id);
    expect(after.confirmedAt).not.toBeNull();
    expect(after.items[0]!.blocksAvailability).toBe(true);
    expect((await prisma.gown.findUniqueOrThrow({ where: { id: g.id } })).status).toBe("RESERVED");
  });

  it("shows pending conflicts as warnings and blocks confirmed conflicts", async () => {
    const g = await createGown(asst, gownInput());
    const c1 = await newCustomer("A One", "7185550001");
    const c2 = await newCustomer("B Two", "7185550002");
    const r1 = await pendingFor(g.id, c1.id, day(10), day(14));
    const r2 = await pendingFor(g.id, c2.id, day(12), day(16)); // allowed: both pending
    const av = await checkAvailability(g.id, day(12), day(13), { today: TODAY() });
    expect(av.available).toBe(true);
    expect(av.warnings.filter((w) => w.kind === "PENDING_OVERLAP")).toHaveLength(2);
    await confirmReservation(asst, r1!.id, {});
    await expect(confirmReservation(asst, r2!.id, {})).rejects.toBeInstanceOf(ConflictError);
    // A brand-new request overlapping a confirmed booking is refused.
    await expect(pendingFor(g.id, c2.id, day(14), day(18))).rejects.toThrow(/not available/);
    // Non-overlapping dates are fine.
    await expect(pendingFor(g.id, c2.id, day(15), day(18))).resolves.toBeTruthy();
  });

  it("applies the turnaround buffer", async () => {
    await updateSettings(admin, { defaultRentalFeeCents: "36", defaultDepositCents: "100", defaultRentalDays: 7, turnaroundBufferDays: 2, upcomingWindowDays: 14, timezone: "America/New_York" });
    const g = await createGown(asst, gownInput());
    const c = await newCustomer();
    const r = await pendingFor(g.id, c.id, day(10), day(14));
    await confirmReservation(asst, r!.id, {});
    await expect(pendingFor(g.id, c.id, day(16), day(18))).rejects.toThrow(/turnaround/);
    await expect(pendingFor(g.id, c.id, day(17), day(18))).resolves.toBeTruthy();
  });

  it("database constraint prevents simultaneous double booking", async () => {
    const g = await createGown(asst, gownInput());
    const c1 = await newCustomer("A One", "7185550001");
    const c2 = await newCustomer("B Two", "7185550002");
    const r1 = await pendingFor(g.id, c1.id, day(10), day(14));
    const r2 = await pendingFor(g.id, c2.id, day(11), day(15));
    const results = await Promise.allSettled([confirmReservation(asst, r1!.id, {}), confirmReservation(admin, r2!.id, {})]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((x) => x.status === "rejected")).toHaveLength(1);
    expect(await prisma.reservationItem.count({ where: { gownId: g.id, blocksAvailability: true } })).toBe(1);
  });

  it("raw inserts that would overlap are rejected by the exclusion constraint", async () => {
    const g = await createGown(asst, gownInput());
    const c = await newCustomer();
    const r = await pendingFor(g.id, c.id, day(10), day(14));
    await confirmReservation(asst, r!.id, {});
    await expect(
      prisma.reservationItem.create({
        data: {
          reservationId: r!.id,
          gownId: g.id,
          status: "CONFIRMED",
          requestedPickupDate: toDbDate(day(12)),
          expectedReturnDate: toDbDate(day(13)),
          blockedThroughDate: toDbDate(day(13)),
          blocksAvailability: true,
        },
      })
    ).rejects.toThrow();
  });

  it("lets only an administrator override a conflict, with a reason and audit record", async () => {
    const g = await createGown(asst, gownInput());
    const c1 = await newCustomer("A One", "7185550001");
    const c2 = await newCustomer("B Two", "7185550002");
    const r1 = await pendingFor(g.id, c1.id, day(10), day(14));
    const r2 = await pendingFor(g.id, c2.id, day(12), day(16));
    await confirmReservation(asst, r1!.id, {});
    await expect(confirmReservation(asst, r2!.id, { override: "on", overrideReason: "Same family" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(confirmReservation(admin, r2!.id, { override: "on" })).rejects.toThrow(/reason/);
    await confirmReservation(admin, r2!.id, { override: "on", overrideReason: "Sisters sharing at the same wedding" });
    const item = await prisma.reservationItem.findFirstOrThrow({ where: { reservationId: r2!.id } });
    expect(item.conflictOverride).toBe(true);
    expect(item.overrideById).toBe(admin.id);
    expect(await prisma.activityLog.count({ where: { action: "reservation.override" } })).toBe(1);
    // Admin may delegate the override to assistants.
    await updateSettings(admin, { defaultRentalFeeCents: "36", defaultDepositCents: "100", defaultRentalDays: 7, turnaroundBufferDays: 0, upcomingWindowDays: 14, timezone: "America/New_York", allowAssistantOverride: "on" });
    const c3 = await newCustomer("C Three", "7185550003");
    const r3 = await createReservation(asst, { customerId: c3.id, requestDate: TODAY(), depositRequiredCents: "0", items: [{ gownId: g.id, pickupDate: day(20), returnDate: day(22), rentalFeeCents: "0" }] });
    await confirmReservation(asst, r3!.id, {});
    const c4 = await newCustomer("D Four", "7185550004");
    const r4 = await createReservation(asst, { customerId: c4.id, requestDate: TODAY(), depositRequiredCents: "0", items: [{ gownId: g.id, pickupDate: day(23), returnDate: day(25), rentalFeeCents: "0" }] });
    await confirmReservation(asst, r4!.id, {});
    await expect(updateReservationItem(asst, (await prisma.reservationItem.findFirstOrThrow({ where: { reservationId: r4!.id } })).id, { pickupDate: day(21), returnDate: day(25), rentalFeeCents: "0", override: "on", overrideReason: "ok" })).resolves.toBeUndefined();
  });

  it("supports multiple gowns with individual dates in one reservation", async () => {
    const g1 = await createGown(asst, gownInput());
    const g2 = await createGown(asst, gownInput({ description: "Blush tulle gown", color: "Blush" }));
    const c = await newCustomer();
    const r = await createReservation(asst, {
      newCustomer: undefined,
      customerId: c.id,
      requestDate: TODAY(),
      depositRequiredCents: "50",
      items: [
        { gownId: g1.id, pickupDate: day(5), returnDate: day(9), rentalFeeCents: "36" },
        { gownId: g2.id, pickupDate: day(6), returnDate: day(12), rentalFeeCents: "25.50" },
      ],
    });
    const items = await prisma.reservationItem.findMany({ where: { reservationId: r!.id }, orderBy: { requestedPickupDate: "asc" } });
    expect(items).toHaveLength(2);
    expect(items[1]!.rentalFeeCents).toBe(2550);
    await confirmReservation(asst, r!.id, {});
    await confirmPickup(asst, { itemIds: [items[0]!.id], pickupDate: day(5), condition: "EXCELLENT" });
    let res = await prisma.reservation.findUniqueOrThrow({ where: { id: r!.id } });
    expect(res.status).toBe("CHECKED_OUT");
    await cancelReservationItem(asst, items[1]!.id, "Changed her mind");
    expect((await prisma.gown.findUniqueOrThrow({ where: { id: g2.id } })).status).toBe("AVAILABLE");
    await markReturned(asst, { itemId: items[0]!.id, returnDate: day(9), condition: "GOOD" });
    res = await prisma.reservation.findUniqueOrThrow({ where: { id: r!.id } });
    expect(res.status).toBe("RETURNED");
  });

  it("creates a new customer inside the reservation workflow", async () => {
    const g = await createGown(asst, gownInput());
    const r = await createReservation(asst, {
      newCustomer: { fullName: "New Person", phone: "7185559999" },
      requestDate: TODAY(),
      depositRequiredCents: "0",
      items: [{ gownId: g.id, pickupDate: day(1), returnDate: day(3), rentalFeeCents: "36" }],
    });
    const c = await prisma.customer.findFirstOrThrow({ where: { fullName: "New Person" } });
    expect(r!.customerId).toBe(c.id);
  });

  it("records cancellation details and keeps history", async () => {
    const g = await createGown(asst, gownInput());
    const c = await newCustomer();
    const r = await pendingFor(g.id, c.id);
    await confirmReservation(asst, r!.id, {});
    await cancelReservation(asst, r!.id, "Wedding postponed");
    const res = await prisma.reservation.findUniqueOrThrow({ where: { id: r!.id }, include: { items: true } });
    expect(res.status).toBe("CANCELLED");
    expect(res.cancelledById).toBe(asst.id);
    expect(res.cancellationReason).toBe("Wedding postponed");
    expect(res.items[0]!.status).toBe("CANCELLED");
    expect((await prisma.gown.findUniqueOrThrow({ where: { id: g.id } })).status).toBe("AVAILABLE");
  });

  it("cannot add a gown to a reservation if it conflicts", async () => {
    const g = await createGown(asst, gownInput());
    const c = await newCustomer();
    const r1 = await pendingFor(g.id, c.id, day(1), day(5));
    await confirmReservation(asst, r1!.id, {});
    const g2 = await createGown(asst, gownInput());
    const r2 = await pendingFor(g2.id, c.id, day(1), day(5));
    await expect(addReservationItem(asst, r2!.id, { gownId: g.id, pickupDate: day(2), returnDate: day(4), rentalFeeCents: "0" })).rejects.toThrow(/not available/);
  });
});

describe("pickup, return, inspection, cleaning and alterations", () => {
  async function checkedOut(from = day(0), to = day(3)) {
    const g = await createGown(asst, gownInput());
    const c = await newCustomer();
    const r = await pendingFor(g.id, c.id, from, to);
    await confirmReservation(asst, r!.id, {});
    const item = await prisma.reservationItem.findFirstOrThrow({ where: { reservationId: r!.id } });
    await confirmPickup(asst, { itemIds: [item.id], pickupDate: from, condition: "EXCELLENT", notes: "Looks lovely" });
    return { g, c, r: r!, item };
  }

  it("pickup requires a confirmed reservation and records who processed it", async () => {
    const g = await createGown(asst, gownInput());
    const c = await newCustomer();
    const r = await pendingFor(g.id, c.id, day(0), day(3));
    const item = await prisma.reservationItem.findFirstOrThrow({ where: { reservationId: r!.id } });
    await expect(confirmPickup(asst, { itemIds: [item.id], pickupDate: day(0) })).rejects.toThrow(/still pending/);
    await confirmReservation(asst, r!.id, {});
    await confirmPickup(asst, { itemIds: [item.id], pickupDate: day(0), condition: "EXCELLENT" });
    const pk = await prisma.pickup.findUniqueOrThrow({ where: { itemId: item.id } });
    expect(pk.processedById).toBe(asst.id);
    expect((await prisma.gown.findUniqueOrThrow({ where: { id: g.id } })).status).toBe("CHECKED_OUT");
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: r!.id } })).status).toBe("CHECKED_OUT");
  });

  it("return moves the gown to Pending Inspection, never straight to Available", async () => {
    const { g, item } = await checkedOut();
    await markReturned(asst, { itemId: item.id, returnDate: day(3), condition: "GOOD", hasDamage: "on", damageNotes: "Small tear on hem", damagePhotos: [{ full: `gowns/${g.id}/11111111-0000-4000-8000-000000000000.jpg` }] });
    const gown = await prisma.gown.findUniqueOrThrow({ where: { id: g.id } });
    expect(gown.status).toBe("PENDING_INSPECTION");
    const ret = await prisma.gownReturn.findUniqueOrThrow({ where: { itemId: item.id }, include: { damagePhotos: true } });
    expect(ret.hasDamage).toBe(true);
    expect(ret.damagePhotos).toHaveLength(1);
    expect(ret.damagePhotos[0]!.kind).toBe("DAMAGE");
    // A pending-inspection gown cannot be picked up by the next customer.
    const c2 = await newCustomer("Next", "7185551111");
    const r2 = await pendingFor(g.id, c2.id, day(5), day(7));
    await confirmReservation(asst, r2!.id, {});
    const it2 = await prisma.reservationItem.findFirstOrThrow({ where: { reservationId: r2!.id } });
    await expect(confirmPickup(asst, { itemIds: [it2.id], pickupDate: day(5) })).rejects.toThrow(/not ready/);
    await recordInspection(asst, { gownId: g.id, inspectionDate: day(4), outcome: "READY" });
    expect((await prisma.gown.findUniqueOrThrow({ where: { id: g.id } })).status).toBe("RESERVED");
    const insp = await prisma.inspection.findFirstOrThrow({ where: { gownId: g.id } });
    expect(insp.returnId).toBe(ret.id);
  });

  it("inspection → cleaning → completion marks ready", async () => {
    const { g, item } = await checkedOut();
    await markReturned(asst, { itemId: item.id, returnDate: day(3) });
    await recordInspection(asst, { gownId: g.id, inspectionDate: day(3), outcome: "NEEDS_CLEANING", cleaningReason: "Makeup on collar" });
    expect((await prisma.gown.findUniqueOrThrow({ where: { id: g.id } })).status).toBe("PENDING_CLEANING");
    await expect(recordInspection(asst, { gownId: g.id, inspectionDate: day(3), outcome: "READY" })).rejects.toThrow(/open cleaning/);
    const cleaning = await prisma.cleaningRecord.findFirstOrThrow({ where: { gownId: g.id } });
    await updateWork(asst, "cleaning", cleaning.id, { status: "COMPLETED", completedDate: day(5), costCents: "18.00", markReady: "on" });
    const gown = await prisma.gown.findUniqueOrThrow({ where: { id: g.id } });
    expect(gown.status).toBe("AVAILABLE");
    expect((await prisma.cleaningRecord.findUniqueOrThrow({ where: { id: cleaning.id } })).costCents).toBe(1800);
  });

  it("cleaning + alteration: gown stays out until all work done", async () => {
    const { g, item } = await checkedOut();
    await markReturned(asst, { itemId: item.id, returnDate: day(3) });
    await recordInspection(asst, { gownId: g.id, inspectionDate: day(3), outcome: "NEEDS_ALTERATION", alterationDescription: "Take in waist 1in", alsoNeedsCleaning: "on" });
    expect((await prisma.gown.findUniqueOrThrow({ where: { id: g.id } })).status).toBe("NEEDS_ALTERATION");
    const alt = await prisma.alterationRecord.findFirstOrThrow({ where: { gownId: g.id } });
    await updateWork(asst, "alteration", alt.id, { status: "COMPLETED", completedDate: day(4), markReady: "on" });
    expect((await prisma.gown.findUniqueOrThrow({ where: { id: g.id } })).status).toBe("PENDING_CLEANING");
    const cl = await prisma.cleaningRecord.findFirstOrThrow({ where: { gownId: g.id } });
    await updateWork(asst, "cleaning", cl.id, { status: "COMPLETED", completedDate: day(5) });
    expect((await prisma.gown.findUniqueOrThrow({ where: { id: g.id } })).status).toBe("PENDING_INSPECTION");
    await recordInspection(asst, { gownId: g.id, inspectionDate: day(5), outcome: "READY" });
    expect((await prisma.gown.findUniqueOrThrow({ where: { id: g.id } })).status).toBe("AVAILABLE");
  });

  it("damaged outcome makes the gown unavailable with a reason", async () => {
    const { g, item } = await checkedOut();
    await markReturned(asst, { itemId: item.id, returnDate: day(3) });
    await expect(recordInspection(asst, { gownId: g.id, inspectionDate: day(3), outcome: "DAMAGED" })).rejects.toThrow(/note/);
    await recordInspection(asst, { gownId: g.id, inspectionDate: day(3), outcome: "DAMAGED", notes: "Large stain" });
    const gown = await prisma.gown.findUniqueOrThrow({ where: { id: g.id } });
    expect(gown.status).toBe("UNAVAILABLE_OTHER");
    expect(gown.statusReason).toMatch(/Large stain/);
  });

  it("manual alteration from the gown page", async () => {
    const g = await createGown(asst, gownInput());
    await createAlteration(asst, { gownId: g.id, identifiedDate: TODAY(), description: "Hem 2in" });
    expect((await prisma.gown.findUniqueOrThrow({ where: { id: g.id } })).status).toBe("NEEDS_ALTERATION");
  });
});

describe("overdue tracking and upcoming-reservation warnings", () => {
  it("flags overdue gowns and customers with another reservation, without cancelling anything", async () => {
    const g1 = await createGown(asst, gownInput());
    const g2 = await createGown(asst, gownInput({ description: "Champagne satin" }));
    const c = await newCustomer();
    const r1 = await pendingFor(g1.id, c.id, day(-10), day(-3));
    await confirmReservation(asst, r1!.id, {});
    const it1 = await prisma.reservationItem.findFirstOrThrow({ where: { reservationId: r1!.id } });
    await confirmPickup(asst, { itemIds: [it1.id], pickupDate: day(-10) });
    const r2 = await pendingFor(g2.id, c.id, day(4), day(8));
    await confirmReservation(asst, r2!.id, {});

    const overdue = await getOverdueItems(TODAY());
    expect(overdue).toHaveLength(1);
    expect(overdue[0]!.daysOverdue).toBe(3);
    expect(overdue[0]!.customerPhone).toBe("718-555-0101");
    const warnings = await getOverdueWithUpcoming(TODAY());
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.upcoming[0]!.reservationNumber).toBe(r2!.number);
    expect(warnings[0]!.upcoming[0]!.pickupDate).toBe(day(4));
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: r2!.id } })).status).toBe("CONFIRMED");

    // The overdue gown blocks anyone else from booking it soon.
    const other = await newCustomer("Other", "7185550202");
    await expect(pendingFor(g1.id, other.id, day(0), day(2))).rejects.toThrow(/overdue/);

    const dash = await getDashboard(TODAY(), 14);
    expect(dash.counts.overdue).toBe(1);
    expect(dash.warnings).toHaveLength(1);

    // Returning late records days late.
    await markReturned(asst, { itemId: it1.id, returnDate: TODAY() });
    expect((await prisma.gownReturn.findUniqueOrThrow({ where: { itemId: it1.id } })).daysLate).toBe(3);
    expect(await getOverdueWithUpcoming(TODAY())).toHaveLength(0);
    const rep = await overdueReport({ from: day(-30), to: day(0) }, TODAY());
    expect(rep.late).toHaveLength(1);
  });
});

describe("archive, disposal and deletion", () => {
  it("assistants can archive and dispose, but cannot permanently delete", async () => {
    const g = await createGown(asst, gownInput());
    await archiveGown(asst, g.id, "Out of style");
    let gown = await prisma.gown.findUniqueOrThrow({ where: { id: g.id } });
    expect(gown.status).toBe("ARCHIVED");
    expect(gown.archivedAt).not.toBeNull();
    await restoreArchivedGown(asst, g.id);
    expect((await prisma.gown.findUniqueOrThrow({ where: { id: g.id } })).status).toBe("PENDING_INSPECTION");
    await disposeGown(asst, g.id, { disposedDate: TODAY(), disposalReason: "Beyond repair" });
    gown = await prisma.gown.findUniqueOrThrow({ where: { id: g.id } });
    expect(gown.status).toBe("DISPOSED");
    const c = await newCustomer();
    await expect(pendingFor(g.id, c.id)).rejects.toThrow(/disposed/);
    await expect(deleteGownPermanently(asst, g.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("blocks archiving a gown with active reservations", async () => {
    const g = await createGown(asst, gownInput());
    const c = await newCustomer();
    await pendingFor(g.id, c.id);
    await expect(archiveGown(asst, g.id, null)).rejects.toThrow(/active reservations/);
    await expect(markGownUnavailable(asst, g.id, "Stained")).resolves.toBeUndefined();
  });

  it("admin can delete only gowns without history", async () => {
    const g = await createGown(asst, gownInput());
    const g2 = await createGown(asst, gownInput());
    const c = await newCustomer();
    const r = await pendingFor(g2.id, c.id);
    await cancelReservation(asst, r!.id, null);
    await expect(deleteGownPermanently(admin, g2.id)).rejects.toThrow(/history/);
    await deleteGownPermanently(admin, g.id);
    expect(await prisma.gown.findUnique({ where: { id: g.id } })).toBeNull();
    expect(await prisma.activityLog.count({ where: { action: "gown.delete", actorId: admin.id } })).toBe(1);
  });
});

describe("payments and security deposits", () => {
  it("tracks fees and deposits separately with partial payments, refunds and waivers", async () => {
    const g = await createGown(asst, gownInput());
    const c = await newCustomer();
    const r = (await pendingFor(g.id, c.id, day(1), day(4), "36.00"))!;
    await recordPayment(asst, r.id, { kind: "PAYMENT", amountCents: "20", method: "CASH", paymentDate: TODAY() });
    await expect(recordPayment(asst, r.id, { kind: "PAYMENT", amountCents: "10", paymentDate: TODAY() })).rejects.toThrow(/method/);
    await expect(recordPayment(asst, r.id, { kind: "PAYMENT", amountCents: "0", method: "CASH", paymentDate: TODAY() })).rejects.toThrow(/greater than zero/);
    await expect(recordPayment(asst, r.id, { kind: "REFUND", amountCents: "25", method: "CASH", paymentDate: TODAY() })).rejects.toThrow(/cannot exceed/);
    await expect(recordPayment(asst, r.id, { kind: "WAIVER", amountCents: "20", paymentDate: TODAY() })).rejects.toThrow(/outstanding/);
    await recordPayment(asst, r.id, { kind: "WAIVER", amountCents: "16", paymentDate: TODAY(), notes: "Hardship" });
    await recordDeposit(asst, r.id, { kind: "COLLECTED", amountCents: "100", method: "CHECK", transactionDate: TODAY(), notes: "Check #1234" });
    await expect(recordDeposit(asst, r.id, { kind: "RETURNED", amountCents: "150", method: "CASH", transactionDate: TODAY() })).rejects.toThrow(/currently held/);
    await expect(recordDeposit(asst, r.id, { kind: "RETAINED", amountCents: "25", transactionDate: TODAY() })).rejects.toThrow(/reason/);
    await recordDeposit(asst, r.id, { kind: "RETAINED", amountCents: "25", transactionDate: TODAY(), reason: "Cleaning stain" });
    await recordDeposit(asst, r.id, { kind: "RETURNED", amountCents: "75", method: "CASH", transactionDate: TODAY() });

    const fin = await financialReport({ from: day(-1), to: day(1) });
    expect(fin.totals.rentalCollected).toBe(2000);
    expect(fin.totals.waived).toBe(1600);
    expect(fin.totals.depositsCollected).toBe(10000);
    expect(fin.totals.depositsRetained).toBe(2500);
    expect(fin.totals.depositsReturned).toBe(7500);
    expect(fin.totals.outstandingBalance).toBe(0);

    // Edit and void keep an audit trail.
    const pay = await prisma.payment.findFirstOrThrow({ where: { reservationId: r.id, kind: "PAYMENT" } });
    await updatePayment(asst, pay.id, { kind: "PAYMENT", amountCents: "19.99", method: "CASH", paymentDate: TODAY() });
    await voidPayment(asst, pay.id, { reason: "Entered on wrong reservation" });
    const fin2 = await financialReport({ from: day(-1), to: day(1) });
    expect(fin2.totals.rentalCollected).toBe(0);
    expect(fin2.totals.outstandingBalance).toBe(2000);
    expect(await prisma.activityLog.count({ where: { action: { startsWith: "payment." } } })).toBe(4);
  });
});

describe("reports and settings permissions", () => {
  it("produces donation, reservation and inventory reports", async () => {
    const d = await createDonor(asst, { name: "Esther B" });
    const g = await createGown(asst, gownInput({ donorMode: "existing", donorId: d.id }));
    await createGown(asst, gownInput());
    const c = await newCustomer();
    const r = await pendingFor(g.id, c.id, day(0), day(2));
    await confirmReservation(asst, r!.id, {});
    const it = await prisma.reservationItem.findFirstOrThrow({ where: { reservationId: r!.id } });
    await confirmPickup(asst, { itemIds: [it.id], pickupDate: day(0) });
    const don = await donationReport({ from: day(-1), to: day(1) });
    expect(don.gowns).toHaveLength(2);
    expect(don.byDonor.find((x) => x.name === "Esther B")?.count).toBe(1);
    const res = await reservationReport({ from: day(-1), to: day(1) });
    expect(res.reservations).toHaveLength(1);
    expect(res.mostBorrowed[0]!.count).toBe(1);
    const inv = await inventoryReport();
    expect(inv.byStatus.CHECKED_OUT).toBe(1);
    expect(inv.byStatus.AVAILABLE).toBe(1);
  });

  it("only admins can change settings", async () => {
    await expect(updateSettings(asst, { defaultRentalFeeCents: "1", defaultDepositCents: "0", defaultRentalDays: 7, turnaroundBufferDays: 0, upcomingWindowDays: 14, timezone: "UTC" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateSettings(admin, { defaultRentalFeeCents: "1", defaultDepositCents: "0", defaultRentalDays: 7, turnaroundBufferDays: 0, upcomingWindowDays: 14, timezone: "Mars/Base" })).rejects.toThrow(/timezone/);
  });
});
