import "server-only";
import { requireStaff, type CurrentStaff } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import type { ActionResult } from "./actionTypes";

/**
 * Wraps every server action: verifies the signed-in staff member (server
 * side — this is the authorization boundary together with the permission
 * checks inside each service), and converts known errors into friendly
 * messages. Unexpected errors are logged and shown generically.
 */
export async function runAction<T>(
  fn: (actor: CurrentStaff) => Promise<ActionResult<T> | void>,
  opts: { allowPasswordChange?: boolean } = {}
): Promise<ActionResult<T>> {
  try {
    const actor = await requireStaff();
    if (actor.mustChangePassword && !opts.allowPasswordChange) {
      return { ok: false, error: "Please choose a new password before continuing.", redirect: "/account?first=1" };
    }
    const res = await fn(actor);
    return res ?? { ok: true };
  } catch (err) {
    if (err instanceof AppError) {
      return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
    }
    console.error("Unexpected error in server action", err);
    return { ok: false, error: "Something went wrong and nothing was saved. Please try again; if it keeps happening, let the administrator know." };
  }
}
