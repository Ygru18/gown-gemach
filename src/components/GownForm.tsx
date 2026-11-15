"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import type { ActionResult } from "@/lib/actionTypes";
import { CONDITION_LABEL } from "@/lib/format";
import { buttonClass, Field } from "./ui";
import { useToast } from "./forms";
import { PhotoPicker } from "./PhotoPicker";
import { uploadPhotos, type PrepareFn } from "./photoUpload";

export interface GownFormValues {
  intakeDate: string;
  description: string;
  style: string;
  size: string;
  color: string;
  designer: string;
  intakeCondition: string;
  currentCondition?: string;
  bust: string;
  waist: string;
  hips: string;
  length: string;
  otherMeasurements: string;
  notes: string;
  donorId?: string | null;
}

export function GownForm({
  mode,
  initial,
  donors,
  suggestions,
  action,
  prepareUploads,
  registerPhotos,
  cancelHref,
}: {
  mode: "create" | "edit";
  initial: GownFormValues;
  donors: { id: string; name: string; phone: string | null }[];
  suggestions: { styles: string[]; colors: string[]; sizes: string[] };
  action: (fd: FormData) => Promise<ActionResult>;
  prepareUploads?: PrepareFn;
  registerPhotos?: (gownId: string, refs: { full: string; thumb: string | null }[]) => Promise<ActionResult>;
  cancelHref: string;
}) {
  const [donorMode, setDonorMode] = useState<string>(mode === "edit" ? "keep" : "none");
  const [files, setFiles] = useState<File[]>([]);
  const [pending, start] = useTransition();
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const router = useRouter();
  const toast = useToast();
  const fe = (result && !result.ok && result.fieldErrors) || {};

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      setProgress(null);
      const res = await action(fd).catch(() => ({ ok: false, error: "Could not reach the server." }) as ActionResult);
      setResult(res);
      if (!res.ok) {
        toast("error", res.error ?? "Please check the form.");
        return;
      }
      const gownId = (res.data as { id?: string } | undefined)?.id;
      if (gownId && files.length && prepareUploads && registerPhotos) {
        try {
          setProgress(`Uploading photos 0 of ${files.length}…`);
          const refs = await uploadPhotos(gownId, files, prepareUploads, (d, t) => setProgress(`Uploading photos ${d} of ${t}…`));
          const reg = await registerPhotos(gownId, refs);
          if (!reg.ok) toast("error", reg.error ?? "Photos could not be saved.");
        } catch (err) {
          toast("error", `The gown was saved, but photos could not be uploaded: ${(err as Error).message} You can add them on the gown's page.`);
        }
      }
      if (res.redirect) router.push(res.redirect);
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {result && !result.ok && result.error ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/70 px-4 py-3 text-sm text-red-800" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {result.error}
        </div>
      ) : null}

      <section className="card p-5 sm:p-7">
        <h2 className="font-display text-2xl font-semibold">The gown</h2>
        <p className="mb-5 text-sm text-muted">A Gown ID is assigned automatically when you save.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Date entered" name="intakeDate" required error={fe.intakeDate}>
            <input id="intakeDate" name="intakeDate" type="date" required defaultValue={initial.intakeDate} className="input" />
          </Field>
          <Field label="Description" name="description" required error={fe.description} className="sm:col-span-2 lg:col-span-3">
            <input id="description" name="description" required defaultValue={initial.description} placeholder="e.g. Ivory lace A-line with long sleeves" className="input" maxLength={500} />
          </Field>
          <Field label="Style" name="style" required error={fe.style}>
            <input id="style" name="style" list="style-options" required defaultValue={initial.style} placeholder="A-line, Mermaid, Ball gown…" className="input" />
          </Field>
          <Field label="Size" name="size" required error={fe.size}>
            <input id="size" name="size" list="size-options" required defaultValue={initial.size} placeholder="e.g. 8" className="input" />
          </Field>
          <Field label="Color" name="color" required error={fe.color}>
            <input id="color" name="color" list="color-options" required defaultValue={initial.color} placeholder="Ivory, Blush, Navy…" className="input" />
          </Field>
          <Field label="Designer or brand" name="designer" error={fe.designer}>
            <input id="designer" name="designer" defaultValue={initial.designer} className="input" />
          </Field>
          <Field label="Condition upon intake" name="intakeCondition">
            <select id="intakeCondition" name="intakeCondition" defaultValue={initial.intakeCondition} className="input">
              <option value="">—</option>
              {Object.entries(CONDITION_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>
          {mode === "edit" ? (
            <Field label="Current condition" name="currentCondition">
              <select id="currentCondition" name="currentCondition" defaultValue={initial.currentCondition ?? ""} className="input">
                <option value="">—</option>
                {Object.entries(CONDITION_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </Field>
          ) : null}
        </div>
        <datalist id="style-options">{suggestions.styles.map((s) => <option key={s} value={s} />)}</datalist>
        <datalist id="size-options">{suggestions.sizes.map((s) => <option key={s} value={s} />)}</datalist>
        <datalist id="color-options">{suggestions.colors.map((s) => <option key={s} value={s} />)}</datalist>
      </section>

      <section className="card p-5 sm:p-7">
        <h2 className="font-display text-2xl font-semibold">Measurements</h2>
        <p className="mb-5 text-sm text-muted">All optional — include units (e.g. 34 in).</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(["bust", "waist", "hips", "length"] as const).map((k) => (
            <Field key={k} label={k[0]!.toUpperCase() + k.slice(1)} name={k}>
              <input id={k} name={k} defaultValue={initial[k]} className="input" />
            </Field>
          ))}
          <Field label="Other measurements" name="otherMeasurements" className="sm:col-span-2 lg:col-span-4">
            <input id="otherMeasurements" name="otherMeasurements" defaultValue={initial.otherMeasurements} placeholder="Sleeve, train, shoulder…" className="input" />
          </Field>
        </div>
      </section>

      <section className="card p-5 sm:p-7">
        <h2 className="font-display text-2xl font-semibold">Donor</h2>
        <p className="mb-4 text-sm text-muted">Donor information is entirely optional.</p>
        <div className="mb-4 flex flex-wrap gap-2" role="radiogroup">
          {[
            ...(mode === "edit" ? [["keep", "Keep current donor"]] : []),
            ["none", "No donor information"],
            ["existing", "Existing donor"],
            ["new", "New donor"],
          ].map(([value, label]) => (
            <label key={value} className={`cursor-pointer rounded-full border px-4 py-2 text-sm transition ${donorMode === value ? "border-blush-300 bg-blush-50 text-blush-700" : "border-line-strong bg-white text-ink-soft hover:border-gold-300"}`}>
              <input type="radio" name="donorMode" value={value} checked={donorMode === value} onChange={() => setDonorMode(value!)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
        {donorMode === "existing" ? (
          <Field label="Choose donor" name="donorId" required error={fe.donorId}>
            <select id="donorId" name="donorId" className="input" defaultValue={initial.donorId ?? ""} required>
              <option value="">Select a donor…</option>
              {donors.map((d) => (
                <option key={d.id} value={d.id}>{d.name}{d.phone ? ` · ${d.phone}` : ""}</option>
              ))}
            </select>
          </Field>
        ) : null}
        {donorMode === "new" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Donor name" name="donorName" required error={fe.donorName}>
              <input id="donorName" name="donorName" className="input" required />
            </Field>
            <Field label="Donor phone" name="donorPhone">
              <input id="donorPhone" name="donorPhone" type="tel" className="input" />
            </Field>
            <Field label="Donor email" name="donorEmail" error={fe.donorEmail}>
              <input id="donorEmail" name="donorEmail" type="email" className="input" />
            </Field>
            <Field label="Donor address" name="donorAddress">
              <input id="donorAddress" name="donorAddress" className="input" />
            </Field>
          </div>
        ) : null}
      </section>

      {mode === "create" ? (
        <section className="card p-5 sm:p-7">
          <h2 className="font-display text-2xl font-semibold">Photographs</h2>
          <p className="mb-5 text-sm text-muted">Add as many as you like. The first becomes the main photo — you can change it later.</p>
          <PhotoPicker files={files} onChange={setFiles} />
        </section>
      ) : null}

      <section className="card p-5 sm:p-7">
        <Field label="Additional notes" name="notes">
          <textarea id="notes" name="notes" rows={3} defaultValue={initial.notes} className="input" />
        </Field>
      </section>

      <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-3 border-t border-line bg-page/95 px-4 py-4 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
        {progress ? <span className="mr-auto text-sm text-muted">{progress}</span> : null}
        <a href={cancelHref} className={buttonClass("secondary")}>Cancel</a>
        <button type="submit" disabled={pending} className={buttonClass("primary", "lg")}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {pending ? "Saving…" : mode === "create" ? "Save gown" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
