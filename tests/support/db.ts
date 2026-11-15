import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import type { Actor } from "@/lib/permissions";
import { addDays, todayYmd } from "@/lib/dates";

export { prisma };

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
  await prisma.appSettings.create({ data: { id: 1, defaultRentalFeeCents: 3600, defaultDepositCents: 10000 } });
}

export async function makeStaff(role: "ADMIN" | "ASSISTANT", name = role === "ADMIN" ? "Ada Admin" : "Asa Assistant"): Promise<Actor> {
  const s = await prisma.staffUser.create({
    data: { id: randomUUID(), email: `${randomUUID().slice(0, 8)}@example.test`, fullName: name, role },
  });
  return { id: s.id, role: s.role, fullName: s.fullName };
}

export const TODAY = () => todayYmd("America/New_York");
export const day = (n: number) => addDays(TODAY(), n);

export function gownInput(over: Record<string, unknown> = {}) {
  return {
    intakeDate: TODAY(),
    description: "Ivory lace A-line gown",
    style: "A-line",
    size: "8",
    color: "Ivory",
    ...over,
  };
}
