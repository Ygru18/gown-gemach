import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertCan, type Actor } from "@/lib/permissions";
import { logActivity } from "@/lib/audit";
import { parseInput, reqText } from "@/lib/validation";
import { AppError, ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { isLocalTestMode } from "@/lib/env";

/** Thin wrapper over the Supabase Auth admin API (local test mode: no-op). */
export const authAdmin = {
  async createUser(email: string, password: string): Promise<string> {
    if (isLocalTestMode()) return randomUUID();
    const { data, error } = await createAdminClient().auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) {
      if (error?.message?.toLowerCase().includes("already")) {
        throw new ConflictError("A login with this email address already exists.");
      }
      throw new AppError(`Could not create the login: ${error?.message ?? "unknown error"}`);
    }
    return data.user.id;
  },
  async setPassword(userId: string, password: string) {
    if (isLocalTestMode()) return;
    const { error } = await createAdminClient().auth.admin.updateUserById(userId, { password });
    if (error) throw new AppError(`Could not set the password: ${error.message}`);
  },
  async setEmail(userId: string, email: string) {
    if (isLocalTestMode()) return;
    const { error } = await createAdminClient().auth.admin.updateUserById(userId, { email, email_confirm: true });
    if (error) throw new AppError(`Could not change the email: ${error.message}`);
  },
  async setBanned(userId: string, banned: boolean) {
    if (isLocalTestMode()) return;
    const { error } = await createAdminClient().auth.admin.updateUserById(userId, { ban_duration: banned ? "876000h" : "none" });
    if (error) throw new AppError(`Could not update login access: ${error.message}`);
  },
};

const password = z
  .string({ error: "Password is required" })
  .min(10, "Passwords must be at least 10 characters")
  .max(72, "Passwords must be at most 72 characters");

export const createStaffSchema = z.object({
  fullName: reqText("Full name", 200),
  email: z.string().trim().toLowerCase().pipe(z.email("Please enter a valid email address")),
  role: z.enum(["ADMIN", "ASSISTANT"]),
  temporaryPassword: password,
});

export async function createStaff(actor: Actor, input: unknown) {
  assertCan(actor, "staff.manage");
  const data = parseInput(createStaffSchema, input);
  const exists = await prisma.staffUser.findUnique({ where: { email: data.email } });
  if (exists) throw new ConflictError("A staff member with this email address already exists.");
  const userId = await authAdmin.createUser(data.email, data.temporaryPassword);
  return prisma.$transaction(async (tx) => {
    const staff = await tx.staffUser.create({
      data: { id: userId, email: data.email, fullName: data.fullName, role: data.role, mustChangePassword: true, createdById: actor.id },
    });
    await logActivity(tx, actor, {
      action: "staff.create",
      entityType: "staff",
      entityId: staff.id,
      summary: `Created ${data.role === "ADMIN" ? "administrator" : "assistant"} account for ${data.fullName} (${data.email})`,
    });
    return staff;
  });
}

async function assertNotLastAdmin(excludingId: string) {
  const admins = await prisma.staffUser.count({ where: { role: "ADMIN", isActive: true, id: { not: excludingId } } });
  if (admins === 0) throw new ConflictError("There must always be at least one active administrator.");
}

export const updateStaffSchema = z.object({
  fullName: reqText("Full name", 200),
  email: z.string().trim().toLowerCase().pipe(z.email("Please enter a valid email address")),
  role: z.enum(["ADMIN", "ASSISTANT"]),
});

export async function updateStaff(actor: Actor, staffId: string, input: unknown) {
  assertCan(actor, "staff.manage");
  const data = parseInput(updateStaffSchema, input);
  const existing = await prisma.staffUser.findUnique({ where: { id: staffId } });
  if (!existing) throw new NotFoundError("Staff member");
  if (existing.role === "ADMIN" && data.role !== "ADMIN") {
    if (staffId === actor.id) throw new ForbiddenError("You cannot remove your own administrator role.");
    await assertNotLastAdmin(staffId);
  }
  if (data.email !== existing.email) {
    const clash = await prisma.staffUser.findUnique({ where: { email: data.email } });
    if (clash) throw new ConflictError("Another staff member already uses this email address.");
    await authAdmin.setEmail(staffId, data.email);
  }
  return prisma.$transaction(async (tx) => {
    const s = await tx.staffUser.update({ where: { id: staffId }, data });
    await logActivity(tx, actor, {
      action: "staff.update",
      entityType: "staff",
      entityId: staffId,
      summary: `Updated staff account ${s.fullName}${existing.role !== s.role ? ` (role ${existing.role} → ${s.role})` : ""}`,
    });
    return s;
  });
}

export async function setStaffActive(actor: Actor, staffId: string, active: boolean) {
  assertCan(actor, "staff.manage");
  const existing = await prisma.staffUser.findUnique({ where: { id: staffId } });
  if (!existing) throw new NotFoundError("Staff member");
  if (!active) {
    if (staffId === actor.id) throw new ForbiddenError("You cannot deactivate your own account.");
    if (existing.role === "ADMIN") await assertNotLastAdmin(staffId);
  }
  await authAdmin.setBanned(staffId, !active);
  return prisma.$transaction(async (tx) => {
    await tx.staffUser.update({ where: { id: staffId }, data: { isActive: active } });
    await logActivity(tx, actor, {
      action: active ? "staff.activate" : "staff.deactivate",
      entityType: "staff",
      entityId: staffId,
      summary: `${active ? "Re-activated" : "Deactivated"} login for ${existing.fullName}`,
    });
  });
}

const resetSchema = z.object({ temporaryPassword: password });

export async function resetStaffPassword(actor: Actor, staffId: string, input: unknown) {
  assertCan(actor, "staff.manage");
  const { temporaryPassword } = parseInput(resetSchema, input);
  const existing = await prisma.staffUser.findUnique({ where: { id: staffId } });
  if (!existing) throw new NotFoundError("Staff member");
  await authAdmin.setPassword(staffId, temporaryPassword);
  return prisma.$transaction(async (tx) => {
    await tx.staffUser.update({ where: { id: staffId }, data: { mustChangePassword: staffId !== actor.id } });
    await logActivity(tx, actor, { action: "staff.password_reset", entityType: "staff", entityId: staffId, summary: `Reset the password for ${existing.fullName}` });
  });
}

export const changeOwnPasswordSchema = z
  .object({ newPassword: password, confirmPassword: z.string() })
  .refine((v) => v.newPassword === v.confirmPassword, { message: "The two passwords do not match", path: ["confirmPassword"] });

export async function markPasswordChanged(actor: Actor) {
  await prisma.$transaction(async (tx) => {
    await tx.staffUser.update({ where: { id: actor.id }, data: { mustChangePassword: false } });
    await logActivity(tx, actor, { action: "staff.password_change", entityType: "staff", entityId: actor.id, summary: `${actor.fullName} changed their password` });
  });
}

// --- First-run setup --------------------------------------------------------

export const setupSchema = z
  .object({
    setupToken: z.string().min(1, "Setup code is required"),
    fullName: reqText("Full name", 200),
    email: z.string().trim().toLowerCase().pipe(z.email("Please enter a valid email address")),
    password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { message: "The two passwords do not match", path: ["confirmPassword"] });

export async function needsSetup() {
  return (await prisma.staffUser.count()) === 0;
}

/** Creates the very first administrator. Only possible while no staff exist. */
export async function performFirstRunSetup(input: unknown, expectedToken: string | undefined) {
  const data = parseInput(setupSchema, input);
  if (!expectedToken) throw new ForbiddenError("Setup is not enabled on this server (SETUP_TOKEN is not configured).");
  const { timingSafeEqual } = await import("node:crypto");
  const a = Buffer.from(data.setupToken.trim());
  const b = Buffer.from(expectedToken);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ForbiddenError("That setup code is not correct.");
  if (!(await needsSetup())) throw new ForbiddenError("Setup has already been completed. Please sign in.");
  const userId = await authAdmin.createUser(data.email, data.password);
  return prisma.$transaction(async (tx) => {
    if ((await tx.staffUser.count()) > 0) throw new ForbiddenError("Setup has already been completed.");
    const staff = await tx.staffUser.create({ data: { id: userId, email: data.email, fullName: data.fullName, role: "ADMIN" } });
    await logActivity(tx, { id: staff.id, role: "ADMIN", fullName: staff.fullName }, {
      action: "staff.setup",
      entityType: "staff",
      entityId: staff.id,
      summary: `First administrator account created for ${staff.fullName}`,
    });
    return staff;
  });
}
