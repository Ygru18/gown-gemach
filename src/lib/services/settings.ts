import "server-only";
import { z } from "zod";
import { prisma, type Tx } from "@/lib/db";
import { assertCan, type Actor } from "@/lib/permissions";
import { logActivity } from "@/lib/audit";
import { moneyCents, optText, parseInput } from "@/lib/validation";
import { todayYmd } from "@/lib/dates";
import type { AppSettings } from "@/generated/prisma/client";

export async function getSettings(tx: Tx = prisma): Promise<AppSettings> {
  const s = await tx.appSettings.findUnique({ where: { id: 1 } });
  if (s) return s;
  return tx.appSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

export async function getToday(tx: Tx = prisma): Promise<string> {
  const s = await getSettings(tx);
  return todayYmd(s.timezone);
}

const settingsSchema = z.object({
  defaultRentalFeeCents: moneyCents("Default rental fee"),
  defaultDepositCents: moneyCents("Default security deposit"),
  defaultRentalDays: z.coerce.number().int().min(1, "Rental length must be at least 1 day").max(365),
  turnaroundBufferDays: z.coerce.number().int().min(0).max(60),
  upcomingWindowDays: z.coerce.number().int().min(1).max(120),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown timezone"),
  allowAssistantOverride: z.union([z.literal("on"), z.literal("true"), z.boolean()]).nullish().transform((v) => v === "on" || v === "true" || v === true),
  contactPhone: optText(50),
  contactEmail: optText(200),
  contactAddress: optText(500),
  reservationTerms: optText(5000),
});

export async function updateSettings(actor: Actor, input: unknown) {
  assertCan(actor, "settings.manage");
  const data = parseInput(settingsSchema, input);
  return prisma.$transaction(async (tx) => {
    const before = await getSettings(tx);
    const after = await tx.appSettings.update({ where: { id: 1 }, data: { ...data, updatedById: actor.id } });
    const changed = Object.keys(data).filter((k) => String((before as never)[k]) !== String((after as never)[k]));
    await logActivity(tx, actor, {
      action: "settings.update",
      entityType: "settings",
      entityId: "1",
      summary: changed.length ? `Updated settings: ${changed.join(", ")}` : "Saved settings (no changes)",
    });
    return after;
  });
}
