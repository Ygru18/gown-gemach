import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { isLocalTestMode } from "@/lib/env";
import type { Actor } from "@/lib/permissions";
import { ForbiddenError } from "@/lib/errors";

export const LOCAL_TEST_COOKIE = "gemach_local_test_uid";

export interface CurrentStaff extends Actor {
  email: string;
  mustChangePassword: boolean;
}

/**
 * Verifies the Supabase session with the Auth server (getUser, never
 * getSession) and loads the matching active staff record. This — not the
 * proxy, not hidden buttons — is the authentication boundary. Every server
 * action and protected page calls it.
 */
export const getCurrentStaff = cache(async (): Promise<CurrentStaff | null> => {
  let userId: string | null = null;

  if (isLocalTestMode()) {
    const store = await cookies();
    userId = store.get(LOCAL_TEST_COOKIE)?.value ?? null;
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    userId = data.user.id;
  }
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) return null;

  const staff = await prisma.staffUser.findUnique({ where: { id: userId } });
  if (!staff || !staff.isActive) return null;
  return {
    id: staff.id,
    role: staff.role,
    fullName: staff.fullName,
    email: staff.email,
    mustChangePassword: staff.mustChangePassword,
  };
});

/** For pages: redirect to login when not signed in. */
export async function requireStaffPage(opts: { allowPasswordChange?: boolean } = {}): Promise<CurrentStaff> {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");
  if (staff.mustChangePassword && !opts.allowPasswordChange) redirect("/account?first=1");
  return staff;
}

export async function requireAdminPage(): Promise<CurrentStaff> {
  const staff = await requireStaffPage();
  if (staff.role !== "ADMIN") redirect("/dashboard?denied=1");
  return staff;
}

/** For server actions / route handlers: throw instead of redirecting. */
export async function requireStaff(): Promise<CurrentStaff> {
  const staff = await getCurrentStaff();
  if (!staff) throw new ForbiddenError("Your session has ended. Please sign in again.");
  return staff;
}
