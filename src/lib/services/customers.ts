import "server-only";
import { z } from "zod";
import { prisma, type Tx } from "@/lib/db";
import { assertCan, type Actor } from "@/lib/permissions";
import { logActivity } from "@/lib/audit";
import { optEmail, optText, parseInput, reqText } from "@/lib/validation";
import { customerCode, parseCode, phoneDigits } from "@/lib/format";
import { AppError, NotFoundError } from "@/lib/errors";
import type { Prisma } from "@/generated/prisma/client";

// Email is NEVER required. Name + phone is enough.
export const customerSchema = z.object({
  fullName: reqText("Full name", 200),
  phone: reqText("Phone number", 50).refine((v) => phoneDigits(v).length >= 7, "Please enter a phone number with at least 7 digits"),
  email: optEmail,
  address: optText(500),
  notes: optText(5000),
  allowDuplicate: z.union([z.literal("on"), z.literal("true"), z.boolean()]).nullish().transform((v) => v === "on" || v === "true" || v === true),
});
export type CustomerInput = z.output<typeof customerSchema>;

export class DuplicateCustomerError extends AppError {
  readonly matches: { id: string; number: number; fullName: string; phone: string }[];
  constructor(matches: { id: string; number: number; fullName: string; phone: string }[]) {
    const m = matches[0]!;
    super(
      `A customer with this ${phoneDigits(m.phone) ? "phone number or name" : "name"} already exists: ${m.fullName} (${customerCode(m.number)}). Select the existing customer, or tick "This is a different person" to create a new record.`
    );
    this.name = "DuplicateCustomerError";
    this.matches = matches;
  }
}

export async function findDuplicateCustomers(tx: Tx, fullName: string, phone: string, excludeId?: string) {
  const digits = phoneDigits(phone);
  return tx.customer.findMany({
    where: {
      id: excludeId ? { not: excludeId } : undefined,
      OR: [
        ...(digits.length >= 7 ? [{ phoneDigits: digits }] : []),
        { fullName: { equals: fullName.trim(), mode: "insensitive" as const } },
      ],
    },
    select: { id: true, number: true, fullName: true, phone: true },
    take: 5,
  });
}

export async function createCustomerTx(tx: Tx, actor: Actor, data: CustomerInput) {
  if (!data.allowDuplicate) {
    const dups = await findDuplicateCustomers(tx, data.fullName, data.phone);
    if (dups.length) throw new DuplicateCustomerError(dups);
  }
  const { allowDuplicate: _ignored, ...rest } = data;
  void _ignored;
  const customer = await tx.customer.create({
    data: { ...rest, phoneDigits: phoneDigits(data.phone), createdById: actor.id },
  });
  await logActivity(tx, actor, {
    action: "customer.create",
    entityType: "customer",
    entityId: customer.id,
    summary: `Added customer ${customer.fullName} (${customerCode(customer.number)})`,
  });
  return customer;
}

export async function createCustomer(actor: Actor, input: unknown) {
  assertCan(actor, "operate");
  const data = parseInput(customerSchema, input);
  return prisma.$transaction((tx) => createCustomerTx(tx, actor, data));
}

export async function updateCustomer(actor: Actor, customerId: string, input: unknown) {
  assertCan(actor, "operate");
  const data = parseInput(customerSchema, input);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.customer.findUnique({ where: { id: customerId } });
    if (!existing) throw new NotFoundError("Customer");
    if (!data.allowDuplicate && phoneDigits(data.phone) !== existing.phoneDigits) {
      const dups = (await findDuplicateCustomers(tx, data.fullName, data.phone, customerId)).filter((d) => phoneDigits(d.phone) === phoneDigits(data.phone));
      if (dups.length) throw new DuplicateCustomerError(dups);
    }
    const { allowDuplicate: _ignored, ...rest } = data;
    void _ignored;
    const customer = await tx.customer.update({ where: { id: customerId }, data: { ...rest, phoneDigits: phoneDigits(data.phone) } });
    await logActivity(tx, actor, {
      action: "customer.update",
      entityType: "customer",
      entityId: customerId,
      summary: `Updated customer ${customer.fullName} (${customerCode(customer.number)})`,
    });
    return customer;
  });
}

export async function setCustomerArchived(actor: Actor, customerId: string, archived: boolean) {
  assertCan(actor, "operate");
  return prisma.$transaction(async (tx) => {
    const c = await tx.customer.update({ where: { id: customerId }, data: { isArchived: archived } });
    await logActivity(tx, actor, {
      action: archived ? "customer.archive" : "customer.restore",
      entityType: "customer",
      entityId: customerId,
      summary: `${archived ? "Marked inactive" : "Reactivated"} customer ${c.fullName} (${customerCode(c.number)})`,
    });
    return c;
  });
}

export function customerSearchWhere(q: string | undefined, includeArchived = false): Prisma.CustomerWhereInput {
  const where: Prisma.CustomerWhereInput = includeArchived ? {} : { isArchived: false };
  const term = q?.trim();
  if (!term) return where;
  const or: Prisma.CustomerWhereInput[] = [
    { fullName: { contains: term, mode: "insensitive" } },
    { email: { contains: term, mode: "insensitive" } },
  ];
  const digits = phoneDigits(term);
  if (digits.length >= 3) or.push({ phoneDigits: { contains: digits } });
  const code = parseCode(term, "C");
  if (code) or.push({ number: code });
  return { ...where, OR: or };
}

export async function searchCustomers(q: string, take = 8) {
  return prisma.customer.findMany({
    where: customerSearchWhere(q),
    orderBy: [{ fullName: "asc" }],
    take,
    select: { id: true, number: true, fullName: true, phone: true, email: true },
  });
}
