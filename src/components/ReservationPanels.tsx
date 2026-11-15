"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, PackageCheck, Undo2, Plus, AlertTriangle, Loader2, Search, Check, X } from "lucide-react";
import type { ActionResult } from "@/lib/actionTypes";
import { CONDITION_LABEL } from "@/lib/format";
import { ModalAction, Modal, useToast, FieldError } from "./forms";
import { buttonClass, cx } from "./ui";
import { PhotoPicker } from "./PhotoPicker";
import { uploadPhotos, type PrepareFn } from "./photoUpload";

const code = (n: number) => `G-${String(n).padStart(4, "0")}`;

function ConditionSelect({ id = "condition" }: { id?: string }) {
  return (
    <div>
      <label className="label" htmlFor={id}>Condition <span className="ml-1 text-[11px] font-normal text-muted/80">optional</span></label>
      <select id={id} name="condition" defaultValue="" className="input">
        <option value="">—</option>
        {Object.entries(CONDITION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </div>
  );
}

export function ConfirmReservationButton({
  items,
  canOverride,
  action,
}: {
  items: { id: string; gownNumber: number; description: string; requestedPickup: string; expectedReturn: string; conflicts: string[]; warnings: string[] }[];
  canOverride: boolean;
  action: (fd: FormData) => Promise<ActionResult>;
}) {
  const anyConflict = items.some((i) => i.conflicts.length);
  const [override, setOverride] = useState(false);
  return (
    <ModalAction
      label="Confirm reservation"
      icon={<CalendarCheck className="h-4 w-4" />}
      variant="primary"
      title="Confirm reservation"
      subtitle="Availability has been re-checked for each gown below."
      action={action}
      submitLabel={override ? "Confirm with override" : "Confirm"}
      modalSize="lg"
    >
      {items.map((i) => (
        <div key={i.id} className={cx("rounded-2xl border p-4", i.conflicts.length ? "border-red-200 bg-red-50/50" : "border-line bg-white")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{code(i.gownNumber)} · {i.description}</p>
            {i.conflicts.length ? <span className="text-[12px] font-medium text-red-700">Conflict</span> : <span className="flex items-center gap-1 text-[12px] font-medium text-[#3d6a4c]"><Check className="h-3.5 w-3.5" /> Available</span>}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-[12px] tracking-wide text-muted uppercase">Confirmed pickup date
              <input type="date" name={`pickup_${i.id}`} defaultValue={i.requestedPickup} max={i.expectedReturn} className="input mt-1" required />
            </label>
            <div className="text-[12px] tracking-wide text-muted uppercase">Expected return<p className="mt-2.5 text-[15px] tracking-normal text-ink normal-case">{i.expectedReturn}</p></div>
          </div>
          {i.conflicts.map((c) => <p key={c} className="mt-2 flex items-start gap-1.5 text-[13px] text-red-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{c}</p>)}
          {i.warnings.map((w) => <p key={w} className="mt-2 text-[12.5px] text-[#86672c]">• {w}</p>)}
        </div>
      ))}
      {anyConflict ? (
        canOverride ? (
          <div className="rounded-2xl border border-amber-300 bg-[#fcefdc] p-4">
            <label className="flex items-start gap-2.5 text-sm font-medium text-[#7a4f22]">
              <input type="checkbox" name="override" checked={override} onChange={(e) => setOverride(e.target.checked)} className="mt-0.5 accent-[#93602a]" />
              Override the availability conflict (administrator). This will be recorded in the audit history.
            </label>
            {override ? (
              <div className="mt-3">
                <label className="label" htmlFor="overrideReason">Reason for override <span className="text-blush-500">*</span></label>
                <input id="overrideReason" name="overrideReason" className="input" required />
                <FieldError name="overrideReason" />
              </div>
            ) : null}
          </div>
        ) : (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">This reservation cannot be confirmed while a gown is unavailable. Change its dates, remove it, or ask an administrator.</p>
        )
      ) : null}
    </ModalAction>
  );
}

export function PickupButton({ items, today, action }: { items: { id: string; gownNumber: number; description: string; ready: boolean; statusLabel: string }[]; today: string; action: (fd: FormData) => Promise<ActionResult> }) {
  return (
    <ModalAction label="Confirm pickup" icon={<PackageCheck className="h-4 w-4" />} variant="gold" title="Confirm pickup" subtitle="Select the gowns the customer is taking today." action={action} submitLabel="Confirm pickup">
      <fieldset className="space-y-2">
        {items.map((i) => (
          <label key={i.id} className={cx("flex items-start gap-3 rounded-xl border px-3.5 py-3 text-sm", i.ready ? "cursor-pointer border-line bg-white hover:border-gold-300" : "border-line bg-beige-100/60 text-muted")}>
            <input type="checkbox" name="itemIds[]" value={i.id} defaultChecked={i.ready} disabled={!i.ready} className="mt-0.5 accent-blush-600" />
            <span>
              <span className="font-medium text-ink">{code(i.gownNumber)}</span> · {i.description}
              {!i.ready ? <span className="block text-[12px] text-[#93602a]">Not ready: {i.statusLabel}. Mark it ready (inspection) first.</span> : null}
            </span>
          </label>
        ))}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="pickupDate">Actual pickup date</label>
          <input id="pickupDate" name="pickupDate" type="date" defaultValue={today} required className="input" />
        </div>
        <ConditionSelect />
      </div>
      <div>
        <label className="label" htmlFor="notes">Notes <span className="ml-1 text-[11px] font-normal text-muted/80">optional</span></label>
        <textarea id="notes" name="notes" rows={2} className="input" />
      </div>
    </ModalAction>
  );
}

export function ReturnButton({
  item,
  today,
  action,
  prepareUploads,
}: {
  item: { id: string; gownId: string; gownNumber: number; description: string; expectedReturn: string };
  today: string;
  action: (payload: Record<string, unknown>) => Promise<ActionResult>;
  prepareUploads: PrepareFn;
}) {
  const [open, setOpen] = useState(false);
  const [damage, setDamage] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<ActionResult | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();
  return (
    <>
      <button type="button" className={buttonClass("primary", "sm")} onClick={() => setOpen(true)}>
        <Undo2 className="h-3.5 w-3.5" /> Mark as returned
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Return ${code(item.gownNumber)}`} subtitle="The gown will move to Pending Inspection. It will not become available until it is inspected and marked ready.">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              setErr(null);
              let damagePhotos: { full: string; thumb: string | null }[] = [];
              try {
                if (damage && files.length) {
                  setProgress("Uploading photos…");
                  damagePhotos = await uploadPhotos(item.gownId, files, prepareUploads, (d, t) => setProgress(`Uploading photos ${d} of ${t}…`));
                }
              } catch (er) {
                setProgress(null);
                setErr({ ok: false, error: (er as Error).message });
                return;
              }
              setProgress(null);
              const r = await action({
                itemId: item.id,
                returnDate: fd.get("returnDate"),
                condition: fd.get("condition"),
                hasDamage: damage,
                damageNotes: fd.get("damageNotes"),
                notes: fd.get("notes"),
                damagePhotos,
              });
              if (!r.ok) {
                setErr(r);
                toast("error", r.error ?? "Could not record the return.");
                return;
              }
              toast("success", r.message ?? "Returned");
              setOpen(false);
              router.refresh();
            });
          }}
        >
          {err && !err.ok ? <p className="rounded-xl border border-red-200 bg-red-50/70 px-4 py-3 text-sm text-red-800">{err.error}</p> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="returnDate">Actual return date</label>
              <input id="returnDate" name="returnDate" type="date" defaultValue={today} required className="input" />
              <p className="mt-1 text-[12px] text-muted">Expected {item.expectedReturn}</p>
            </div>
            <ConditionSelect id="returnCondition" />
          </div>
          <label className="flex items-center gap-2.5 text-sm font-medium">
            <input type="checkbox" checked={damage} onChange={(e) => setDamage(e.target.checked)} className="accent-blush-600" /> Damage noticed
          </label>
          {damage ? (
            <div className="space-y-3 rounded-2xl border border-red-100 bg-red-50/40 p-4">
              <div>
                <label className="label" htmlFor="damageNotes">Describe the damage <span className="text-blush-500">*</span></label>
                <textarea id="damageNotes" name="damageNotes" rows={2} required className="input" />
                {err?.fieldErrors?.damageNotes ? <p className="mt-1 text-[13px] text-red-700">{err.fieldErrors.damageNotes}</p> : null}
              </div>
              <PhotoPicker files={files} onChange={setFiles} compact label="Photos of damage" />
            </div>
          ) : null}
          <div>
            <label className="label" htmlFor="returnNotes">Notes <span className="ml-1 text-[11px] font-normal text-muted/80">optional</span></label>
            <textarea id="returnNotes" name="notes" rows={2} className="input" />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            {progress ? <span className="mr-auto text-[13px] text-muted">{progress}</span> : null}
            <button type="button" className={buttonClass("secondary")} onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className={buttonClass("primary")} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Record return
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

type GownHit = { id: string; number: number; description: string; size: string; color: string; availability: { available: boolean; conflicts: string[]; warnings: string[] } | null };

export function AddGownButton({
  defaultPickup,
  defaultReturn,
  defaultFee,
  search,
  action,
}: {
  defaultPickup: string;
  defaultReturn: string;
  defaultFee: string;
  search: (q: string, p: string, r: string) => Promise<ActionResult<GownHit[]>>;
  action: (fd: FormData) => Promise<ActionResult>;
}) {
  const [q, setQ] = useState("");
  const [pickup, setPickup] = useState(defaultPickup);
  const [ret, setRet] = useState(defaultReturn);
  const [hits, setHits] = useState<GownHit[]>([]);
  const [chosen, setChosen] = useState<string>("");
  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await search(q, pickup, ret);
      if (r.ok) setHits(r.data ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [q, pickup, ret, search]);
  return (
    <ModalAction label="Add a gown" icon={<Plus className="h-4 w-4" />} size="sm" title="Add a gown to this reservation" action={action} submitLabel="Add gown" modalSize="lg">
      <input type="hidden" name="gownId" value={chosen} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-[12px] tracking-wide text-muted uppercase">Pickup<input type="date" name="pickupDate" value={pickup} onChange={(e) => setPickup(e.target.value)} className="input mt-1" required /></label>
        <label className="text-[12px] tracking-wide text-muted uppercase">Return<input type="date" name="returnDate" value={ret} onChange={(e) => setRet(e.target.value)} className="input mt-1" required /></label>
        <label className="text-[12px] tracking-wide text-muted uppercase">Fee ($)<input name="rentalFeeCents" defaultValue={defaultFee} inputMode="decimal" className="input mt-1" required /></label>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search gowns…" className="input pl-10" />
      </div>
      <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-2xl border border-line bg-white">
        {hits.map((g) => (
          <li key={g.id}>
            <label className={cx("flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-sm", chosen === g.id ? "bg-blush-50" : "hover:bg-champagne-50")}>
              <span className="flex items-center gap-2.5">
                <input type="radio" name="_pick" checked={chosen === g.id} onChange={() => setChosen(g.id)} className="accent-blush-600" />
                <span><b className="font-medium">{code(g.number)}</b> · {g.description} <span className="text-muted">· {g.size} · {g.color}</span></span>
              </span>
              {g.availability ? (g.availability.available ? <Check className="h-4 w-4 text-[#3d6a4c]" /> : <span title={g.availability.conflicts.join(" ")}><X className="h-4 w-4 text-red-600" /></span>) : null}
            </label>
          </li>
        ))}
      </ul>
      <FieldError name="gownId" />
    </ModalAction>
  );
}
