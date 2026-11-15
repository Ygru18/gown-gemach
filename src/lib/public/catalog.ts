import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

/**
 * FUTURE PUBLIC WEBSITE — the ONLY approved way to read gown data for
 * anonymous visitors. Not wired to any route yet.
 *
 * Rules (enforced here, by construction):
 * - Only gowns explicitly flagged `isPubliclyListed` and in active,
 *   reservable inventory are ever returned.
 * - Only the whitelisted fields below are selected. Donor details,
 *   internal notes, status reasons, customers, reservations, payments and
 *   audit data are never queried, so they cannot leak.
 * - Availability is returned as a yes/no for requested dates — never who
 *   holds the gown.
 * - Public photos must be served through a dedicated, cached image route
 *   that signs only GALLERY photos of publicly listed gowns.
 *
 * A public site should live under its own route group (e.g. app/(public))
 * with its own layout, and must not import anything from src/lib/services
 * that touches customers, donors, payments or staff.
 */
export const PUBLIC_GOWN_SELECT = {
  id: true,
  number: true,
  publicDescription: true,
  style: true,
  size: true,
  color: true,
  designer: true,
  bust: true,
  waist: true,
  hips: true,
  length: true,
  photos: { where: { kind: "GALLERY" }, orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], select: { id: true, thumbPath: true, storagePath: true, isPrimary: true } },
} satisfies Prisma.GownSelect;

export const PUBLIC_STATUSES = ["AVAILABLE", "PENDING_RESERVATION", "RESERVED", "CHECKED_OUT", "PENDING_INSPECTION", "PENDING_CLEANING", "NEEDS_ALTERATION"] as const;

export async function listPublicGowns(filters: { size?: string; color?: string; style?: string } = {}) {
  return prisma.gown.findMany({
    where: {
      isPubliclyListed: true,
      status: { in: [...PUBLIC_STATUSES] },
      ...(filters.size ? { size: { equals: filters.size, mode: "insensitive" } } : {}),
      ...(filters.color ? { color: { equals: filters.color, mode: "insensitive" } } : {}),
      ...(filters.style ? { style: { equals: filters.style, mode: "insensitive" } } : {}),
    },
    select: PUBLIC_GOWN_SELECT,
    orderBy: { number: "asc" },
  });
}
