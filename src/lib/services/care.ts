import "server-only";
import { z } from "zod";
import { prisma, type Tx } from "@/lib/db";
import { assertCan, type Actor } from "@/lib/permissions";
import { logActivity } from "@/lib/audit";
import { optMoneyCents, optText, optYmd, parseInput, reqText, ymd } from "@/lib/validation";
import { CONDITIONS, gownCode, INSPECTION_OUTCOME_LABEL } from "@/lib/format";
import { toDbDate } from "@/lib/dates";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { activeItemStatuses, lockGown, setGownStatus } from "./gownState";
import { readyStatus } from "@/lib/gownStatus";
import type { GownCondition, InspectionOutcome } from "@/generated/prisma/client";

const condition = z
  .union([z.enum(CONDITIONS as [GownCondition, ...GownCondition[]]), z.literal("")]).nullish()
  .transform((v) => (v ? (v as GownCondition) : null));
const bool = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.boolean()]).nullish()
  .transform((v) => v === "on" || v === "true" || v === true);

async function openWork(tx: Tx, gownId: string) {
  const [cleanings, alterations] = await Promise.all([
    tx.cleaningRecord.count({ where: { gownId, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    tx.alterationRecord.count({ where: { gownId, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
  ]);
  return { cleanings, alterations };
}

/** Status for a gown that has open work, or null if none. Alterations come before cleaning. */
async function workStatus(tx: Tx, gownId: string) {
  const w = await openWork(tx, gownId);
  if (w.alterations) return "NEEDS_ALTERATION" as const;
  if (w.cleanings) return "PENDING_CLEANING" as const;
  return null;
}

// ---------------------------------------------------------------------------
// Inspection
// ---------------------------------------------------------------------------

export const inspectionSchema = z.object({
  gownId: z.string().uuid(),
  inspectionDate: ymd("Inspection date"),
  outcome: z.enum(["READY", "NEEDS_CLEANING", "NEEDS_ALTERATION", "DAMAGED", "OTHER"], { error: "Please choose an inspection result" }),
  condition: condition,
  notes: optText(2000),
  cleaningReason: optText(1000),
  alterationDescription: optText(2000),
  alsoNeedsCleaning: bool,
  alsoNeedsAlteration: bool,
  assignedTo: optText(200),
});

export async function recordInspection(actor: Actor, input: unknown) {
  assertCan(actor, "operate");
  const data = parseInput(inspectionSchema, input);
  return prisma.$transaction(async (tx) => {
    await lockGown(tx, data.gownId);
    const gown = await tx.gown.findUnique({ where: { id: data.gownId } });
    if (!gown) throw new NotFoundError("Gown");
    if (["DISPOSED", "ARCHIVED", "CHECKED_OUT"].includes(gown.status)) {
      throw new ConflictError(`A gown that is ${gown.status === "CHECKED_OUT" ? "checked out" : gown.status.toLowerCase()} cannot be inspected.`);
    }
    const needsCleaning = data.outcome === "NEEDS_CLEANING" || (data.outcome === "NEEDS_ALTERATION" && data.alsoNeedsCleaning);
    const needsAlteration = data.outcome === "NEEDS_ALTERATION" || (data.outcome === "NEEDS_CLEANING" && data.alsoNeedsAlteration);
    if (needsAlteration && !data.alterationDescription && data.outcome === "NEEDS_ALTERATION") {
      throw new AppError("Please describe the alterations needed.", { alterationDescription: "Describe the alterations" });
    }
    if ((data.outcome === "DAMAGED" || data.outcome === "OTHER") && !data.notes) {
      throw new AppError("Please add a note explaining why the gown is unavailable.", { notes: "A note is required" });
    }
    if (data.outcome === "READY") {
      const w = await openWork(tx, data.gownId);
      if (w.cleanings || w.alterations) {
        throw new ConflictError("This gown still has open cleaning or alteration work. Complete (or cancel) that work first — completing it can mark the gown ready.");
      }
    }

    // Link to the most recent un-inspected return, if any.
    const lastReturn = await tx.gownReturn.findFirst({
      where: { item: { gownId: data.gownId }, inspection: null },
      orderBy: { returnDate: "desc" },
    });
    const inspection = await tx.inspection.create({
      data: {
        gownId: data.gownId,
        returnId: lastReturn?.id ?? null,
        inspectionDate: toDbDate(data.inspectionDate),
        outcome: data.outcome as InspectionOutcome,
        condition: data.condition,
        notes: data.notes,
        inspectedById: actor.id,
      },
    });
    if (needsCleaning) {
      await tx.cleaningRecord.create({
        data: {
          gownId: data.gownId,
          identifiedDate: toDbDate(data.inspectionDate),
          reason: data.cleaningReason ?? data.notes,
          assignedTo: data.assignedTo,
          inspectionId: inspection.id,
          createdById: actor.id,
        },
      });
    }
    if (needsAlteration) {
      await tx.alterationRecord.create({
        data: {
          gownId: data.gownId,
          identifiedDate: toDbDate(data.inspectionDate),
          description: data.alterationDescription ?? data.notes ?? "Alteration needed",
          assignedTo: data.assignedTo,
          inspectionId: inspection.id,
          createdById: actor.id,
        },
      });
    }
    const extra = data.condition ? { currentCondition: data.condition } : {};
    let next;
    if (data.outcome === "READY") next = readyStatus(await activeItemStatuses(tx, data.gownId));
    else if (needsAlteration) next = "NEEDS_ALTERATION" as const;
    else if (needsCleaning) next = "PENDING_CLEANING" as const;
    else next = "UNAVAILABLE_OTHER" as const;
    const reason =
      data.outcome === "READY" ? "Inspected — ready for next rental" : `Inspection: ${INSPECTION_OUTCOME_LABEL[data.outcome]}${data.notes ? ` — ${data.notes}` : ""}`;
    await setGownStatus(tx, actor, data.gownId, next, reason, extra);
    await logActivity(tx, actor, {
      action: "gown.inspect",
      entityType: "gown",
      entityId: data.gownId,
      summary: `Inspected ${gownCode(gown.number)}: ${INSPECTION_OUTCOME_LABEL[data.outcome]}`,
    });
    return inspection;
  });
}

// ---------------------------------------------------------------------------
// Cleaning & alterations
// ---------------------------------------------------------------------------

export const cleaningSchema = z.object({
  gownId: z.string().uuid(),
  identifiedDate: ymd("Date identified"),
  reason: optText(1000),
  assignedTo: optText(200),
  costCents: optMoneyCents("Cost"),
  notes: optText(2000),
});

export const alterationSchema = z.object({
  gownId: z.string().uuid(),
  identifiedDate: ymd("Date identified"),
  description: reqText("Description of alterations", 2000),
  assignedTo: optText(200),
  costCents: optMoneyCents("Cost"),
  notes: optText(2000),
});

async function afterNewWork(tx: Tx, actor: Actor, gownId: string, reason: string) {
  const gown = await tx.gown.findUniqueOrThrow({ where: { id: gownId } });
  // A checked-out gown keeps its status; the work shows after return/inspection.
  if (["CHECKED_OUT", "DISPOSED", "ARCHIVED"].includes(gown.status)) return;
  const ws = await workStatus(tx, gownId);
  if (ws) await setGownStatus(tx, actor, gownId, ws, reason);
}

export async function createCleaning(actor: Actor, input: unknown) {
  assertCan(actor, "operate");
  const data = parseInput(cleaningSchema, input);
  return prisma.$transaction(async (tx) => {
    await lockGown(tx, data.gownId);
    const gown = await tx.gown.findUniqueOrThrow({ where: { id: data.gownId } });
    if (gown.status === "DISPOSED") throw new ConflictError("This gown has been disposed of.");
    const rec = await tx.cleaningRecord.create({ data: { ...data, identifiedDate: toDbDate(data.identifiedDate), createdById: actor.id } });
    await afterNewWork(tx, actor, data.gownId, `Cleaning needed${data.reason ? `: ${data.reason}` : ""}`);
    await logActivity(tx, actor, { action: "cleaning.create", entityType: "gown", entityId: data.gownId, summary: `Cleaning recorded for ${gownCode(gown.number)}` });
    return rec;
  });
}

export async function createAlteration(actor: Actor, input: unknown) {
  assertCan(actor, "operate");
  const data = parseInput(alterationSchema, input);
  return prisma.$transaction(async (tx) => {
    await lockGown(tx, data.gownId);
    const gown = await tx.gown.findUniqueOrThrow({ where: { id: data.gownId } });
    if (gown.status === "DISPOSED") throw new ConflictError("This gown has been disposed of.");
    const rec = await tx.alterationRecord.create({ data: { ...data, identifiedDate: toDbDate(data.identifiedDate), createdById: actor.id } });
    await afterNewWork(tx, actor, data.gownId, `Alteration needed: ${data.description}`);
    await logActivity(tx, actor, { action: "alteration.create", entityType: "gown", entityId: data.gownId, summary: `Alteration recorded for ${gownCode(gown.number)}` });
    return rec;
  });
}

export const workUpdateSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"]),
  assignedTo: optText(200),
  completedDate: optYmd("Completion date"),
  costCents: optMoneyCents("Cost"),
  notes: optText(2000),
  description: optText(2000),
  reason: optText(1000),
  /** When the last open job is completed: true → Available (ready), false → back to inspection. */
  markReady: bool,
});

export async function updateWork(actor: Actor, kind: "cleaning" | "alteration", id: string, input: unknown) {
  assertCan(actor, "operate");
  const data = parseInput(workUpdateSchema, input);
  if (data.status === "COMPLETED" && !data.completedDate) throw new AppError("Please enter the completion date.", { completedDate: "Required when completed" });
  return prisma.$transaction(async (tx) => {
    const rec =
      kind === "cleaning" ? await tx.cleaningRecord.findUnique({ where: { id } }) : await tx.alterationRecord.findUnique({ where: { id } });
    if (!rec) throw new NotFoundError(kind === "cleaning" ? "Cleaning record" : "Alteration record");
    await lockGown(tx, rec.gownId);
    const common = {
      status: data.status,
      assignedTo: data.assignedTo,
      completedDate: data.status === "COMPLETED" && data.completedDate ? toDbDate(data.completedDate) : null,
      completedById: data.status === "COMPLETED" ? actor.id : null,
      costCents: data.costCents,
      notes: data.notes,
    };
    if (kind === "cleaning") {
      await tx.cleaningRecord.update({ where: { id }, data: { ...common, ...(data.reason !== null ? { reason: data.reason } : {}) } });
    } else {
      await tx.alterationRecord.update({ where: { id }, data: { ...common, ...(data.description ? { description: data.description } : {}) } });
    }
    const gown = await tx.gown.findUniqueOrThrow({ where: { id: rec.gownId } });
    const label = kind === "cleaning" ? "Cleaning" : "Alteration";
    if (!["CHECKED_OUT", "DISPOSED", "ARCHIVED"].includes(gown.status) && (data.status === "COMPLETED" || data.status === "CANCELLED")) {
      const ws = await workStatus(tx, rec.gownId);
      if (ws) {
        await setGownStatus(tx, actor, rec.gownId, ws, `${label} ${data.status.toLowerCase()}; other work still open`);
      } else if (data.markReady) {
        const next = readyStatus(await activeItemStatuses(tx, rec.gownId));
        await tx.inspection.create({
          data: {
            gownId: rec.gownId,
            inspectionDate: toDbDate(data.completedDate ?? new Date().toISOString().slice(0, 10)),
            outcome: "READY",
            notes: `${label} ${data.status === "COMPLETED" ? "completed" : "cancelled"}; marked ready.`,
            inspectedById: actor.id,
          },
        });
        await setGownStatus(tx, actor, rec.gownId, next, `${label} completed — marked ready`);
      } else {
        await setGownStatus(tx, actor, rec.gownId, "PENDING_INSPECTION", `${label} ${data.status.toLowerCase()} — awaiting final inspection`);
      }
    } else if (!["CHECKED_OUT", "DISPOSED", "ARCHIVED"].includes(gown.status) && (data.status === "OPEN" || data.status === "IN_PROGRESS")) {
      const ws = await workStatus(tx, rec.gownId);
      if (ws && gown.status !== ws && !["UNAVAILABLE_OTHER"].includes(gown.status)) await setGownStatus(tx, actor, rec.gownId, ws, `${label} reopened`);
    }
    await logActivity(tx, actor, {
      action: `${kind}.update`,
      entityType: "gown",
      entityId: rec.gownId,
      summary: `${label} for ${gownCode(gown.number)} marked ${data.status.toLowerCase().replace("_", " ")}`,
    });
  });
}

export async function listOpenWork() {
  const [cleanings, alterations] = await Promise.all([
    prisma.cleaningRecord.findMany({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
      include: { gown: { select: { id: true, number: true, description: true, status: true } } },
      orderBy: { identifiedDate: "asc" },
    }),
    prisma.alterationRecord.findMany({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
      include: { gown: { select: { id: true, number: true, description: true, status: true } } },
      orderBy: { identifiedDate: "asc" },
    }),
  ]);
  return { cleanings, alterations };
}
