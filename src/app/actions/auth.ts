"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff, LOCAL_TEST_COOKIE, requireStaff } from "@/lib/auth/session";
import { getEnv, isLocalTestMode } from "@/lib/env";
import { prisma } from "@/lib/db";
import { changeOwnPasswordSchema, markPasswordChanged, performFirstRunSetup } from "@/lib/services/staff";
import { parseInput } from "@/lib/validation";
import { AppError } from "@/lib/errors";
import type { ActionResult } from "@/lib/actionTypes";

export async function signInAction(fd: FormData): Promise<ActionResult> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!email || !password) return { ok: false, error: "Please enter your email and password." };
  if (isLocalTestMode()) {
    const staff = await prisma.staffUser.findUnique({ where: { email } });
    if (!staff || !staff.isActive) return { ok: false, error: "Email or password is not correct." };
    (await cookies()).set(LOCAL_TEST_COOKIE, staff.id, { httpOnly: true, sameSite: "lax", path: "/" });
    return { ok: true, redirect: "/dashboard" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { ok: false, error: "Email or password is not correct." };
  const staff = await prisma.staffUser.findUnique({ where: { id: data.user.id } });
  if (!staff || !staff.isActive) {
    await supabase.auth.signOut();
    return { ok: false, error: "This account does not have access to the Gemach system. Please contact the administrator." };
  }
  await prisma.staffUser.update({ where: { id: staff.id }, data: { lastLoginAt: new Date() } });
  return { ok: true, redirect: staff.mustChangePassword ? "/account?first=1" : "/dashboard" };
}

export async function signOutAction(): Promise<void> {
  if (isLocalTestMode()) {
    (await cookies()).delete(LOCAL_TEST_COOKIE);
  } else {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}

export async function changePasswordAction(fd: FormData): Promise<ActionResult> {
  try {
    const actor = await requireStaff();
    const data = parseInput(changeOwnPasswordSchema, { newPassword: fd.get("newPassword"), confirmPassword: fd.get("confirmPassword") });
    if (!isLocalTestMode()) {
      const supabase = await createClient();
      const { error } = await supabase.auth.updateUser({ password: data.newPassword });
      if (error) return { ok: false, error: `Could not change your password: ${error.message}` };
    }
    const wasFirst = actor.mustChangePassword;
    await markPasswordChanged(actor);
    return { ok: true, message: "Your password has been changed.", redirect: wasFirst ? "/dashboard" : undefined };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
    console.error(err);
    return { ok: false, error: "Could not change your password. Please try again." };
  }
}

export async function setupAction(fd: FormData): Promise<ActionResult> {
  try {
    const input = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string"));
    const staff = await performFirstRunSetup(input, isLocalTestMode() ? "local-test" : getEnv().SETUP_TOKEN);
    if (isLocalTestMode()) {
      (await cookies()).set(LOCAL_TEST_COOKIE, staff.id, { httpOnly: true, sameSite: "lax", path: "/" });
    } else {
      const supabase = await createClient();
      await supabase.auth.signInWithPassword({ email: staff.email, password: String(fd.get("password")) });
    }
    return { ok: true, message: "Welcome! Your administrator account is ready.", redirect: "/dashboard" };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
    console.error(err);
    return { ok: false, error: "Setup failed. Please check the server configuration and try again." };
  }
}

export async function currentStaffOrNull() {
  return getCurrentStaff();
}
