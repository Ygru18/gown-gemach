"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions";
import { formToObject } from "@/lib/validation";
import * as customers from "@/lib/services/customers";
import * as donors from "@/lib/services/donors";
import { customerCode, donorCode } from "@/lib/format";

export async function createCustomerAction(fd: FormData) {
  return runAction(async (actor) => {
    const c = await customers.createCustomer(actor, formToObject(fd));
    revalidatePath("/customers");
    return { ok: true, redirect: `/customers/${c.id}?msg=${encodeURIComponent(`${c.fullName} (${customerCode(c.number)}) added`)}`, data: c };
  });
}

/** Used inside the reservation workflow: returns the new customer instead of redirecting. */
export async function quickCreateCustomerAction(fd: FormData) {
  return runAction(async (actor) => {
    const c = await customers.createCustomer(actor, formToObject(fd));
    revalidatePath("/customers");
    return { ok: true, message: `${c.fullName} added`, data: { id: c.id, number: c.number, fullName: c.fullName, phone: c.phone, email: c.email } };
  });
}

export async function updateCustomerAction(customerId: string, fd: FormData) {
  return runAction(async (actor) => {
    await customers.updateCustomer(actor, customerId, formToObject(fd));
    revalidatePath("/customers");
    revalidatePath(`/customers/${customerId}`);
    return { ok: true, redirect: `/customers/${customerId}?msg=${encodeURIComponent("Customer saved")}` };
  });
}

export async function setCustomerArchivedAction(customerId: string, archived: boolean) {
  return runAction(async (actor) => {
    await customers.setCustomerArchived(actor, customerId, archived);
    revalidatePath(`/customers/${customerId}`);
    revalidatePath("/customers");
    return { ok: true, message: archived ? "Customer marked inactive — history kept" : "Customer reactivated" };
  });
}

export async function searchCustomersAction(q: string) {
  return runAction(async () => {
    const rows = await customers.searchCustomers(q, 8);
    return { ok: true, data: rows };
  });
}

export async function createDonorAction(fd: FormData) {
  return runAction(async (actor) => {
    const d = await donors.createDonor(actor, formToObject(fd));
    revalidatePath("/donors");
    return { ok: true, redirect: `/donors/${d.id}?msg=${encodeURIComponent(`${d.name} (${donorCode(d.number)}) added`)}` };
  });
}

export async function updateDonorAction(donorId: string, fd: FormData) {
  return runAction(async (actor) => {
    await donors.updateDonor(actor, donorId, formToObject(fd));
    revalidatePath("/donors");
    revalidatePath(`/donors/${donorId}`);
    return { ok: true, redirect: `/donors/${donorId}?msg=${encodeURIComponent("Donor saved")}` };
  });
}

export async function setDonorArchivedAction(donorId: string, archived: boolean) {
  return runAction(async (actor) => {
    await donors.setDonorArchived(actor, donorId, archived);
    revalidatePath(`/donors/${donorId}`);
    revalidatePath("/donors");
    return { ok: true, message: archived ? "Donor archived" : "Donor restored" };
  });
}
