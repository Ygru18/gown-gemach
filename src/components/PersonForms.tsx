"use client";

import type { ActionResult } from "@/lib/actionTypes";
import { ActionForm, FieldError, SubmitButton } from "./forms";
import { buttonClass } from "./ui";

function Optional() {
  return <span className="ml-1.5 text-[11px] font-normal text-muted/80">optional</span>;
}

export interface CustomerValues {
  fullName: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
}

export function CustomerFields({ initial, showDuplicateOption }: { initial?: Partial<CustomerValues>; showDuplicateOption?: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="fullName">Full name <span className="text-blush-500">*</span></label>
        <input id="fullName" name="fullName" required defaultValue={initial?.fullName} className="input" autoComplete="off" />
        <FieldError name="fullName" />
      </div>
      <div>
        <label className="label" htmlFor="phone">Phone number <span className="text-blush-500">*</span></label>
        <input id="phone" name="phone" type="tel" required defaultValue={initial?.phone} className="input" autoComplete="off" />
        <FieldError name="phone" />
      </div>
      <div>
        <label className="label" htmlFor="email">Email <Optional /></label>
        <input id="email" name="email" type="email" defaultValue={initial?.email} className="input" placeholder="Not required" autoComplete="off" />
        <FieldError name="email" />
      </div>
      <div>
        <label className="label" htmlFor="address">Address <Optional /></label>
        <input id="address" name="address" defaultValue={initial?.address} className="input" autoComplete="off" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="notes">Notes <Optional /></label>
        <textarea id="notes" name="notes" rows={2} defaultValue={initial?.notes} className="input" />
      </div>
      {showDuplicateOption ? (
        <label className="flex items-center gap-2 text-[13px] text-ink-soft sm:col-span-2">
          <input type="checkbox" name="allowDuplicate" className="accent-blush-600" /> This is a different person (allow a record with the same name or phone)
        </label>
      ) : null}
    </div>
  );
}

export function CustomerForm({ action, initial, cancelHref, submitLabel = "Save customer" }: { action: (fd: FormData) => Promise<ActionResult>; initial?: Partial<CustomerValues>; cancelHref: string; submitLabel?: string }) {
  return (
    <ActionForm action={action} className="card p-5 sm:p-7">
      <CustomerFields initial={initial} showDuplicateOption />
      <div className="mt-6 flex justify-end gap-2">
        <a href={cancelHref} className={buttonClass("secondary")}>Cancel</a>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function DonorForm({ action, initial, cancelHref }: { action: (fd: FormData) => Promise<ActionResult>; initial?: Partial<{ name: string; phone: string; email: string; address: string; notes: string }>; cancelHref: string }) {
  return (
    <ActionForm action={action} className="card p-5 sm:p-7">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">Donor name <span className="text-blush-500">*</span></label>
          <input id="name" name="name" required defaultValue={initial?.name} className="input" />
          <FieldError name="name" />
        </div>
        <div>
          <label className="label" htmlFor="phone">Phone <Optional /></label>
          <input id="phone" name="phone" type="tel" defaultValue={initial?.phone} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="email">Email <Optional /></label>
          <input id="email" name="email" type="email" defaultValue={initial?.email} className="input" />
          <FieldError name="email" />
        </div>
        <div>
          <label className="label" htmlFor="address">Address <Optional /></label>
          <input id="address" name="address" defaultValue={initial?.address} className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="notes">Notes <Optional /></label>
          <textarea id="notes" name="notes" rows={2} defaultValue={initial?.notes} className="input" />
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <a href={cancelHref} className={buttonClass("secondary")}>Cancel</a>
        <SubmitButton>Save donor</SubmitButton>
      </div>
    </ActionForm>
  );
}
