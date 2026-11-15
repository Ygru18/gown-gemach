import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarPlus, Pencil, Archive, ArchiveRestore, Trash2, CircleSlash, Ban, History } from "lucide-react";
import { requireStaffPage } from "@/lib/auth/session";
import { getGownDetail } from "@/lib/services/gowns";
import { getSettings } from "@/lib/services/settings";
import { signedUrls } from "@/lib/storage";
import { formatDate, formatDateTime, fromDbDate, todayYmd } from "@/lib/dates";
import { CONDITION_LABEL, GOWN_STATUS_LABEL, INSPECTION_OUTCOME_LABEL, customerCode, donorCode, gownCode, reservationCode, formatPhone } from "@/lib/format";
import { centsToInput, formatCents } from "@/lib/money";
import { can } from "@/lib/permissions";
import { Card, CardHeader, EmptyState, KeyValue, LinkButton, PageHeader } from "@/components/ui";
import { GownStatusBadge, ItemStatusBadge, WorkStatusBadge } from "@/components/status";
import { GownGallery, DamagePhotos } from "@/components/GownGallery";
import { InspectionButton, NewWorkButton, UpdateWorkButton } from "@/components/CareForms";
import { ModalAction, ActionButton } from "@/components/forms";
import {
  archiveGownAction,
  createAlterationAction,
  createCleaningAction,
  deleteGownAction,
  deletePhotoAction,
  disposeGownAction,
  markUnavailableAction,
  preparePhotoUploadsAction,
  recordInspectionAction,
  registerPhotosAction,
  restoreGownAction,
  setPrimaryPhotoAction,
  updateWorkAction,
} from "@/app/actions/gowns";
import { isItemOverdue, TERMINAL_STATES } from "@/lib/gownStatus";

export const metadata = { title: "Gown" };

export default async function GownPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  const staff = await requireStaffPage();
  const { id } = await params;
  const { new: isNew } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const g = await getGownDetail(id);
  if (!g) notFound();
  const settings = await getSettings();
  const today = todayYmd(settings.timezone);
  const urls = await signedUrls(g.photos.flatMap((p) => [p.storagePath, p.thumbPath ?? ""]));
  const photos = g.photos.map((p) => ({ id: p.id, url: urls.get(p.storagePath) ?? null, thumbUrl: urls.get(p.thumbPath ?? p.storagePath) ?? null, isPrimary: p.isPrimary, kind: p.kind, returnId: p.returnId }));
  const terminal = TERMINAL_STATES.includes(g.status);
  const isAdmin = can(staff, "gown.delete");
  const hasHistory = g.reservationItems.length > 0 || g.inspections.length > 0 || g.cleanings.length > 0 || g.alterations.length > 0;
  const activeItems = g.reservationItems.filter((i) => ["PENDING", "CONFIRMED", "CHECKED_OUT"].includes(i.status));

  // Condition history: intake, pickups, returns, inspections.
  type CondRow = { date: string; at: Date; event: string; condition: string | null; notes: string | null; href?: string };
  const cond: CondRow[] = [];
  cond.push({ date: fromDbDate(g.intakeDate), at: g.createdAt, event: "Intake", condition: g.intakeCondition, notes: null });
  for (const it of g.reservationItems) {
    if (it.pickup) cond.push({ date: fromDbDate(it.pickup.pickupDate), at: it.pickup.createdAt, event: `Pickup · ${reservationCode(it.reservation.number)}`, condition: it.pickup.condition, notes: it.pickup.notes, href: `/reservations/${it.reservationId}` });
    if (it.gownReturn) cond.push({ date: fromDbDate(it.gownReturn.returnDate), at: it.gownReturn.createdAt, event: `Return · ${reservationCode(it.reservation.number)}${it.gownReturn.hasDamage ? " · damage reported" : ""}`, condition: it.gownReturn.condition, notes: [it.gownReturn.damageNotes, it.gownReturn.notes].filter(Boolean).join(" — ") || null, href: `/reservations/${it.reservationId}` });
  }
  for (const ins of g.inspections) cond.push({ date: fromDbDate(ins.inspectionDate), at: ins.createdAt, event: `Inspection · ${INSPECTION_OUTCOME_LABEL[ins.outcome]}`, condition: ins.condition, notes: ins.notes });
  cond.sort((a, b) => (b.date === a.date ? b.at.getTime() - a.at.getTime() : b.date.localeCompare(a.date)));

  const damageByReturn = new Map<string, typeof photos>();
  for (const p of photos.filter((x) => x.kind === "DAMAGE")) {
    const list = damageByReturn.get(p.returnId ?? "") ?? [];
    list.push(p);
    damageByReturn.set(p.returnId ?? "", list);
  }

  return (
    <div>
      <div className="mb-3 text-sm">
        <Link href="/inventory" className="text-muted hover:text-blush-700">← Inventory</Link>
      </div>
      <PageHeader
        eyebrow={gownCode(g.number)}
        title={g.description}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <GownStatusBadge status={g.status} />
            {g.statusReason ? <span className="text-sm text-muted">{g.statusReason}</span> : null}
          </span>
        }
        actions={
          <>
            {!terminal ? (
              <LinkButton href={`/reservations/new?gownId=${g.id}`}>
                <CalendarPlus className="h-4 w-4" /> Reserve this gown
              </LinkButton>
            ) : null}
            <LinkButton href={`/inventory/${g.id}/edit`} variant="secondary">
              <Pencil className="h-4 w-4" /> Edit
            </LinkButton>
          </>
        }
      />

      {isNew ? (
        <div className="mb-6 rounded-2xl border border-[#cfe5d6] bg-[#ebf4ee] px-5 py-4 text-[15px] text-[#2f5a3e]">
          <b className="font-medium">{gownCode(g.number)}</b> is now in the inventory and available to reserve.
          <span className="ml-2">
            <Link href="/intake" className="font-medium underline underline-offset-2">Add another gown</Link>
          </span>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-6">
          <GownGallery
            gownId={g.id}
            photos={photos}
            canEdit={g.status !== "DISPOSED"}
            prepareUploads={preparePhotoUploadsAction}
            registerPhotos={registerPhotosAction}
            setPrimary={setPrimaryPhotoAction}
            removePhoto={deletePhotoAction}
            startWithUploader={Boolean(isNew)}
          />

          <Card className="p-5">
            <h3 className="font-display text-lg font-semibold">Gown care & status</h3>
            <p className="mb-4 text-[13px] text-muted">Since {formatDateTime(g.statusChangedAt, settings.timezone)}</p>
            <div className="flex flex-wrap gap-2">
              {!terminal && g.status !== "CHECKED_OUT" ? <InspectionButton gownId={g.id} today={today} action={recordInspectionAction} variant={g.status === "PENDING_INSPECTION" ? "primary" : "secondary"} label={g.status === "PENDING_INSPECTION" ? "Inspect now" : g.status === "UNAVAILABLE_OTHER" ? "Inspect / mark ready" : "Record inspection"} /> : null}
              {g.status !== "DISPOSED" ? <NewWorkButton kind="cleaning" gownId={g.id} today={today} action={createCleaningAction} /> : null}
              {g.status !== "DISPOSED" ? <NewWorkButton kind="alteration" gownId={g.id} today={today} action={createAlterationAction} /> : null}
              {!terminal && g.status !== "CHECKED_OUT" && g.status !== "UNAVAILABLE_OTHER" ? (
                <ModalAction label="Mark unavailable" icon={<CircleSlash className="h-4 w-4" />} title="Mark gown unavailable" subtitle="It stays in inventory but cannot be picked up until marked ready." action={markUnavailableAction.bind(null, g.id)} submitLabel="Mark unavailable" size="md">
                  <div>
                    <label className="label" htmlFor="reason">Reason</label>
                    <input id="reason" name="reason" className="input" placeholder="e.g. lent to a photoshoot, missing button" />
                  </div>
                </ModalAction>
              ) : null}
            </div>
            <div className="mt-5 border-t border-line pt-4">
              <p className="mb-2.5 text-[11px] tracking-[0.14em] text-muted uppercase">Remove from inventory</p>
              <div className="flex flex-wrap gap-2">
                {g.status === "ARCHIVED" ? (
                  <ActionButton action={restoreGownAction.bind(null, g.id)} label="Restore to inventory" icon={<ArchiveRestore className="h-4 w-4" />} confirm={{ title: "Restore this gown?", body: "It returns to inventory as Pending Inspection." }} />
                ) : g.status !== "DISPOSED" ? (
                  <ModalAction label="Archive" icon={<Archive className="h-4 w-4" />} title="Archive this gown" subtitle="Removes it from active inventory. All history is kept, and it can be restored later." action={archiveGownAction.bind(null, g.id)} submitLabel="Archive gown" disabled={activeItems.length > 0}>
                    <div>
                      <label className="label" htmlFor="reason">Reason <span className="ml-1 text-[11px] font-normal text-muted/80">optional</span></label>
                      <input id="reason" name="reason" className="input" />
                    </div>
                  </ModalAction>
                ) : null}
                {g.status !== "DISPOSED" ? (
                  <ModalAction
                    label="Dispose"
                    icon={<Ban className="h-4 w-4" />}
                    title="Dispose of this gown"
                    subtitle="Marks it permanently disposed. It can never be reserved again; its full history is preserved."
                    action={disposeGownAction.bind(null, g.id)}
                    submitLabel="Dispose permanently"
                    submitVariant="danger"
                    disabled={activeItems.length > 0}
                    confirm={{ title: "Dispose permanently?", body: `${gownCode(g.number)} will be marked disposed and can no longer be reserved. This cannot be undone.`, confirmLabel: "Yes, dispose", danger: true }}
                  >
                    <div>
                      <label className="label" htmlFor="disposedDate">Disposal date</label>
                      <input id="disposedDate" name="disposedDate" type="date" defaultValue={today} required className="input" />
                    </div>
                    <div>
                      <label className="label" htmlFor="disposalReason">Reason <span className="ml-1 text-[11px] font-normal text-muted/80">optional</span></label>
                      <input id="disposalReason" name="disposalReason" className="input" placeholder="e.g. beyond repair, donated onward" />
                    </div>
                    <div>
                      <label className="label" htmlFor="disposalNotes">Notes <span className="ml-1 text-[11px] font-normal text-muted/80">optional</span></label>
                      <textarea id="disposalNotes" name="disposalNotes" rows={2} className="input" />
                    </div>
                  </ModalAction>
                ) : null}
                {isAdmin && !hasHistory ? (
                  <ActionButton
                    action={deleteGownAction.bind(null, g.id)}
                    label="Delete permanently"
                    variant="danger"
                    icon={<Trash2 className="h-4 w-4" />}
                    confirm={{ title: "Permanently delete this gown?", body: "This erases the record and its photos for good. Use only for gowns entered by mistake — otherwise archive instead.", confirmLabel: "Delete forever", danger: true }}
                  />
                ) : null}
              </div>
              {activeItems.length > 0 ? <p className="mt-2 text-[12px] text-muted">Archive and dispose are available once this gown has no active reservations.</p> : null}
              {g.status === "ARCHIVED" && g.archiveReason ? <p className="mt-2 text-[13px] text-muted">Archived {formatDateTime(g.archivedAt, settings.timezone)}: {g.archiveReason}</p> : null}
              {g.status === "DISPOSED" ? (
                <p className="mt-2 text-[13px] text-muted">
                  Disposed {formatDate(g.disposedDate)}{g.disposalReason ? ` — ${g.disposalReason}` : ""}{g.disposalNotes ? `. ${g.disposalNotes}` : ""}
                </p>
              ) : null}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
              <KeyValue label="Gown ID">{gownCode(g.number)}</KeyValue>
              <KeyValue label="Style">{g.style}</KeyValue>
              <KeyValue label="Size">{g.size}</KeyValue>
              <KeyValue label="Color">{g.color}</KeyValue>
              <KeyValue label="Designer">{g.designer}</KeyValue>
              <KeyValue label="Date entered">{formatDate(g.intakeDate)}</KeyValue>
              <KeyValue label="Condition at intake">{g.intakeCondition ? CONDITION_LABEL[g.intakeCondition] : null}</KeyValue>
              <KeyValue label="Current condition">{g.currentCondition ? CONDITION_LABEL[g.currentCondition] : null}</KeyValue>
              <KeyValue label="Status">{GOWN_STATUS_LABEL[g.status]}</KeyValue>
            </dl>
            <div className="my-5 ornament" />
            <p className="mb-3 text-[11px] tracking-[0.14em] text-muted uppercase">Measurements</p>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              <KeyValue label="Bust">{g.bust}</KeyValue>
              <KeyValue label="Waist">{g.waist}</KeyValue>
              <KeyValue label="Hips">{g.hips}</KeyValue>
              <KeyValue label="Length">{g.length}</KeyValue>
            </dl>
            {g.otherMeasurements ? <p className="mt-3 text-sm text-ink-soft">{g.otherMeasurements}</p> : null}
            <div className="my-5 ornament" />
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-[11px] tracking-[0.14em] text-muted uppercase">Donor</p>
                {g.donor ? (
                  <div className="text-sm">
                    <Link href={`/donors/${g.donor.id}`} className="font-medium text-ink hover:text-blush-700">{g.donor.name}</Link>
                    <span className="ml-2 text-[12px] text-muted">{donorCode(g.donor.number)}</span>
                    {g.donor.phone ? <p className="text-ink-soft">{formatPhone(g.donor.phone)}</p> : null}
                    {g.donor.email ? <p className="text-ink-soft">{g.donor.email}</p> : null}
                    {g.donor.address ? <p className="text-ink-soft">{g.donor.address}</p> : null}
                  </div>
                ) : (
                  <p className="text-sm text-muted">No donor recorded</p>
                )}
              </div>
              <div>
                <p className="mb-2 text-[11px] tracking-[0.14em] text-muted uppercase">Notes</p>
                <p className="text-sm whitespace-pre-line text-ink-soft">{g.notes ?? "—"}</p>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Reservation history" subtitle={`${g.reservationItems.length} reservation${g.reservationItems.length === 1 ? "" : "s"}`} />
            {g.reservationItems.length === 0 ? (
              <EmptyState title="Not reserved yet" action={!terminal ? <LinkButton href={`/reservations/new?gownId=${g.id}`} size="sm">Reserve this gown</LinkButton> : undefined} />
            ) : (
              <div className="overflow-x-auto">
                <table className="table-elegant">
                  <thead><tr><th>Reservation</th><th>Customer</th><th>Dates</th><th>Fee</th><th>Status</th></tr></thead>
                  <tbody>
                    {g.reservationItems.map((it) => {
                      const overdue = isItemOverdue({ status: it.status, expectedReturnDate: fromDbDate(it.expectedReturnDate) }, today);
                      return (
                        <tr key={it.id}>
                          <td><Link href={`/reservations/${it.reservationId}`} className="font-medium text-gold-600 hover:underline">{reservationCode(it.reservation.number)}</Link></td>
                          <td><Link href={`/customers/${it.reservation.customer.id}`} className="hover:text-blush-700">{it.reservation.customer.fullName}</Link><span className="ml-1.5 text-[11px] text-muted">{customerCode(it.reservation.customer.number)}</span></td>
                          <td className="whitespace-nowrap text-ink-soft">
                            {formatDate(it.actualPickupDate ?? it.confirmedPickupDate ?? it.requestedPickupDate, "short")} – {formatDate(it.actualReturnDate ?? it.expectedReturnDate, "short")}
                          </td>
                          <td>{formatCents(it.rentalFeeCents)}</td>
                          <td><ItemStatusBadge status={overdue ? "OVERDUE" : it.status} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Condition history" subtitle="Intake, pickups, returns and inspections" />
            <ul className="divide-y divide-line">
              {cond.map((c, i) => (
                <li key={i} className="flex gap-4 px-5 py-3 sm:px-6">
                  <span className="w-24 shrink-0 text-[13px] text-muted">{formatDate(c.date)}</span>
                  <div className="min-w-0 flex-1 text-sm">
                    {c.href ? <Link href={c.href} className="font-medium hover:text-blush-700">{c.event}</Link> : <span className="font-medium">{c.event}</span>}
                    {c.condition ? <span className="ml-2 text-ink-soft">· {CONDITION_LABEL[c.condition as keyof typeof CONDITION_LABEL]}</span> : null}
                    {c.notes ? <p className="text-[13px] text-muted">{c.notes}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
            {g.reservationItems.some((it) => it.gownReturn?.hasDamage) ? (
              <div className="border-t border-line px-5 py-4 sm:px-6">
                <p className="mb-1 text-[11px] tracking-[0.14em] text-muted uppercase">Damage photos</p>
                {g.reservationItems.filter((it) => it.gownReturn).map((it) => {
                  const ps = damageByReturn.get(it.gownReturn!.id) ?? [];
                  return ps.length ? (
                    <div key={it.id} className="mb-2">
                      <p className="text-[13px] text-ink-soft">{reservationCode(it.reservation.number)} · {formatDate(it.gownReturn!.returnDate)}</p>
                      <DamagePhotos photos={ps} />
                    </div>
                  ) : null;
                })}
              </div>
            ) : null}
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            {(["cleaning", "alteration"] as const).map((kind) => {
              const rows = kind === "cleaning" ? g.cleanings : g.alterations;
              return (
                <Card key={kind}>
                  <CardHeader title={kind === "cleaning" ? "Cleaning history" : "Alteration history"} />
                  {rows.length === 0 ? (
                    <p className="px-6 py-5 text-sm text-muted">None recorded.</p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {rows.map((r) => {
                        const text = "reason" in r ? r.reason : (r as { description: string }).description;
                        return (
                          <li key={r.id} className="px-5 py-3.5">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 text-sm">
                                <p className="font-medium">{text ?? (kind === "cleaning" ? "Cleaning" : "Alteration")}</p>
                                <p className="text-[12.5px] text-muted">
                                  Identified {formatDate(r.identifiedDate)}
                                  {r.assignedTo ? ` · ${r.assignedTo}` : ""}
                                  {r.completedDate ? ` · done ${formatDate(r.completedDate)}` : ""}
                                  {r.costCents != null ? ` · ${formatCents(r.costCents)}` : ""}
                                </p>
                                {r.notes ? <p className="text-[12.5px] text-ink-soft">{r.notes}</p> : null}
                              </div>
                              <div className="flex shrink-0 flex-col items-end gap-2">
                                <WorkStatusBadge status={r.status} />
                                <UpdateWorkButton kind={kind} record={{ status: r.status, assignedTo: r.assignedTo, costInput: centsToInput(r.costCents), notes: r.notes, text: text ?? null }} today={today} action={updateWorkAction.bind(null, kind, r.id)} />
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader title="Status history" icon={<History className="h-[18px] w-[18px]" />} />
            <ul className="divide-y divide-line">
              {g.statusHistory.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-sm sm:px-6">
                  <span className="w-40 shrink-0 text-[12.5px] text-muted">{formatDateTime(h.changedAt, settings.timezone)}</span>
                  <GownStatusBadge status={h.toStatus} />
                  {h.reason ? <span className="text-[13px] text-ink-soft">{h.reason}</span> : null}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
