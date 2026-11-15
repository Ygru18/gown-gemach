import "server-only";
import { z } from "zod";
import { prisma, type Tx } from "@/lib/db";
import { assertCan, type Actor } from "@/lib/permissions";
import { logActivity } from "@/lib/audit";
import { optEmail, optText, optYmd, parseInput, reqText, ymd } from "@/lib/validation";
import { CONDITIONS, GOWN_STATUS_LABEL, gownCode, parseCode, phoneDigits, sizeSortValue } from "@/lib/format";
import { toDbDate } from "@/lib/dates";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { createDonorTx } from "./donors";
import { ACTIVE_ITEM_STATUSES, activeItemStatuses, lockGown, setGownStatus } from "./gownState";
import { readyStatus } from "@/lib/gownStatus";
import { getToday } from "./settings";
import { createUploadTarget, isPathForGown, newPhotoPaths, removeObjects } from "@/lib/storage";
import type { GownCondition, GownStatus, Prisma } from "@/generated/prisma/client";

const condition = z
  .union([z.enum(CONDITIONS as [GownCondition, ...GownCondition[]]), z.literal("")]).nullish()
  .transform((v) => (v ? (v as GownCondition) : null));

const gownFields = {
  intakeDate: ymd("Date entered"),
  description: reqText("Description", 500),
  style: reqText("Style", 100),
  size: reqText("Size", 50),
  color: reqText("Color", 100),
  designer: optText(200),
  intakeCondition: condition,
  bust: optText(50),
  waist: optText(50),
  hips: optText(50),
  length: optText(50),
  otherMeasurements: optText(1000),
  notes: optText(5000),
};

export const gownIntakeSchema = z.object({
  ...gownFields,
  donorMode: z.enum(["none", "existing", "new"]).default("none"),
  donorId: optText(64),
  donorName: optText(200),
  donorPhone: optText(50),
  donorEmail: optEmail,
  donorAddress: optText(500),
});

export const gownUpdateSchema = z.object({
  ...gownFields,
  currentCondition: condition,
  donorMode: z.enum(["none", "existing", "new", "keep"]).default("keep"),
  donorId: optText(64),
  donorName: optText(200),
  donorPhone: optText(50),
  donorEmail: optEmail,
  donorAddress: optText(500),
});

async function resolveDonor(
  tx: Tx,
  actor: Actor,
  d: { donorMode: string; donorId: string | null; donorName: string | null; donorPhone: string | null; donorEmail: string | null; donorAddress: string | null }
): Promise<string | null | undefined> {
  if (d.donorMode === "keep") return undefined;
  if (d.donorMode === "none") return null;
  if (d.donorMode === "existing") {
    if (!d.donorId) throw new AppError("Please choose a donor.", { donorId: "Please choose a donor" });
    const donor = await tx.donor.findUnique({ where: { id: d.donorId } });
    if (!donor) throw new AppError("That donor no longer exists.", { donorId: "Donor not found" });
    return donor.id;
  }
  if (!d.donorName) throw new AppError("Please enter the donor's name, or choose “No donor information”.", { donorName: "Donor name is required for a new donor" });
  const digits = phoneDigits(d.donorPhone);
  // Re-use an existing donor with the same name and phone rather than duplicating.
  const existing = await tx.donor.findFirst({
    where: { name: { equals: d.donorName, mode: "insensitive" }, ...(digits ? { phoneDigits: digits } : {}) },
  });
  if (existing) return existing.id;
  const donor = await createDonorTx(tx, actor, {
    name: d.donorName,
    phone: d.donorPhone,
    email: d.donorEmail,
    address: d.donorAddress,
    notes: null,
  });
  return donor.id;
}

export async function createGown(actor: Actor, input: unknown) {
  assertCan(actor, "operate");
  const data = parseInput(gownIntakeSchema, input);
  return prisma.$transaction(async (tx) => {
    const donorId = await resolveDonor(tx, actor, data);
    const gown = await tx.gown.create({
      data: {
        intakeDate: toDbDate(data.intakeDate),
        description: data.description,
        style: data.style,
        size: data.size,
        sizeSort: sizeSortValue(data.size),
        color: data.color,
        designer: data.designer,
        intakeCondition: data.intakeCondition,
        currentCondition: data.intakeCondition,
        bust: data.bust,
        waist: data.waist,
        hips: data.hips,
        length: data.length,
        otherMeasurements: data.otherMeasurements,
        notes: data.notes,
        donorId: donorId ?? null,
        status: "AVAILABLE",
        createdById: actor.id,
      },
    });
    await tx.gownStatusChange.create({
      data: { gownId: gown.id, fromStatus: null, toStatus: "AVAILABLE", reason: "Gown intake", changedById: actor.id },
    });
    await logActivity(tx, actor, {
      action: "gown.create",
      entityType: "gown",
      entityId: gown.id,
      summary: `Added gown ${gownCode(gown.number)} — ${gown.description}`,
    });
    return gown;
  });
}

export async function updateGown(actor: Actor, gownId: string, input: unknown) {
  assertCan(actor, "operate");
  const data = parseInput(gownUpdateSchema, input);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.gown.findUnique({ where: { id: gownId } });
    if (!existing) throw new NotFoundError("Gown");
    const donorId = await resolveDonor(tx, actor, data);
    const gown = await tx.gown.update({
      where: { id: gownId },
      data: {
        intakeDate: toDbDate(data.intakeDate),
        description: data.description,
        style: data.style,
        size: data.size,
        sizeSort: sizeSortValue(data.size),
        color: data.color,
        designer: data.designer,
        intakeCondition: data.intakeCondition,
        currentCondition: data.currentCondition,
        bust: data.bust,
        waist: data.waist,
        hips: data.hips,
        length: data.length,
        otherMeasurements: data.otherMeasurements,
        notes: data.notes,
        ...(donorId !== undefined ? { donorId } : {}),
      },
    });
    await logActivity(tx, actor, {
      action: "gown.update",
      entityType: "gown",
      entityId: gownId,
      summary: `Updated details of gown ${gownCode(gown.number)}`,
    });
    return gown;
  });
}

async function assertNoActiveReservations(tx: Tx, gownId: string, verb: string) {
  const active = await tx.reservationItem.findMany({
    where: { gownId, status: { in: [...ACTIVE_ITEM_STATUSES] } },
    include: { reservation: { select: { number: true } } },
  });
  if (active.some((a) => a.status === "CHECKED_OUT")) {
    throw new ConflictError(`This gown is checked out. Process its return before you ${verb} it.`);
  }
  if (active.length) {
    const nums = [...new Set(active.map((a) => `R-${String(a.reservation.number).padStart(4, "0")}`))].join(", ");
    throw new ConflictError(`This gown has active reservations (${nums}). Cancel them or remove the gown from them before you ${verb} it.`);
  }
}

export async function markGownUnavailable(actor: Actor, gownId: string, reason: string | null) {
  assertCan(actor, "operate");
  const why = parseInput(optText(500), reason) ?? null;
  return prisma.$transaction(async (tx) => {
    await lockGown(tx, gownId);
    const gown = await tx.gown.findUniqueOrThrow({ where: { id: gownId } });
    if (["DISPOSED", "ARCHIVED", "CHECKED_OUT"].includes(gown.status)) {
      throw new ConflictError(`A gown that is ${GOWN_STATUS_LABEL[gown.status].toLowerCase()} cannot be marked unavailable.`);
    }
    await setGownStatus(tx, actor, gownId, "UNAVAILABLE_OTHER", why ?? "Marked unavailable");
    await logActivity(tx, actor, {
      action: "gown.unavailable",
      entityType: "gown",
      entityId: gownId,
      summary: `Marked gown ${gownCode(gown.number)} unavailable${why ? `: ${why}` : ""}`,
    });
  });
}

export async function archiveGown(actor: Actor, gownId: string, reason: string | null) {
  assertCan(actor, "operate");
  const why = parseInput(optText(500), reason) ?? null;
  return prisma.$transaction(async (tx) => {
    await lockGown(tx, gownId);
    const gown = await tx.gown.findUniqueOrThrow({ where: { id: gownId } });
    if (gown.status === "ARCHIVED") return;
    if (gown.status === "DISPOSED") throw new ConflictError("This gown has been disposed of; it is already out of inventory.");
    await assertNoActiveReservations(tx, gownId, "archive");
    await setGownStatus(tx, actor, gownId, "ARCHIVED", why ?? "Archived", { archivedAt: new Date(), archiveReason: why });
    await logActivity(tx, actor, {
      action: "gown.archive",
      entityType: "gown",
      entityId: gownId,
      summary: `Archived gown ${gownCode(gown.number)}${why ? `: ${why}` : ""}`,
    });
  });
}

export async function restoreArchivedGown(actor: Actor, gownId: string) {
  assertCan(actor, "operate");
  return prisma.$transaction(async (tx) => {
    await lockGown(tx, gownId);
    const gown = await tx.gown.findUniqueOrThrow({ where: { id: gownId } });
    if (gown.status !== "ARCHIVED") throw new ConflictError("Only archived gowns can be restored.");
    // Comes back through inspection, never straight to Available.
    await setGownStatus(tx, actor, gownId, "PENDING_INSPECTION", "Restored from archive — inspect before renting", { archivedAt: null, archiveReason: null });
    await logActivity(tx, actor, { action: "gown.restore", entityType: "gown", entityId: gownId, summary: `Restored gown ${gownCode(gown.number)} from the archive (pending inspection)` });
  });
}

export const disposeSchema = z.object({
  disposedDate: ymd("Disposal date"),
  disposalReason: optText(500),
  disposalNotes: optText(5000),
});

export async function disposeGown(actor: Actor, gownId: string, input: unknown) {
  assertCan(actor, "operate");
  const data = parseInput(disposeSchema, input);
  return prisma.$transaction(async (tx) => {
    await lockGown(tx, gownId);
    const gown = await tx.gown.findUniqueOrThrow({ where: { id: gownId } });
    if (gown.status === "DISPOSED") return;
    await assertNoActiveReservations(tx, gownId, "dispose of");
    await setGownStatus(tx, actor, gownId, "DISPOSED", data.disposalReason ?? "Disposed", {
      disposedAt: new Date(),
      disposedDate: toDbDate(data.disposedDate),
      disposalReason: data.disposalReason,
      disposalNotes: data.disposalNotes,
    });
    await logActivity(tx, actor, {
      action: "gown.dispose",
      entityType: "gown",
      entityId: gownId,
      summary: `Disposed of gown ${gownCode(gown.number)}${data.disposalReason ? `: ${data.disposalReason}` : ""}`,
    });
  });
}

/**
 * Admin-only permanent deletion — allowed only for a gown that has never
 * been part of any reservation or care record (e.g. entered by mistake).
 * Anything with history must be archived or disposed instead.
 */
export async function deleteGownPermanently(actor: Actor, gownId: string) {
  assertCan(actor, "gown.delete");
  const paths = await prisma.$transaction(async (tx) => {
    await lockGown(tx, gownId);
    const gown = await tx.gown.findUniqueOrThrow({
      where: { id: gownId },
      include: { _count: { select: { reservationItems: true, inspections: true, cleanings: true, alterations: true } }, photos: true },
    });
    const c = gown._count;
    if (c.reservationItems || c.inspections || c.cleanings || c.alterations) {
      throw new ConflictError("This gown has reservation or care history, so it cannot be deleted. Archive or dispose of it instead — that keeps the history intact.");
    }
    await tx.gown.delete({ where: { id: gownId } });
    await logActivity(tx, actor, {
      action: "gown.delete",
      entityType: "gown",
      entityId: gownId,
      summary: `Permanently deleted gown ${gownCode(gown.number)} — ${gown.description}`,
      details: { description: gown.description, size: gown.size, color: gown.color, style: gown.style },
    });
    return gown.photos.flatMap((p) => [p.storagePath, p.thumbPath ?? ""]);
  });
  await removeObjects(paths);
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

export async function preparePhotoUploads(actor: Actor, gownId: string, count: number) {
  assertCan(actor, "operate");
  if (!Number.isInteger(count) || count < 1 || count > 20) throw new AppError("You can upload between 1 and 20 photos at a time.");
  const gown = await prisma.gown.findUnique({ where: { id: gownId }, select: { id: true } });
  if (!gown) throw new NotFoundError("Gown");
  const out = [];
  for (let i = 0; i < count; i++) {
    const p = newPhotoPaths(gownId);
    const [full, thumb] = await Promise.all([createUploadTarget(p.full), createUploadTarget(p.thumb)]);
    out.push({ full, thumb });
  }
  return out;
}

const photoRefSchema = z.array(z.object({ full: z.string(), thumb: z.string().nullable().optional() })).min(1).max(20);

export async function registerPhotosTx(
  tx: Tx,
  actor: Actor,
  gownId: string,
  refs: { full: string; thumb?: string | null }[],
  kind: "GALLERY" | "DAMAGE",
  returnId: string | null = null
) {
  for (const r of refs) {
    if (!isPathForGown(r.full, gownId) || (r.thumb && !isPathForGown(r.thumb, gownId))) {
      throw new AppError("Invalid photo reference.");
    }
  }
  const existing = await tx.gownPhoto.findMany({ where: { gownId, kind: "GALLERY" }, select: { isPrimary: true, sortOrder: true } });
  let hasPrimary = existing.some((p) => p.isPrimary);
  let order = existing.reduce((m, p) => Math.max(m, p.sortOrder), 0);
  for (const r of refs) {
    order += 1;
    const makePrimary = kind === "GALLERY" && !hasPrimary;
    await tx.gownPhoto.create({
      data: { gownId, kind, storagePath: r.full, thumbPath: r.thumb ?? null, isPrimary: makePrimary, sortOrder: order, returnId, createdById: actor.id },
    });
    if (makePrimary) hasPrimary = true;
  }
}

export async function registerPhotos(actor: Actor, gownId: string, refsInput: unknown) {
  assertCan(actor, "operate");
  const refs = parseInput(photoRefSchema, refsInput);
  return prisma.$transaction(async (tx) => {
    const gown = await tx.gown.findUnique({ where: { id: gownId } });
    if (!gown) throw new NotFoundError("Gown");
    await registerPhotosTx(tx, actor, gownId, refs, "GALLERY");
    await logActivity(tx, actor, {
      action: "gown.photos.add",
      entityType: "gown",
      entityId: gownId,
      summary: `Added ${refs.length} photo${refs.length === 1 ? "" : "s"} to gown ${gownCode(gown.number)}`,
    });
  });
}

export async function setPrimaryPhoto(actor: Actor, photoId: string) {
  assertCan(actor, "operate");
  return prisma.$transaction(async (tx) => {
    const photo = await tx.gownPhoto.findUnique({ where: { id: photoId } });
    if (!photo) throw new NotFoundError("Photo");
    if (photo.kind !== "GALLERY") throw new AppError("Damage photos cannot be the main photo.");
    await tx.gownPhoto.updateMany({ where: { gownId: photo.gownId, isPrimary: true }, data: { isPrimary: false } });
    await tx.gownPhoto.update({ where: { id: photoId }, data: { isPrimary: true } });
    await logActivity(tx, actor, { action: "gown.photos.primary", entityType: "gown", entityId: photo.gownId, summary: "Changed the main photo" });
    return photo.gownId;
  });
}

export async function deletePhoto(actor: Actor, photoId: string) {
  assertCan(actor, "operate");
  const result = await prisma.$transaction(async (tx) => {
    const photo = await tx.gownPhoto.findUnique({ where: { id: photoId } });
    if (!photo) throw new NotFoundError("Photo");
    await tx.gownPhoto.delete({ where: { id: photoId } });
    if (photo.isPrimary) {
      const next = await tx.gownPhoto.findFirst({ where: { gownId: photo.gownId, kind: "GALLERY" }, orderBy: { sortOrder: "asc" } });
      if (next) await tx.gownPhoto.update({ where: { id: next.id }, data: { isPrimary: true } });
    }
    await logActivity(tx, actor, { action: "gown.photos.remove", entityType: "gown", entityId: photo.gownId, summary: "Removed a photo" });
    return photo;
  });
  await removeObjects([result.storagePath, result.thumbPath ?? ""]);
  return result.gownId;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export interface GownFilters {
  q?: string;
  status?: string; // a GownStatus, "active" (default), "all", "unavailable"
  size?: string;
  color?: string;
  style?: string;
  donorId?: string;
  addedFrom?: string;
  addedTo?: string;
  sort?: string;
}

export const ACTIVE_INVENTORY: GownStatus[] = [
  "AVAILABLE",
  "PENDING_RESERVATION",
  "RESERVED",
  "CHECKED_OUT",
  "PENDING_INSPECTION",
  "PENDING_CLEANING",
  "NEEDS_ALTERATION",
  "UNAVAILABLE_OTHER",
];

export function gownWhere(f: GownFilters): Prisma.GownWhereInput {
  const and: Prisma.GownWhereInput[] = [];
  const status = f.status || "active";
  if (status === "active") and.push({ status: { in: ACTIVE_INVENTORY } });
  else if (status === "unavailable") and.push({ status: { in: ["PENDING_INSPECTION", "PENDING_CLEANING", "NEEDS_ALTERATION", "UNAVAILABLE_OTHER"] } });
  else if (status !== "all" && (Object.keys(GOWN_STATUS_LABEL) as string[]).includes(status)) and.push({ status: status as GownStatus });
  if (f.size) and.push({ size: { equals: f.size, mode: "insensitive" } });
  if (f.color) and.push({ color: { equals: f.color, mode: "insensitive" } });
  if (f.style) and.push({ style: { equals: f.style, mode: "insensitive" } });
  if (f.donorId) and.push({ donorId: f.donorId });
  const from = parseInput(optYmd("From"), f.addedFrom);
  const to = parseInput(optYmd("To"), f.addedTo);
  if (from) and.push({ intakeDate: { gte: toDbDate(from) } });
  if (to) and.push({ intakeDate: { lte: toDbDate(to) } });
  const q = f.q?.trim();
  if (q) {
    const or: Prisma.GownWhereInput[] = [
      { description: { contains: q, mode: "insensitive" } },
      { style: { contains: q, mode: "insensitive" } },
      { color: { contains: q, mode: "insensitive" } },
      { designer: { contains: q, mode: "insensitive" } },
      { size: { equals: q, mode: "insensitive" } },
      { notes: { contains: q, mode: "insensitive" } },
      { donor: { name: { contains: q, mode: "insensitive" } } },
    ];
    const code = parseCode(q, "G");
    if (code) or.push({ number: code });
    and.push({ OR: or });
  }
  return and.length ? { AND: and } : {};
}

export function gownOrderBy(sort: string | undefined): Prisma.GownOrderByWithRelationInput[] {
  switch (sort) {
    case "id":
      return [{ number: "asc" }];
    case "id_desc":
      return [{ number: "desc" }];
    case "added":
      return [{ intakeDate: "asc" }, { number: "asc" }];
    case "size":
      return [{ sizeSort: { sort: "asc", nulls: "last" } }, { size: "asc" }, { number: "asc" }];
    case "color":
      return [{ color: "asc" }, { number: "asc" }];
    case "style":
      return [{ style: "asc" }, { number: "asc" }];
    default:
      return [{ intakeDate: "desc" }, { number: "desc" }];
  }
}

export async function listGowns(f: GownFilters, page = 1, pageSize = 48) {
  const where = gownWhere(f);
  const [total, gowns] = await Promise.all([
    prisma.gown.count({ where }),
    prisma.gown.findMany({
      where,
      orderBy: gownOrderBy(f.sort),
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        photos: { where: { kind: "GALLERY" }, orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1 },
        donor: { select: { id: true, name: true } },
        reservationItems: {
          where: { status: { in: [...ACTIVE_ITEM_STATUSES] } },
          orderBy: { requestedPickupDate: "asc" },
          take: 1,
          select: { requestedPickupDate: true, confirmedPickupDate: true, expectedReturnDate: true, status: true },
        },
      },
    }),
  ]);
  return { total, gowns, page, pageSize };
}

export async function gownFilterOptions() {
  const [sizes, colors, styles, donors] = await Promise.all([
    prisma.gown.findMany({ distinct: ["size"], select: { size: true, sizeSort: true }, orderBy: [{ sizeSort: { sort: "asc", nulls: "last" } }, { size: "asc" }] }),
    prisma.gown.findMany({ distinct: ["color"], select: { color: true }, orderBy: { color: "asc" } }),
    prisma.gown.findMany({ distinct: ["style"], select: { style: true }, orderBy: { style: "asc" } }),
    prisma.donor.findMany({ where: { gowns: { some: {} } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const uniq = (xs: string[]) => [...new Map(xs.map((x) => [x.toLowerCase(), x])).values()];
  return {
    sizes: uniq(sizes.map((s) => s.size)),
    colors: uniq(colors.map((c) => c.color)),
    styles: uniq(styles.map((s) => s.style)),
    donors,
  };
}

export async function getGownDetail(gownId: string) {
  return prisma.gown.findUnique({
    where: { id: gownId },
    include: {
      donor: true,
      photos: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] },
      statusHistory: { orderBy: { changedAt: "desc" } },
      reservationItems: {
        orderBy: { requestedPickupDate: "desc" },
        include: {
          reservation: { include: { customer: { select: { id: true, fullName: true, number: true, phone: true } } } },
          pickup: true,
          gownReturn: true,
        },
      },
      inspections: { orderBy: [{ inspectionDate: "desc" }, { createdAt: "desc" }] },
      cleanings: { orderBy: [{ identifiedDate: "desc" }, { createdAt: "desc" }] },
      alterations: { orderBy: [{ identifiedDate: "desc" }, { createdAt: "desc" }] },
    },
  });
}

/** Ready status for a gown given its reservations (used by care workflows). */
export async function readyStatusFor(tx: Tx, gownId: string) {
  return readyStatus(await activeItemStatuses(tx, gownId));
}

export { getToday };
