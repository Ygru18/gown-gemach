import "server-only";
import type { Tx } from "./db";
import type { Actor } from "./permissions";

export async function logActivity(
  tx: Tx,
  actor: Actor | null,
  entry: { action: string; entityType: string; entityId?: string | null; summary: string; details?: Record<string, unknown> }
) {
  await tx.activityLog.create({
    data: {
      actorId: actor?.id ?? null,
      actorName: actor?.fullName ?? "System",
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      summary: entry.summary,
      details: (entry.details ?? undefined) as never,
    },
  });
}
