import "server-only";
import { z } from "zod";
import { prisma, type Tx } from "@/lib/db";
import { assertCan, type Actor } from "@/lib/permissions";
import { logActivity } from "@/lib/audit";
import { optEmail, optText, parseInput, reqText } from "@/lib/validation";
import { donorCode, parseCode, phoneDigits } from "@/lib/format";
import { NotFoundError } from "@/lib/errors";
import type { Prisma } from "@/generated/prisma/client";

export const donorSchema = z.object({
  name: reqText("Donor name", 200),
  phone: optText(50),
  email: optEmail,
  address: optText(500),
  notes: optText(5000),
});
export type DonorInput = z.output<typeof donorSchema>;

export async function createDonorTx(tx: Tx, actor: Actor, data: DonorInput) {
  const donor = await tx.donor.create({
    data: { ...data, phoneDigits: phoneDigits(data.phone) || null, createdById: actor.id },
  });
  await logActivity(tx, actor, {
    action: "donor.create",
    entityType: "donor",
    entityId: donor.id,
    summary: `Added donor ${donor.name} (${donorCode(donor.number)})`,
  });
  return donor;
}

export async function createDonor(actor: Actor, input: unknown) {
  assertCan(actor, "operate");
  const data = parseInput(donorSchema, input);
  return prisma.$transaction((tx) => createDonorTx(tx, actor, data));
}

export async function updateDonor(actor: Actor, donorId: string, input: unknown) {
  assertCan(actor, "operate");
  const data = parseInput(donorSchema, input);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.donor.findUnique({ where: { id: donorId } });
    if (!existing) throw new NotFoundError("Donor");
    const donor = await tx.donor.update({
      where: { id: donorId },
      data: { ...data, phoneDigits: phoneDigits(data.phone) || null },
    });
    await logActivity(tx, actor, { action: "donor.update", entityType: "donor", entityId: donorId, summary: `Updated donor ${donor.name} (${donorCode(donor.number)})` });
    return donor;
  });
}

export async function setDonorArchived(actor: Actor, donorId: string, archived: boolean) {
  assertCan(actor, "operate");
  return prisma.$transaction(async (tx) => {
    const donor = await tx.donor.update({ where: { id: donorId }, data: { isArchived: archived } });
    await logActivity(tx, actor, {
      action: archived ? "donor.archive" : "donor.restore",
      entityType: "donor",
      entityId: donorId,
      summary: `${archived ? "Archived" : "Restored"} donor ${donor.name}`,
    });
    return donor;
  });
}

export function donorSearchWhere(q: string | undefined, includeArchived = false): Prisma.DonorWhereInput {
  const where: Prisma.DonorWhereInput = includeArchived ? {} : { isArchived: false };
  const term = q?.trim();
  if (!term) return where;
  const or: Prisma.DonorWhereInput[] = [
    { name: { contains: term, mode: "insensitive" } },
    { email: { contains: term, mode: "insensitive" } },
  ];
  const digits = phoneDigits(term);
  if (digits.length >= 3) or.push({ phoneDigits: { contains: digits } });
  const code = parseCode(term, "D");
  if (code && /^d/i.test(term.trim())) or.push({ number: code });
  return { ...where, OR: or };
}

export async function findSimilarDonors(name: string, phone: string | null) {
  const digits = phoneDigits(phone);
  const or: Prisma.DonorWhereInput[] = [{ name: { equals: name.trim(), mode: "insensitive" } }];
  if (digits.length >= 7) or.push({ phoneDigits: digits });
  return prisma.donor.findMany({ where: { OR: or }, take: 5 });
}
