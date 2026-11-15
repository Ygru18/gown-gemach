"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, UserPlus, X, Check, AlertTriangle, Loader2, Plus, Info } from "lucide-react";
import type { ActionResult } from "@/lib/actionTypes";
import type { NewReservationPayload } from "@/app/actions/reservations";
import { buttonClass, cx, GownSilhouette } from "./ui";
import { ActionForm, SubmitButton, useToast } from "./forms";
import { CustomerFields } from "./PersonForms";
import { GownStatusBadge } from "./status";
import type { GownStatus } from "@/generated/prisma/enums";

type Customer = { id: string; number: number; fullName: string; phone: string; email: string | null };
type GownHit = {
  id: string;
  number: number;
  description: string;
  size: string;
  color: string;
  style: string;
  status: GownStatus;
  photoUrl: string | null;
  availability: { available: boolean; conflicts: string[]; warnings: string[] } | null;
};
type Item = { gown: GownHit; pickupDate: string; returnDate: string; rentalFee: string; check?: GownHit["availability"] };

const code = (p: string, n: number) => `${p}-${String(n).padStart(4, "0")}`;

function addDays(ymd: string, n: number) {
  if (!ymd) return "";
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function ReservationBuilder({
  today,
  defaults,
  initialCustomer,
  initialGown,
  searchCustomers,
  quickCreateCustomer,
  searchGowns,
  checkAvailability,
  createReservation,
}: {
  today: string;
  defaults: { rentalFee: string; deposit: string; rentalDays: number };
  initialCustomer: Customer | null;
  initialGown: GownHit | null;
  searchCustomers: (q: string) => Promise<ActionResult<Customer[]>>;
  quickCreateCustomer: (fd: FormData) => Promise<ActionResult>;
  searchGowns: (q: string, pickup: string, ret: string) => Promise<ActionResult<GownHit[]>>;
  checkAvailability: (gownId: string, pickup: string, ret: string) => Promise<ActionResult<GownHit["availability"]>>;
  createReservation: (p: NewReservationPayload) => Promise<ActionResult>;
}) {
  const [customer, setCustomer] = useState<Customer | null>(initialCustomer);
  const [custQ, setCustQ] = useState("");
  const [custHits, setCustHits] = useState<Customer[]>([]);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [pickup, setPickup] = useState("");
  const [ret, setRet] = useState("");
  const [gownQ, setGownQ] = useState("");
  const [gownHits, setGownHits] = useState<GownHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [items, setItems] = useState<Item[]>(initialGown ? [{ gown: initialGown, pickupDate: "", returnDate: "", rentalFee: defaults.rentalFee }] : []);
  const [deposit, setDeposit] = useState(defaults.deposit);
  const [requestDate, setRequestDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  // Customer search
  useEffect(() => {
    if (customer || custQ.trim().length < 2) return;
    const t = setTimeout(async () => {
      const r = await searchCustomers(custQ);
      if (r.ok) setCustHits(r.data ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [custQ, customer, searchCustomers]);

  // Gown search (with availability for the chosen dates)
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      const r = await searchGowns(gownQ, pickup, ret);
      if (!cancelled && r.ok) setGownHits(r.data ?? []);
      if (!cancelled) setSearching(false);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [gownQ, pickup, ret, searchGowns]);

  // When shared dates change, apply them to items that have no dates yet.
  const applySharedDates = (p: string, r: string) => setItems((xs) => xs.map((i) => ({ ...i, pickupDate: i.pickupDate || p, returnDate: i.returnDate || r })));
  const visibleCustHits = customer || custQ.trim().length < 2 ? [] : custHits;

  // Re-check availability for each item when its dates change.
  const itemKey = items.map((i) => `${i.gown.id}:${i.pickupDate}:${i.returnDate}`).join("|");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await Promise.all(
        items.map(async (i) => {
          if (!i.pickupDate || !i.returnDate || i.returnDate < i.pickupDate) return { ...i, check: null };
          const r = await checkAvailability(i.gown.id, i.pickupDate, i.returnDate);
          return { ...i, check: r.ok ? r.data : null };
        })
      );
      if (!cancelled) setItems((cur) => cur.map((c, idx) => (next[idx] && next[idx]!.gown.id === c.gown.id ? { ...c, check: next[idx]!.check } : c)));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemKey]);

  const selectedIds = useMemo(() => new Set(items.map((i) => i.gown.id)), [items]);
  const hasConflict = items.some((i) => i.check && !i.check.available);
  const totalFee = items.reduce((s, i) => s + (Number.parseFloat(i.rentalFee || "0") || 0), 0);

  const submit = () => {
    setError(null);
    if (!customer) return setError("Please choose or add a customer.");
    if (items.length === 0) return setError("Please add at least one gown.");
    for (const i of items) {
      if (!i.pickupDate || !i.returnDate) return setError(`Please set the pickup and return dates for ${code("G", i.gown.number)}.`);
      if (i.returnDate < i.pickupDate) return setError(`The return date for ${code("G", i.gown.number)} is before its pickup date.`);
    }
    start(async () => {
      const r = await createReservation({
        customerId: customer.id,
        requestDate,
        depositRequired: deposit,
        notes,
        items: items.map((i) => ({ gownId: i.gown.id, pickupDate: i.pickupDate, returnDate: i.returnDate, rentalFee: i.rentalFee })),
      });
      if (!r.ok) {
        setError(r.error ?? "Could not create the reservation.");
        toast("error", r.error ?? "Could not create the reservation.");
        return;
      }
      if (r.redirect) router.push(r.redirect);
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div className="space-y-6">
        {/* Step 1: customer */}
        <section className="card p-5 sm:p-6">
          <StepTitle n={1} title="Customer" />
          {customer ? (
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-blush-200 bg-blush-50/60 px-4 py-3">
              <div>
                <p className="font-display text-xl font-semibold">{customer.fullName}</p>
                <p className="text-sm text-ink-soft">{code("C", customer.number)} · {customer.phone}{customer.email ? ` · ${customer.email}` : ""}</p>
              </div>
              <button type="button" className={buttonClass("ghost", "sm")} onClick={() => { setCustomer(null); setCustQ(""); }}>Change</button>
            </div>
          ) : addingCustomer ? (
            <div className="rounded-2xl border border-line bg-white/60 p-4">
              <ActionForm
                action={quickCreateCustomer}
                onSuccess={(r) => {
                  setCustomer(r.data as Customer);
                  setAddingCustomer(false);
                }}
                successMessage="Customer added"
              >
                <CustomerFields showDuplicateOption />
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setAddingCustomer(false)}>Back to search</button>
                  <SubmitButton size="sm">Add customer</SubmitButton>
                </div>
              </ActionForm>
            </div>
          ) : (
            <div>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted" />
                <input value={custQ} onChange={(e) => setCustQ(e.target.value)} placeholder="Search by name, phone or Customer ID…" className="input pl-10" aria-label="Search customers" autoFocus={!initialGown} />
              </div>
              {visibleCustHits.length ? (
                <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
                  {visibleCustHits.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => setCustomer(c)} className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-champagne-50">
                        <span><span className="font-medium">{c.fullName}</span> <span className="text-[13px] text-muted">· {c.phone}</span></span>
                        <span className="text-[12px] text-gold-600">{code("C", c.number)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : custQ.trim().length >= 2 ? (
                <p className="mt-2 px-1 text-sm text-muted">No matching customers.</p>
              ) : null}
              <button type="button" className={buttonClass("secondary", "sm", "mt-3")} onClick={() => setAddingCustomer(true)}>
                <UserPlus className="h-4 w-4" /> New customer
              </button>
            </div>
          )}
        </section>

        {/* Step 2: dates + gowns */}
        <section className="card p-5 sm:p-6">
          <StepTitle n={2} title="Dates & gowns" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="pickup">Requested pickup date</label>
              <input id="pickup" type="date" value={pickup} min={addDays(today, -365)} onChange={(e) => { const p = e.target.value; const r = !ret || ret < p ? addDays(p, defaults.rentalDays) : ret; setPickup(p); setRet(r); applySharedDates(p, r); }} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="ret">Expected return date</label>
              <input id="ret" type="date" value={ret} min={pickup || undefined} onChange={(e) => { setRet(e.target.value); applySharedDates(pickup, e.target.value); }} className="input" />
            </div>
          </div>
          <div className="relative mt-5">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted" />
            <input value={gownQ} onChange={(e) => setGownQ(e.target.value)} placeholder="Find gowns by ID, description, size, color, style…" className="input pl-10" aria-label="Search gowns" />
            {searching ? <Loader2 className="absolute top-1/2 right-3.5 h-4 w-4 -translate-y-1/2 animate-spin text-muted" /> : null}
          </div>
          {!pickup || !ret ? <p className="mt-2 flex items-center gap-1.5 text-[13px] text-muted"><Info className="h-3.5 w-3.5" /> Choose dates to see which gowns are available.</p> : null}
          <div className="mt-4 grid max-h-[28rem] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">
            {gownHits.map((g) => {
              const chosen = selectedIds.has(g.id);
              const av = g.availability;
              return (
                <button
                  key={g.id}
                  type="button"
                  disabled={chosen}
                  onClick={() => setItems((xs) => [...xs, { gown: g, pickupDate: pickup, returnDate: ret, rentalFee: defaults.rentalFee }])}
                  className={cx("group overflow-hidden rounded-2xl border bg-white text-left transition", chosen ? "border-blush-300 opacity-60" : "border-line hover:border-gold-300 hover:shadow-soft")}
                  data-testid={`gown-hit-${g.number}`}
                >
                  <div className="relative aspect-[4/5] bg-gradient-to-b from-champagne-50 to-blush-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {g.photoUrl ? <img src={g.photoUrl} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-blush-300"><GownSilhouette className="h-1/2 w-1/2" /></div>}
                    {av ? (
                      <span className={cx("absolute top-2 left-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", av.available ? (av.warnings.length ? "bg-champagne-100 text-[#86672c]" : "bg-[#ebf4ee] text-[#3d6a4c]") : "bg-[#fde4e4] text-[#a2353a]")}>
                        {av.available ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        {av.available ? (av.warnings.length ? "Available*" : "Available") : "Not available"}
                      </span>
                    ) : null}
                    {chosen ? <span className="absolute inset-0 grid place-items-center bg-white/50 text-sm font-medium text-blush-700">Added</span> : null}
                  </div>
                  <div className="p-2.5">
                    <p className="text-[11px] tracking-[0.14em] text-gold-600">{code("G", g.number)}</p>
                    <p className="truncate text-[13.5px] font-medium">{g.description}</p>
                    <p className="text-[12px] text-muted">Size {g.size} · {g.color}</p>
                  </div>
                </button>
              );
            })}
            {!searching && gownHits.length === 0 ? <p className="col-span-full py-6 text-center text-sm text-muted">No gowns found.</p> : null}
          </div>
        </section>
      </div>

      {/* Summary */}
      <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
        <section className="card p-5 sm:p-6">
          <StepTitle n={3} title="Review" />
          {items.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-muted">Selected gowns will appear here.</p>
          ) : (
            <ul className="space-y-3">
              {items.map((i, idx) => (
                <li key={i.gown.id} className={cx("rounded-2xl border p-3.5", i.check && !i.check.available ? "border-red-200 bg-red-50/40" : "border-line bg-white")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] tracking-[0.14em] text-gold-600">{code("G", i.gown.number)}</p>
                      <p className="truncate font-medium">{i.gown.description}</p>
                      <div className="mt-1"><GownStatusBadge status={i.gown.status} /></div>
                    </div>
                    <button type="button" onClick={() => setItems((xs) => xs.filter((_, j) => j !== idx))} className="rounded-full p-1 text-muted hover:bg-blush-50 hover:text-blush-700" aria-label="Remove gown"><X className="h-4 w-4" /></button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <label className="text-[11px] tracking-wide text-muted uppercase">Pickup
                      <input type="date" value={i.pickupDate} onChange={(e) => setItems((xs) => xs.map((x, j) => (j === idx ? { ...x, pickupDate: e.target.value } : x)))} className="input mt-1 py-1.5 text-sm" />
                    </label>
                    <label className="text-[11px] tracking-wide text-muted uppercase">Return
                      <input type="date" value={i.returnDate} onChange={(e) => setItems((xs) => xs.map((x, j) => (j === idx ? { ...x, returnDate: e.target.value } : x)))} className="input mt-1 py-1.5 text-sm" />
                    </label>
                    <label className="col-span-2 text-[11px] tracking-wide text-muted uppercase">Rental fee ($)
                      <input inputMode="decimal" value={i.rentalFee} onChange={(e) => setItems((xs) => xs.map((x, j) => (j === idx ? { ...x, rentalFee: e.target.value } : x)))} className="input mt-1 py-1.5 text-sm" />
                    </label>
                  </div>
                  {i.check ? (
                    i.check.available ? (
                      <>
                        <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-[#3d6a4c]"><Check className="h-3.5 w-3.5" /> Available for these dates</p>
                        {i.check.warnings.map((w) => <p key={w} className="mt-1 flex items-start gap-1.5 text-[12px] text-[#86672c]"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}</p>)}
                      </>
                    ) : (
                      i.check.conflicts.map((c) => <p key={c} className="mt-2 flex items-start gap-1.5 text-[12.5px] text-red-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {c}</p>)
                    )
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 grid grid-cols-2 gap-3">
            <label className="text-[13px] font-medium text-ink-soft">Security deposit ($)
              <input inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} className="input mt-1.5" />
            </label>
            <label className="text-[13px] font-medium text-ink-soft">Request date
              <input type="date" value={requestDate} onChange={(e) => setRequestDate(e.target.value)} className="input mt-1.5" />
            </label>
            <label className="col-span-2 text-[13px] font-medium text-ink-soft">Notes
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input mt-1.5" placeholder="Simcha date, special requests…" />
            </label>
          </div>

          <div className="mt-5 flex items-center justify-between rounded-2xl bg-champagne-50 px-4 py-3">
            <span className="text-sm text-ink-soft">Rental total</span>
            <span className="font-display text-2xl font-semibold">${totalFee.toFixed(2)}</span>
          </div>
          {error ? <p className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/70 px-3.5 py-2.5 text-sm text-red-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p> : null}
          <button type="button" onClick={submit} disabled={saving || hasConflict} className={buttonClass("primary", "lg", "mt-4 w-full")}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {saving ? "Creating…" : "Create pending reservation"}
          </button>
          <p className="mt-2 text-center text-[12px] text-muted">{hasConflict ? "Remove or re-date the unavailable gown to continue." : "Step 1 of 2 — you'll confirm it on the next screen."}</p>
        </section>
      </div>
    </div>
  );
}

function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="grid h-7 w-7 place-items-center rounded-full bg-blush-100 font-display text-base font-semibold text-blush-700">{n}</span>
      <h2 className="font-display text-2xl font-semibold">{title}</h2>
    </div>
  );
}
