import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma, resetDb, makeStaff } from "./support/db";
import type { Actor } from "@/lib/permissions";
import { authAdmin, createStaff, setStaffActive, updateStaff, resetStaffPassword, performFirstRunSetup } from "@/lib/services/staff";
import { ForbiddenError, ConflictError } from "@/lib/errors";

let admin: Actor;
let asst: Actor;

beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
  vi.spyOn(authAdmin, "createUser").mockImplementation(async () => randomUUID());
  vi.spyOn(authAdmin, "setPassword").mockResolvedValue();
  vi.spyOn(authAdmin, "setBanned").mockResolvedValue();
  vi.spyOn(authAdmin, "setEmail").mockResolvedValue();
});

describe("first-run setup", () => {
  it("creates the first admin only with the right code and only once", async () => {
    const input = { setupToken: "abc123", fullName: "Owner", email: "owner@example.test", password: "longpassword1", confirmPassword: "longpassword1" };
    await expect(performFirstRunSetup({ ...input, setupToken: "wrong!" }, "abc123")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(performFirstRunSetup(input, undefined)).rejects.toBeInstanceOf(ForbiddenError);
    const s = await performFirstRunSetup(input, "abc123");
    expect(s.role).toBe("ADMIN");
    await expect(performFirstRunSetup({ ...input, email: "x@example.test" }, "abc123")).rejects.toThrow(/already been completed/);
  });
});

describe("staff management (admin only)", () => {
  beforeEach(async () => {
    admin = await makeStaff("ADMIN");
    asst = await makeStaff("ASSISTANT");
  });

  it("assistants cannot manage users, logins or permissions", async () => {
    await expect(createStaff(asst, { fullName: "X", email: "x@example.test", role: "ASSISTANT", temporaryPassword: "temporary-pass" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setStaffActive(asst, admin.id, false)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateStaff(asst, asst.id, { fullName: "Me", email: "me@example.test", role: "ADMIN" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(resetStaffPassword(asst, admin.id, { temporaryPassword: "temporary-pass" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("admin creates assistants who must change their temporary password", async () => {
    const s = await createStaff(admin, { fullName: "Miriam", email: "Miriam@Example.test", role: "ASSISTANT", temporaryPassword: "temporary-pass" });
    expect(s.email).toBe("miriam@example.test");
    expect(s.mustChangePassword).toBe(true);
    await expect(createStaff(admin, { fullName: "Dup", email: "miriam@example.test", role: "ASSISTANT", temporaryPassword: "temporary-pass" })).rejects.toBeInstanceOf(ConflictError);
    await expect(createStaff(admin, { fullName: "Short", email: "s@example.test", role: "ASSISTANT", temporaryPassword: "short" })).rejects.toThrow(/at least 10/);
  });

  it("protects the last administrator and self", async () => {
    await expect(setStaffActive(admin, admin.id, false)).rejects.toThrow(/own account/);
    await expect(updateStaff(admin, admin.id, { fullName: "A", email: "a@example.test", role: "ASSISTANT" })).rejects.toThrow(/own administrator/);
    await setStaffActive(admin, asst.id, false);
    expect((await prisma.staffUser.findUniqueOrThrow({ where: { id: asst.id } })).isActive).toBe(false);
    expect(authAdmin.setBanned).toHaveBeenCalledWith(asst.id, true);
  });
});
