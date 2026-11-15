import "server-only";
import type { Tx } from "@/lib/db";
import type { Actor } from "@/lib/permissions";
import type { GownStatus } from "@/generated/prisma/enums";
import { deriveGownStatus } from "@/lib/gownStatus";
import { GOWN_STATUS_LABEL, gownCode } from "@/lib/format";
import { NotFoundError } from "@/lib/errors";

export const ACTIVE_ITEM_STATUSES = ["PENDING", "CONFIRMED", "CHECKED_OUT"] as const;

/** Locks the gown row for the rest of the transaction (serialises changes per gown). */
export async function lockGown(tx: Tx, gownId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM gowns WHERE id = ${gownId}::uuid FOR UPDATE`;
  if (rows.length === 0) throw new NotFoundError("Gown");
}

export async function setGownStatus(
  tx: Tx,
  actor: Actor | null,
  gownId: string,
  to: GownStatus,
  reason: string | null,
  extra: Record<string, unknown> = {}
) {
  const gown = await tx.gown.findUniqueOrThrow({ where: { id: gownId }, select: { status: true, number: true } });
  if (gown.status === to && Object.keys(extra).length === 0) return gown.status;
  await tx.gown.update({
    where: { id: gownId },
    data: { status: to, statusReason: reason, statusChangedAt: new Date(), ...extra },
  });
  if (gown.status !== to) {
    await tx.gownStatusChange.create({
      data: { gownId, fromStatus: gown.status, toStatus: to, reason, changedById: actor?.id ?? null },
    });
  }
  return to;
}

/** Re-derives status from active reservation items (preserves work/terminal states). */
export async function refreshGownStatus(tx: Tx, actor: Actor | null, gownId: string, reason: string) {
  const gown = await tx.gown.findUniqueOrThrow({ where: { id: gownId }, select: { status: true } });
  const items = await tx.reservationItem.findMany({
    where: { gownId, status: { in: [...ACTIVE_ITEM_STATUSES] } },
    select: { status: true },
  });
  const next = deriveGownStatus(gown.status, items.map((i) => i.status));
  if (next !== gown.status) await setGownStatus(tx, actor, gownId, next, reason);
  return next;
}

export async function activeItemStatuses(tx: Tx, gownId: string) {
  const items = await tx.reservationItem.findMany({
    where: { gownId, status: { in: [...ACTIVE_ITEM_STATUSES] } },
    select: { status: true },
  });
  return items.map((i) => i.status);
}

export function describeGown(g: { number: number; description: string }) {
  return `${gownCode(g.number)} (${g.description})`;
}

export function statusLabel(s: GownStatus) {
  return GOWN_STATUS_LABEL[s];
}
