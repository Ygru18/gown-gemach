import type { StaffRole } from "@/generated/prisma/enums";
import { ForbiddenError } from "./errors";

/**
 * Assistants can do everything operational. The ONLY admin-exclusive
 * permissions are the four the Gemach owner asked for, plus availability
 * override (which the admin may extend to assistants in Settings).
 */
export const ADMIN_ONLY = [
  "staff.manage", // users, assistants, login accounts, credentials, permissions
  "settings.manage", // system settings
  "gown.delete", // permanently delete inventory records
] as const;

export type Permission =
  | (typeof ADMIN_ONLY)[number]
  | "availability.override"
  | "operate"; // every day-to-day operation

export interface Actor {
  id: string;
  role: StaffRole;
  fullName: string;
}

export function can(actor: Pick<Actor, "role">, permission: Permission, opts: { allowAssistantOverride?: boolean } = {}): boolean {
  if (actor.role === "ADMIN") return true;
  if (actor.role !== "ASSISTANT") return false;
  if ((ADMIN_ONLY as readonly string[]).includes(permission)) return false;
  if (permission === "availability.override") return Boolean(opts.allowAssistantOverride);
  return permission === "operate";
}

export function assertCan(actor: Actor, permission: Permission, opts: { allowAssistantOverride?: boolean } = {}): void {
  if (!can(actor, permission, opts)) {
    const msg =
      permission === "staff.manage"
        ? "Only an administrator can manage staff accounts."
        : permission === "settings.manage"
          ? "Only an administrator can change system settings."
          : permission === "gown.delete"
            ? "Only an administrator can permanently delete inventory records. You can archive or dispose of the gown instead."
            : permission === "availability.override"
              ? "Only an administrator can override an availability conflict."
              : "You do not have permission to do that.";
    throw new ForbiddenError(msg);
  }
}
