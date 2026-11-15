"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { formToObject } from "@/lib/validation";
import * as staff from "@/lib/services/staff";
import { updateSettings } from "@/lib/services/settings";

export async function createStaffAction(fd: FormData) {
  return runAction(async (actor) => {
    const s = await staff.createStaff(actor, formToObject(fd));
    revalidatePath("/staff");
    return { ok: true, message: `Account created for ${s.fullName}. Share the temporary password with them privately — they'll choose their own when they first sign in.` };
  });
}

export async function updateStaffAction(staffId: string, fd: FormData) {
  return runAction(async (actor) => {
    await staff.updateStaff(actor, staffId, formToObject(fd));
    revalidatePath("/staff");
    return { ok: true, message: "Staff account updated" };
  });
}

export async function setStaffActiveAction(staffId: string, active: boolean) {
  return runAction(async (actor) => {
    await staff.setStaffActive(actor, staffId, active);
    revalidatePath("/staff");
    return { ok: true, message: active ? "Login re-activated" : "Login deactivated" };
  });
}

export async function resetStaffPasswordAction(staffId: string, fd: FormData) {
  return runAction(async (actor) => {
    await staff.resetStaffPassword(actor, staffId, formToObject(fd));
    revalidatePath("/staff");
    return { ok: true, message: "Temporary password set. They will be asked to choose a new one when they sign in." };
  });
}

export async function updateSettingsAction(fd: FormData) {
  return runAction(async (actor) => {
    await updateSettings(actor, formToObject(fd));
    revalidatePath("/", "layout");
    return { ok: true, message: "Settings saved" };
  });
}
