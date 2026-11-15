"use client";

import { ActionForm, FieldError, SubmitButton } from "@/components/forms";
import { updateSettingsAction } from "@/app/actions/admin";

const ZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Toronto", "Europe/London", "Asia/Jerusalem", "UTC"];

export function SettingsForm({ initial }: { initial: Record<string, string | number | boolean> }) {
  return (
    <ActionForm action={updateSettingsAction} successMessage="Settings saved" className="space-y-6">
      <section className="card p-5 sm:p-7">
        <h2 className="font-display text-2xl font-semibold">Reservations</h2>
        <p className="mb-5 text-sm text-muted">Suggested defaults — staff can change them on each reservation.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="defaultRentalFeeCents">Default rental fee ($)</label>
            <input id="defaultRentalFeeCents" name="defaultRentalFeeCents" defaultValue={String(initial.defaultRentalFeeCents)} inputMode="decimal" className="input" required />
            <FieldError name="defaultRentalFeeCents" />
          </div>
          <div>
            <label className="label" htmlFor="defaultDepositCents">Default security deposit ($)</label>
            <input id="defaultDepositCents" name="defaultDepositCents" defaultValue={String(initial.defaultDepositCents)} inputMode="decimal" className="input" required />
            <FieldError name="defaultDepositCents" />
          </div>
          <div>
            <label className="label" htmlFor="defaultRentalDays">Default rental length (days)</label>
            <input id="defaultRentalDays" name="defaultRentalDays" type="number" min={1} max={365} defaultValue={String(initial.defaultRentalDays)} className="input" required />
          </div>
          <div>
            <label className="label" htmlFor="turnaroundBufferDays">Turnaround buffer (days)</label>
            <input id="turnaroundBufferDays" name="turnaroundBufferDays" type="number" min={0} max={60} defaultValue={String(initial.turnaroundBufferDays)} className="input" required />
            <p className="mt-1 text-[12px] text-muted">Days a gown is held after its return date before it can be booked again.</p>
          </div>
          <div>
            <label className="label" htmlFor="upcomingWindowDays">Dashboard look-ahead (days)</label>
            <input id="upcomingWindowDays" name="upcomingWindowDays" type="number" min={1} max={120} defaultValue={String(initial.upcomingWindowDays)} className="input" required />
          </div>
          <div>
            <label className="label" htmlFor="timezone">Time zone</label>
            <select id="timezone" name="timezone" defaultValue={String(initial.timezone)} className="input">
              {[...new Set([String(initial.timezone), ...ZONES])].map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
        </div>
        <label className="mt-5 flex items-start gap-2.5 rounded-xl bg-champagne-50 px-4 py-3 text-sm">
          <input type="checkbox" name="allowAssistantOverride" defaultChecked={Boolean(initial.allowAssistantOverride)} className="mt-0.5 accent-blush-600" />
          <span><b className="font-medium">Allow assistants to override availability conflicts.</b> <span className="text-ink-soft">Every override always requires a reason and is recorded in the audit history.</span></span>
        </label>
      </section>
      <section className="card p-5 sm:p-7">
        <h2 className="font-display text-2xl font-semibold">Gemach contact details</h2>
        <p className="mb-5 text-sm text-muted">Optional. Reserved for printouts and the future public website.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label" htmlFor="contactPhone">Phone</label><input id="contactPhone" name="contactPhone" defaultValue={String(initial.contactPhone)} className="input" /></div>
          <div><label className="label" htmlFor="contactEmail">Email</label><input id="contactEmail" name="contactEmail" defaultValue={String(initial.contactEmail)} className="input" /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="contactAddress">Address</label><input id="contactAddress" name="contactAddress" defaultValue={String(initial.contactAddress)} className="input" /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="reservationTerms">Rental terms</label><textarea id="reservationTerms" name="reservationTerms" defaultValue={String(initial.reservationTerms)} rows={4} className="input" /></div>
        </div>
      </section>
      <div className="flex justify-end"><SubmitButton size="lg">Save settings</SubmitButton></div>
    </ActionForm>
  );
}
