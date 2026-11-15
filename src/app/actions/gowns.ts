"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { formToObject } from "@/lib/validation";
import * as gowns from "@/lib/services/gowns";
import * as care from "@/lib/services/care";
import { gownCode } from "@/lib/format";

const refresh = (id?: string) => {
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  if (id) revalidatePath(`/inventory/${id}`);
};

export async function createGownAction(fd: FormData) {
  return runAction(async (actor) => {
    const g = await gowns.createGown(actor, formToObject(fd));
    refresh();
    return { ok: true, redirect: `/inventory/${g.id}?new=1&msg=${encodeURIComponent(`${gownCode(g.number)} added to inventory`)}`, data: { id: g.id } };
  });
}

export async function updateGownAction(gownId: string, fd: FormData) {
  return runAction(async (actor) => {
    await gowns.updateGown(actor, gownId, formToObject(fd));
    refresh(gownId);
    return { ok: true, redirect: `/inventory/${gownId}?msg=${encodeURIComponent("Gown details saved")}` };
  });
}

export async function markUnavailableAction(gownId: string, fd: FormData) {
  return runAction(async (actor) => {
    await gowns.markGownUnavailable(actor, gownId, String(fd.get("reason") ?? ""));
    refresh(gownId);
    return { ok: true, message: "Gown marked unavailable" };
  });
}

export async function archiveGownAction(gownId: string, fd: FormData) {
  return runAction(async (actor) => {
    await gowns.archiveGown(actor, gownId, String(fd.get("reason") ?? ""));
    refresh(gownId);
    return { ok: true, message: "Gown archived — its history is preserved" };
  });
}

export async function restoreGownAction(gownId: string) {
  return runAction(async (actor) => {
    await gowns.restoreArchivedGown(actor, gownId);
    refresh(gownId);
    return { ok: true, message: "Gown restored — please inspect it before renting" };
  });
}

export async function disposeGownAction(gownId: string, fd: FormData) {
  return runAction(async (actor) => {
    await gowns.disposeGown(actor, gownId, formToObject(fd));
    refresh(gownId);
    return { ok: true, message: "Gown marked as disposed" };
  });
}

export async function deleteGownAction(gownId: string) {
  return runAction(async (actor) => {
    await gowns.deleteGownPermanently(actor, gownId);
    refresh();
    return { ok: true, redirect: `/inventory?msg=${encodeURIComponent("Gown permanently deleted")}` };
  });
}

export async function preparePhotoUploadsAction(gownId: string, count: number) {
  return runAction(async (actor) => {
    const targets = await gowns.preparePhotoUploads(actor, gownId, count);
    return { ok: true, data: targets };
  });
}

export async function registerPhotosAction(gownId: string, refs: { full: string; thumb: string | null }[]) {
  return runAction(async (actor) => {
    await gowns.registerPhotos(actor, gownId, refs);
    refresh(gownId);
    return { ok: true, message: `${refs.length} photo${refs.length === 1 ? "" : "s"} added` };
  });
}

export async function setPrimaryPhotoAction(photoId: string) {
  return runAction(async (actor) => {
    const gownId = await gowns.setPrimaryPhoto(actor, photoId);
    refresh(gownId);
    return { ok: true, message: "Main photo updated" };
  });
}

export async function deletePhotoAction(photoId: string) {
  return runAction(async (actor) => {
    const gownId = await gowns.deletePhoto(actor, photoId);
    refresh(gownId);
    return { ok: true, message: "Photo removed" };
  });
}

export async function recordInspectionAction(fd: FormData) {
  return runAction(async (actor) => {
    const obj = formToObject(fd);
    await care.recordInspection(actor, obj);
    refresh(String(obj.gownId));
    revalidatePath("/returns");
    return { ok: true, message: "Inspection recorded" };
  });
}

export async function createCleaningAction(fd: FormData) {
  return runAction(async (actor) => {
    const obj = formToObject(fd);
    await care.createCleaning(actor, obj);
    refresh(String(obj.gownId));
    revalidatePath("/returns");
    return { ok: true, message: "Cleaning recorded" };
  });
}

export async function createAlterationAction(fd: FormData) {
  return runAction(async (actor) => {
    const obj = formToObject(fd);
    await care.createAlteration(actor, obj);
    refresh(String(obj.gownId));
    revalidatePath("/returns");
    return { ok: true, message: "Alteration recorded" };
  });
}

export async function updateWorkAction(kind: "cleaning" | "alteration", id: string, fd: FormData) {
  return runAction(async (actor) => {
    await care.updateWork(actor, kind, id, formToObject(fd));
    revalidatePath("/returns");
    revalidatePath("/inventory", "layout");
    revalidatePath("/dashboard");
    return { ok: true, message: `${kind === "cleaning" ? "Cleaning" : "Alteration"} updated` };
  });
}
