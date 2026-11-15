"use client";

import { useState } from "react";
import { ClipboardCheck, Droplets, Scissors } from "lucide-react";
import type { ActionResult } from "@/lib/actionTypes";
import { CONDITION_LABEL, INSPECTION_OUTCOME_LABEL } from "@/lib/format";
import { ModalAction, FieldError } from "./forms";
import { cx } from "./ui";

function ConditionSelect({ name = "condition", label = "Condition" }: { name?: string; label?: string }) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label} <span className="ml-1 text-[11px] font-normal text-muted/80">optional</span></label>
      <select id={name} name={name} className="input" defaultValue="">
        <option value="">—</option>
        {Object.entries(CONDITION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </div>
  );
}

export function InspectionButton({ gownId, today, action, variant = "primary", label = "Record inspection" }: { gownId: string; today: string; action: (fd: FormData) => Promise<ActionResult>; variant?: "primary" | "secondary" | "gold"; label?: string }) {
  const [outcome, setOutcome] = useState("READY");
  return (
    <ModalAction label={label} icon={<ClipboardCheck className="h-4 w-4" />} title="Inspection" subtitle="Only a 'Ready' decision returns the gown to Available." action={action} submitLabel="Save inspection" variant={variant}>
      <input type="hidden" name="gownId" value={gownId} />
      <div>
        <label className="label" htmlFor="inspectionDate">Inspection date</label>
        <input id="inspectionDate" name="inspectionDate" type="date" defaultValue={today} required className="input" />
      </div>
      <fieldset>
        <legend className="label">Result</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(INSPECTION_OUTCOME_LABEL).map(([k, v]) => (
            <label key={k} className={cx("flex cursor-pointer items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm transition", outcome === k ? "border-blush-300 bg-blush-50 text-blush-700" : "border-line-strong bg-white hover:border-gold-300")}>
              <input type="radio" name="outcome" value={k} checked={outcome === k} onChange={() => setOutcome(k)} className="accent-blush-600" />
              {v}
            </label>
          ))}
        </div>
      </fieldset>
      {outcome === "NEEDS_CLEANING" ? (
        <>
          <div>
            <label className="label" htmlFor="cleaningReason">What needs cleaning?</label>
            <input id="cleaningReason" name="cleaningReason" className="input" placeholder="e.g. hem soiled, makeup on neckline" />
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="alsoNeedsAlteration" className="accent-blush-600" /> Also needs alterations</label>
          <div>
            <label className="label" htmlFor="alterationDescription">Alterations (if any)</label>
            <input id="alterationDescription" name="alterationDescription" className="input" />
          </div>
        </>
      ) : null}
      {outcome === "NEEDS_ALTERATION" ? (
        <>
          <div>
            <label className="label" htmlFor="alterationDescription">Alterations needed</label>
            <textarea id="alterationDescription" name="alterationDescription" rows={2} className="input" required />
            <FieldError name="alterationDescription" />
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="alsoNeedsCleaning" className="accent-blush-600" /> Also needs cleaning</label>
        </>
      ) : null}
      {outcome === "NEEDS_CLEANING" || outcome === "NEEDS_ALTERATION" ? (
        <div>
          <label className="label" htmlFor="assignedTo">Assigned to <span className="ml-1 text-[11px] font-normal text-muted/80">optional</span></label>
          <input id="assignedTo" name="assignedTo" className="input" placeholder="Cleaner / seamstress" />
        </div>
      ) : null}
      <ConditionSelect />
      <div>
        <label className="label" htmlFor="notes">Notes {outcome === "DAMAGED" || outcome === "OTHER" ? <span className="text-blush-500">*</span> : null}</label>
        <textarea id="notes" name="notes" rows={2} className="input" required={outcome === "DAMAGED" || outcome === "OTHER"} />
        <FieldError name="notes" />
      </div>
    </ModalAction>
  );
}

export function NewWorkButton({ kind, gownId, today, action }: { kind: "cleaning" | "alteration"; gownId: string; today: string; action: (fd: FormData) => Promise<ActionResult> }) {
  return (
    <ModalAction
      label={kind === "cleaning" ? "Needs cleaning" : "Needs alteration"}
      icon={kind === "cleaning" ? <Droplets className="h-4 w-4" /> : <Scissors className="h-4 w-4" />}
      title={kind === "cleaning" ? "Record cleaning needed" : "Record alteration needed"}
      action={action}
      submitLabel="Save"
      size="sm"
    >
      <input type="hidden" name="gownId" value={gownId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="identifiedDate">Date identified</label>
          <input id="identifiedDate" name="identifiedDate" type="date" defaultValue={today} required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="assignedTo">Assigned to <span className="ml-1 text-[11px] font-normal text-muted/80">optional</span></label>
          <input id="assignedTo" name="assignedTo" className="input" />
        </div>
      </div>
      {kind === "cleaning" ? (
        <div>
          <label className="label" htmlFor="reason">Reason / notes</label>
          <input id="reason" name="reason" className="input" />
        </div>
      ) : (
        <div>
          <label className="label" htmlFor="description">Alterations needed <span className="text-blush-500">*</span></label>
          <textarea id="description" name="description" rows={2} required className="input" />
          <FieldError name="description" />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="costCents">Estimated cost <span className="ml-1 text-[11px] font-normal text-muted/80">optional</span></label>
          <input id="costCents" name="costCents" inputMode="decimal" className="input" placeholder="0.00" />
        </div>
        <div>
          <label className="label" htmlFor="notes">Notes</label>
          <input id="notes" name="notes" className="input" />
        </div>
      </div>
    </ModalAction>
  );
}

export function UpdateWorkButton({
  kind,
  record,
  today,
  action,
}: {
  kind: "cleaning" | "alteration";
  record: { status: string; assignedTo: string | null; costInput: string; notes: string | null; text: string | null };
  today: string;
  action: (fd: FormData) => Promise<ActionResult>;
}) {
  const [status, setStatus] = useState(record.status === "OPEN" || record.status === "IN_PROGRESS" ? "COMPLETED" : record.status);
  return (
    <ModalAction label="Update" title={kind === "cleaning" ? "Update cleaning" : "Update alteration"} action={action} submitLabel="Save" size="sm">
      <div>
        <label className="label" htmlFor="status">Status</label>
        <select id="status" name="status" value={status} onChange={(e) => setStatus(e.target.value)} className="input">
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled (not needed)</option>
        </select>
      </div>
      {kind === "cleaning" ? (
        <div>
          <label className="label" htmlFor="reason">Reason / notes</label>
          <input id="reason" name="reason" defaultValue={record.text ?? ""} className="input" />
        </div>
      ) : (
        <div>
          <label className="label" htmlFor="description">Alterations</label>
          <textarea id="description" name="description" defaultValue={record.text ?? ""} rows={2} className="input" />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="assignedTo">Assigned to</label>
          <input id="assignedTo" name="assignedTo" defaultValue={record.assignedTo ?? ""} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="costCents">Cost</label>
          <input id="costCents" name="costCents" defaultValue={record.costInput} inputMode="decimal" className="input" placeholder="0.00" />
        </div>
      </div>
      {status === "COMPLETED" ? (
        <div>
          <label className="label" htmlFor="completedDate">Date completed</label>
          <input id="completedDate" name="completedDate" type="date" defaultValue={today} required className="input" />
        </div>
      ) : null}
      <div>
        <label className="label" htmlFor="notes">Notes</label>
        <textarea id="notes" name="notes" defaultValue={record.notes ?? ""} rows={2} className="input" />
      </div>
      {status === "COMPLETED" || status === "CANCELLED" ? (
        <label className="flex items-start gap-2.5 rounded-xl bg-[#ebf4ee] px-3.5 py-3 text-sm text-[#2f5a3e]">
          <input type="checkbox" name="markReady" defaultChecked className="mt-0.5 accent-[#3d6a4c]" />
          <span>
            <b className="font-medium">Mark the gown ready for its next rental</b>
            <br />
            <span className="text-[12.5px]">If unticked (or other work is still open), the gown waits in Pending Inspection.</span>
          </span>
        </label>
      ) : null}
    </ModalAction>
  );
}
