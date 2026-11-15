import Link from "next/link";
import { notFound } from "next/navigation";
import { Phone, XCircle, Pencil, Wallet, ShieldCheck, History, Ban } from "lucide-react";
import { requireStaffPage } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getReservationDetail, displayReservationStatus } from "@/lib/services/reservations";
import { checkAvailability } from "@/lib/services/availability";
import { getSettings } from "@/lib/services/settings";
import { getOverdueWithUpcoming } from "@/lib/services/dashboard";
import { summarizeFinances } from "@/lib/finance";
import { signedUrls } from "@/lib/storage";
import { can } from "@/lib/permissions";
import { diffDays, formatDate, formatDateTime, fromDbDate, todayYmd } from "@/lib/dates";
import { centsToInput, formatCents } from "@/lib/money";
import { CONDITION_LABEL, DEPOSIT_KIND_LABEL, GOWN_STATUS_LABEL, PAYMENT_KIND_LABEL, PAYMENT_METHOD_LABEL, customerCode, formatPhone, gownCode, reservationCode } from "@/lib/format";
import { isItemOverdue, READY_STATES } from "@/lib/gownStatus";
import { Card, CardHeader, KeyValue, PageHeader, Pill } from "@/components/ui";
import { GownThumb, OverdueUpcomingWarning } from "@/components/bits";
import { DamagePhotos } from "@/components/GownGallery";
import { ItemStatusBadge, PaymentStatusBadge, ReservationStatusBadge, GownStatusBadge } from "@/components/status";
import { ModalAction } from "@/components/forms";
import { ConfirmReservationButton, PickupButton, ReturnButton, AddGownButton } from "@/components/ReservationPanels";
import { PrintButton } from "@/components/PrintButton";
import {
  addItemAction,
  cancelItemAction,
  cancelReservationAction,
  confirmReservationAction,
  pickupAction,
  recordDepositAction,
  recordPaymentAction,
  returnAction,
  searchGownsForReservationAction,
  updateItemAction,
  updatePaymentAction,
  updateReservationDetailsAction,
  voidDepositAction,
  voidPaymentAction,
} from "@/app/actions/reservations";
import { preparePhotoUploadsAction } from "@/app/actions/gowns";

export const metadata = { title: "Reservation" };

function MethodSelect({ defaultValue = "", required }: { defaultValue?: string; required?: boolean }) {
  return (
    <div>
      <label className="label" htmlFor="method">Method {required ? <span className="text-blush-500">*</span> : null}</label>
      <select id="method" name="method" defaultValue={defaultValue} className="input">
        <option value="">—</option>
        <option value="CASH">Cash</option>
        <option value="CHECK">Check</option>
        <option value="OTHER">Other</option>
      </select>
    </div>
  );
}

export default async function ReservationPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const r = await getReservationDetail(id);
  if (!r) notFound();
  const settings = await getSettings();
  const today = todayYmd(settings.timezone);
  const status = displayReservationStatus(r, today);
  const money = summarizeFinances({
    status: r.status,
    itemFeesCents: r.items.filter((i) => i.status !== "CANCELLED").map((i) => i.rentalFeeCents),
    depositRequiredCents: r.depositRequiredCents,
    payments: r.payments,
    deposits: r.deposits,
  });
  const warnings = await getOverdueWithUpcoming(today, r.customerId);
  const activity = await prisma.activityLog.findMany({ where: { entityType: "reservation", entityId: r.id }, orderBy: { createdAt: "desc" } });
  const photoPaths = r.items.flatMap((i) => [...i.gown.photos.map((p) => p.thumbPath ?? p.storagePath), ...(i.gownReturn?.damagePhotos.flatMap((p) => [p.storagePath, p.thumbPath ?? ""]) ?? [])]);
  const urls = await signedUrls(photoPaths);
  const pending = r.items.filter((i) => i.status === "PENDING");
  const confirmed = r.items.filter((i) => i.status === "CONFIRMED");
  const checkedOut = r.items.filter((i) => i.status === "CHECKED_OUT");
  const confirmChecks = await Promise.all(
    pending.map(async (i) => {
      const av = await checkAvailability(i.gownId, fromDbDate(i.requestedPickupDate), fromDbDate(i.expectedReturnDate), { today, excludeItemIds: [i.id] });
      return { id: i.id, gownNumber: i.gown.number, description: i.gown.description, requestedPickup: fromDbDate(i.requestedPickupDate), expectedReturn: fromDbDate(i.expectedReturnDate), conflicts: av.conflicts.map((c) => c.message), warnings: av.warnings.map((w) => w.message) };
    })
  );
  const canOverride = can(staff, "availability.override", { allowAssistantOverride: settings.allowAssistantOverride });
  const live = r.status !== "CANCELLED" && r.status !== "RETURNED";
  const firstItem = r.items.find((i) => i.status !== "CANCELLED") ?? r.items[0];

  return (
    <div>
      <div className="no-print mb-3 text-sm"><Link href="/reservations" className="text-muted hover:text-blush-700">← Reservations</Link></div>
      <PageHeader
        eyebrow={`Reservation ${reservationCode(r.number)}`}
        title={r.customer.fullName}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <ReservationStatusBadge status={status} />
            <PaymentStatusBadge status={money.paymentStatus} />
            <span className="text-sm text-muted">Requested {formatDate(r.requestDate)}{r.confirmedAt ? ` · confirmed ${formatDateTime(r.confirmedAt, settings.timezone)}` : ""}</span>
          </span>
        }
        actions={
          <>
            {pending.length ? <ConfirmReservationButton items={confirmChecks} canOverride={canOverride} action={confirmReservationAction.bind(null, r.id)} /> : null}
            {confirmed.length ? (
              <PickupButton
                items={confirmed.map((i) => ({ id: i.id, gownNumber: i.gown.number, description: i.gown.description, ready: READY_STATES.includes(i.gown.status), statusLabel: GOWN_STATUS_LABEL[i.gown.status] }))}
                today={today}
                action={pickupAction.bind(null, r.id)}
              />
            ) : null}
            <PrintButton />
          </>
        }
      />

      {warnings.length ? <div className="mb-6"><OverdueUpcomingWarning warnings={warnings} /></div> : null}

      {r.status === "PENDING" ? (
        <div className="mb-6 rounded-2xl border border-champagne-200 bg-champagne-50 px-5 py-4 text-[15px] text-[#7a5e28]">
          <b className="font-medium">Pending reservation.</b> This request is not yet a confirmed rental. Review availability and press <b className="font-medium">Confirm reservation</b>.
        </div>
      ) : null}
      {r.status === "CANCELLED" ? (
        <div className="mb-6 rounded-2xl border border-line-strong bg-beige-100 px-5 py-4 text-[15px] text-ink-soft">
          Cancelled {formatDateTime(r.cancelledAt, settings.timezone)}{r.cancellationReason ? ` — ${r.cancellationReason}` : ""}.
          {money.creditCents > 0 ? <span className="ml-1 font-medium text-[#93602a]">{formatCents(money.creditCents)} was paid and may need to be refunded.</span> : null}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Gowns"
              subtitle={`${r.items.length} gown${r.items.length === 1 ? "" : "s"} on this reservation`}
              action={live ? (
                <AddGownButton
                  defaultPickup={firstItem ? fromDbDate(firstItem.confirmedPickupDate ?? firstItem.requestedPickupDate) : today}
                  defaultReturn={firstItem ? fromDbDate(firstItem.expectedReturnDate) : today}
                  defaultFee={centsToInput(settings.defaultRentalFeeCents)}
                  search={searchGownsForReservationAction}
                  action={addItemAction.bind(null, r.id)}
                />
              ) : undefined}
            />
            <ul className="divide-y divide-line">
              {r.items.map((i) => {
                const overdue = isItemOverdue({ status: i.status, expectedReturnDate: fromDbDate(i.expectedReturnDate) }, today);
                const photo = i.gown.photos[0];
                const pickupShown = i.actualPickupDate ?? i.confirmedPickupDate ?? i.requestedPickupDate;
                const dmg = i.gownReturn?.damagePhotos.map((p) => ({ id: p.id, url: urls.get(p.storagePath) ?? null, thumbUrl: urls.get(p.thumbPath ?? p.storagePath) ?? null })) ?? [];
                return (
                  <li key={i.id} className={`p-5 sm:p-6 ${i.status === "CANCELLED" ? "opacity-60" : ""}`}>
                    <div className="flex gap-4">
                      <Link href={`/inventory/${i.gown.id}`} className="shrink-0">
                        <GownThumb url={photo ? (urls.get(photo.thumbPath ?? photo.storagePath) ?? null) : null} alt="" className="h-28 w-20 rounded-xl ring-1 ring-line" />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Link href={`/inventory/${i.gown.id}`} className="text-[12px] tracking-[0.14em] text-gold-600 hover:underline">{gownCode(i.gown.number)}</Link>
                            <p className="font-display text-xl leading-snug font-semibold">{i.gown.description}</p>
                            <p className="text-[13px] text-muted">Size {i.gown.size} · {i.gown.color}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1.5">
                            <ItemStatusBadge status={overdue ? "OVERDUE" : i.status} />
                            {i.status === "CONFIRMED" && !READY_STATES.includes(i.gown.status) ? <GownStatusBadge status={i.gown.status} /> : null}
                          </div>
                        </div>
                        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
                          <KeyValue label={i.actualPickupDate ? "Picked up" : i.confirmedPickupDate ? "Pickup (confirmed)" : "Requested pickup"}>{formatDate(pickupShown)}</KeyValue>
                          <KeyValue label="Expected return">
                            <span className={overdue ? "font-semibold text-red-700" : ""}>{formatDate(i.expectedReturnDate)}</span>
                            {overdue ? <span className="block text-[12px] text-red-700">{diffDays(fromDbDate(i.expectedReturnDate), today)} days overdue</span> : null}
                          </KeyValue>
                          <KeyValue label="Returned">{i.actualReturnDate ? formatDate(i.actualReturnDate) : "—"}</KeyValue>
                          <KeyValue label="Rental fee">{formatCents(i.rentalFeeCents)}</KeyValue>
                        </dl>
                        {i.conflictOverride ? <p className="mt-2 text-[12.5px] text-[#93602a]">Availability override: {i.overrideReason}</p> : null}
                        {i.pickup ? (
                          <p className="mt-2 text-[12.5px] text-ink-soft">Pickup: {formatDate(i.pickup.pickupDate)}{i.pickup.condition ? ` · ${CONDITION_LABEL[i.pickup.condition]}` : ""}{i.pickup.notes ? ` · ${i.pickup.notes}` : ""}</p>
                        ) : null}
                        {i.gownReturn ? (
                          <div className="mt-1 text-[12.5px] text-ink-soft">
                            Return: {formatDate(i.gownReturn.returnDate)}{i.gownReturn.condition ? ` · ${CONDITION_LABEL[i.gownReturn.condition]}` : ""}
                            {i.gownReturn.daysLate ? <Pill tone="red" className="ml-2">{i.gownReturn.daysLate}d late</Pill> : null}
                            {i.gownReturn.hasDamage ? <span className="block text-red-800">Damage: {i.gownReturn.damageNotes}</span> : null}
                            {i.gownReturn.notes ? <span className="block">{i.gownReturn.notes}</span> : null}
                            {i.gownReturn.inspection ? <span className="block text-[#3d6a4c]">Inspected {formatDate(i.gownReturn.inspection.inspectionDate)}</span> : i.gown.status === "PENDING_INSPECTION" ? <Link href={`/inventory/${i.gown.id}`} className="block font-medium text-[#93602a] hover:underline">Awaiting inspection →</Link> : null}
                            <DamagePhotos photos={dmg} />
                          </div>
                        ) : null}
                        {i.notes ? <p className="mt-1 text-[12.5px] text-muted">{i.notes}</p> : null}

                        <div className="no-print mt-3 flex flex-wrap gap-2">
                          {i.status === "CHECKED_OUT" ? (
                            <ReturnButton item={{ id: i.id, gownId: i.gownId, gownNumber: i.gown.number, description: i.gown.description, expectedReturn: formatDate(i.expectedReturnDate) }} today={today} action={returnAction.bind(null, r.id)} prepareUploads={preparePhotoUploadsAction} />
                          ) : null}
                          {i.status !== "CANCELLED" ? (
                            <ModalAction label={i.status === "CHECKED_OUT" ? "Extend / edit" : "Edit dates & fee"} icon={<Pencil className="h-3.5 w-3.5" />} size="sm" variant="ghost" title={`Edit ${gownCode(i.gown.number)}`} action={updateItemAction.bind(null, i.id, r.id)}>
                              <div className="grid gap-3 sm:grid-cols-2">
                                <label className="text-[12px] tracking-wide text-muted uppercase">Pickup date
                                  <input type="date" name="pickupDate" defaultValue={fromDbDate(i.confirmedPickupDate ?? i.requestedPickupDate)} disabled={i.status !== "PENDING" && i.status !== "CONFIRMED"} className="input mt-1" />
                                  {i.status !== "PENDING" && i.status !== "CONFIRMED" ? <input type="hidden" name="pickupDate" value={fromDbDate(i.actualPickupDate ?? i.confirmedPickupDate ?? i.requestedPickupDate)} /> : null}
                                </label>
                                <label className="text-[12px] tracking-wide text-muted uppercase">Expected return
                                  <input type="date" name="returnDate" defaultValue={fromDbDate(i.expectedReturnDate)} disabled={i.status === "RETURNED"} className="input mt-1" />
                                  {i.status === "RETURNED" ? <input type="hidden" name="returnDate" value={fromDbDate(i.expectedReturnDate)} /> : null}
                                </label>
                                <label className="text-[12px] tracking-wide text-muted uppercase">Rental fee ($)
                                  <input name="rentalFeeCents" defaultValue={centsToInput(i.rentalFeeCents)} inputMode="decimal" className="input mt-1" />
                                </label>
                                <label className="text-[12px] tracking-wide text-muted uppercase">Notes
                                  <input name="notes" defaultValue={i.notes ?? ""} className="input mt-1" />
                                </label>
                              </div>
                              {canOverride && (i.status === "CONFIRMED" || i.status === "CHECKED_OUT") ? (
                                <div className="rounded-xl bg-champagne-50 p-3 text-sm">
                                  <label className="flex items-center gap-2"><input type="checkbox" name="override" className="accent-blush-600" /> Override a conflict if one exists (recorded)</label>
                                  <input name="overrideReason" placeholder="Reason (required for override)" className="input mt-2" />
                                </div>
                              ) : null}
                            </ModalAction>
                          ) : null}
                          {i.status === "PENDING" || i.status === "CONFIRMED" ? (
                            <ModalAction label="Remove gown" icon={<XCircle className="h-3.5 w-3.5" />} size="sm" variant="ghost" title={`Remove ${gownCode(i.gown.number)} from this reservation?`} subtitle="The gown is released; this is recorded as a cancellation of this gown only." action={cancelItemAction.bind(null, i.id, r.id)} submitLabel="Remove gown" submitVariant="danger">
                              <div>
                                <label className="label" htmlFor="reason">Reason <span className="ml-1 text-[11px] font-normal text-muted/80">optional</span></label>
                                <input id="reason" name="reason" className="input" />
                              </div>
                            </ModalAction>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card>
            <CardHeader
              title="Payments"
              subtitle="Rental fees — tracked separately from the refundable deposit"
              icon={<Wallet className="h-[18px] w-[18px]" />}
              action={
                <ModalAction label="Record payment" size="sm" variant="primary" title="Record a payment, refund or waiver" action={recordPaymentAction.bind(null, r.id)} submitLabel="Save">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="label" htmlFor="kind">Type</label>
                      <select id="kind" name="kind" className="input" defaultValue="PAYMENT">
                        <option value="PAYMENT">Payment received</option>
                        <option value="REFUND">Refund given</option>
                        <option value="WAIVER">Waive fee</option>
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor="amountCents">Amount ($) <span className="text-blush-500">*</span></label>
                      <input id="amountCents" name="amountCents" inputMode="decimal" defaultValue={money.balanceDueCents ? centsToInput(money.balanceDueCents) : ""} required className="input" />
                    </div>
                    <MethodSelect defaultValue="CASH" />
                    <div>
                      <label className="label" htmlFor="paymentDate">Date</label>
                      <input id="paymentDate" name="paymentDate" type="date" defaultValue={today} required className="input" />
                    </div>
                    <div>
                      <label className="label" htmlFor="reference">Check # / reference <span className="ml-1 text-[11px] font-normal text-muted/80">optional</span></label>
                      <input id="reference" name="reference" className="input" />
                    </div>
                    <div>
                      <label className="label" htmlFor="notes">Notes <span className="ml-1 text-[11px] font-normal text-muted/80">optional</span></label>
                      <input id="notes" name="notes" className="input" />
                    </div>
                  </div>
                </ModalAction>
              }
            />
            <div className="grid grid-cols-2 gap-4 border-b border-line px-5 py-4 sm:grid-cols-4 sm:px-6">
              <KeyValue label="Rental fee">{formatCents(money.rentalFeeCents)}</KeyValue>
              <KeyValue label="Paid">{formatCents(money.netPaidCents)}</KeyValue>
              <KeyValue label="Waived">{formatCents(money.waivedCents)}</KeyValue>
              <KeyValue label="Balance due"><span className={money.balanceDueCents ? "font-semibold text-[#93602a]" : "text-[#3d6a4c]"}>{formatCents(money.balanceDueCents)}</span></KeyValue>
            </div>
            {r.payments.length === 0 ? (
              <p className="px-6 py-5 text-sm text-muted">No payments recorded yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {r.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-6">
                    <div className={p.isVoided ? "opacity-50" : ""}>
                      <p className={`text-sm font-medium ${p.isVoided ? "line-through" : ""}`}>{PAYMENT_KIND_LABEL[p.kind]}{p.method ? ` · ${PAYMENT_METHOD_LABEL[p.method]}` : ""}{p.reference ? ` · ${p.reference}` : ""}</p>
                      <p className="text-[12px] text-muted">{formatDate(p.paymentDate)}{p.notes ? ` · ${p.notes}` : ""}{p.isVoided ? ` · VOIDED: ${p.voidReason}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`font-display text-lg font-semibold ${p.isVoided ? "line-through opacity-50" : ""}`}>{p.kind === "REFUND" ? "−" : ""}{formatCents(p.amountCents)}</span>
                      {!p.isVoided ? (
                        <>
                          <ModalAction label="Edit" size="sm" variant="ghost" title="Edit entry" action={updatePaymentAction.bind(null, p.id, r.id)}>
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div>
                                <label className="label" htmlFor={`k${p.id}`}>Type</label>
                                <select id={`k${p.id}`} name="kind" defaultValue={p.kind} className="input">
                                  <option value="PAYMENT">Payment received</option>
                                  <option value="REFUND">Refund given</option>
                                  <option value="WAIVER">Waive fee</option>
                                </select>
                              </div>
                              <div>
                                <label className="label">Amount ($)</label>
                                <input name="amountCents" defaultValue={centsToInput(p.amountCents)} inputMode="decimal" className="input" required />
                              </div>
                              <MethodSelect defaultValue={p.method ?? ""} />
                              <div>
                                <label className="label">Date</label>
                                <input name="paymentDate" type="date" defaultValue={fromDbDate(p.paymentDate)} className="input" required />
                              </div>
                              <div>
                                <label className="label">Reference</label>
                                <input name="reference" defaultValue={p.reference ?? ""} className="input" />
                              </div>
                              <div>
                                <label className="label">Notes</label>
                                <input name="notes" defaultValue={p.notes ?? ""} className="input" />
                              </div>
                            </div>
                          </ModalAction>
                          <ModalAction label="Void" size="sm" variant="ghost" title="Void this entry?" subtitle="Voided entries stay visible in the history but no longer count." action={voidPaymentAction.bind(null, p.id, r.id)} submitLabel="Void entry" submitVariant="danger">
                            <div>
                              <label className="label" htmlFor={`vr${p.id}`}>Reason <span className="text-blush-500">*</span></label>
                              <input id={`vr${p.id}`} name="reason" required className="input" />
                            </div>
                          </ModalAction>
                        </>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Security deposit"
              subtitle="Refundable — never counted as rental income"
              icon={<ShieldCheck className="h-[18px] w-[18px]" />}
              action={
                <ModalAction label="Record deposit" size="sm" variant="secondary" title="Security deposit entry" action={recordDepositAction.bind(null, r.id)} submitLabel="Save">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="label" htmlFor="dkind">Type</label>
                      <select id="dkind" name="kind" className="input" defaultValue={money.depositOutstandingCents > 0 ? "COLLECTED" : "RETURNED"}>
                        <option value="COLLECTED">Deposit collected</option>
                        <option value="RETURNED">Deposit returned to customer</option>
                        <option value="RETAINED">Deposit retained (kept)</option>
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor="damount">Amount ($) <span className="text-blush-500">*</span></label>
                      <input id="damount" name="amountCents" inputMode="decimal" required className="input" defaultValue={money.depositOutstandingCents > 0 ? centsToInput(money.depositOutstandingCents) : money.depositHeldCents > 0 ? centsToInput(money.depositHeldCents) : ""} />
                    </div>
                    <MethodSelect defaultValue="CASH" />
                    <div>
                      <label className="label" htmlFor="ddate">Date</label>
                      <input id="ddate" name="transactionDate" type="date" defaultValue={today} required className="input" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label" htmlFor="dreason">Reason (required when retaining) </label>
                      <input id="dreason" name="reason" className="input" placeholder="e.g. cleaning cost for stain" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label" htmlFor="dnotes">Notes</label>
                      <input id="dnotes" name="notes" className="input" placeholder="e.g. check #1234" />
                    </div>
                  </div>
                </ModalAction>
              }
            />
            <div className="grid grid-cols-2 gap-4 border-b border-line px-5 py-4 sm:grid-cols-5 sm:px-6">
              <KeyValue label="Required">{formatCents(money.depositRequiredCents)}</KeyValue>
              <KeyValue label="Collected">{formatCents(money.depositCollectedCents)}</KeyValue>
              <KeyValue label="Returned">{formatCents(money.depositReturnedCents)}</KeyValue>
              <KeyValue label="Retained">{formatCents(money.depositRetainedCents)}</KeyValue>
              <KeyValue label="Currently held"><span className="font-semibold">{formatCents(money.depositHeldCents)}</span></KeyValue>
            </div>
            {money.depositOutstandingCents > 0 ? <p className="border-b border-line bg-champagne-50 px-6 py-2.5 text-[13px] text-[#86672c]">{formatCents(money.depositOutstandingCents)} of the required deposit has not been collected.</p> : null}
            {r.status === "RETURNED" && money.depositHeldCents > 0 ? <p className="border-b border-line bg-blush-50 px-6 py-2.5 text-[13px] text-blush-700">All gowns are back — {formatCents(money.depositHeldCents)} deposit is still held. Return or retain it.</p> : null}
            {r.deposits.length === 0 ? (
              <p className="px-6 py-5 text-sm text-muted">No deposit entries yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {r.deposits.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-6">
                    <div className={d.isVoided ? "opacity-50" : ""}>
                      <p className={`text-sm font-medium ${d.isVoided ? "line-through" : ""}`}>{DEPOSIT_KIND_LABEL[d.kind]}{d.method ? ` · ${PAYMENT_METHOD_LABEL[d.method]}` : ""}</p>
                      <p className="text-[12px] text-muted">{formatDate(d.transactionDate)}{d.reason ? ` · ${d.reason}` : ""}{d.notes ? ` · ${d.notes}` : ""}{d.isVoided ? ` · VOIDED: ${d.voidReason}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`font-display text-lg font-semibold ${d.isVoided ? "line-through opacity-50" : ""}`}>{formatCents(d.amountCents)}</span>
                      {!d.isVoided ? (
                        <ModalAction label="Void" size="sm" variant="ghost" title="Void this deposit entry?" action={voidDepositAction.bind(null, d.id, r.id)} submitLabel="Void entry" submitVariant="danger">
                          <div>
                            <label className="label" htmlFor={`dv${d.id}`}>Reason <span className="text-blush-500">*</span></label>
                            <input id={`dv${d.id}`} name="reason" required className="input" />
                          </div>
                        </ModalAction>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <p className="text-[11px] tracking-[0.14em] text-muted uppercase">Customer</p>
            <Link href={`/customers/${r.customer.id}`} className="mt-1 block font-display text-2xl font-semibold hover:text-blush-700">{r.customer.fullName}</Link>
            <p className="text-[12px] text-gold-600">{customerCode(r.customer.number)}</p>
            <a href={`tel:${r.customer.phone}`} className="mt-3 flex items-center gap-2 text-[15px] hover:text-blush-700"><Phone className="h-4 w-4 text-gold-500" /> {formatPhone(r.customer.phone)}</a>
            {r.customer.email ? <p className="mt-1 text-sm text-ink-soft">{r.customer.email}</p> : null}
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">Details</h3>
              {r.status !== "CANCELLED" ? (
                <ModalAction label="Edit" size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} title="Edit reservation" action={updateReservationDetailsAction.bind(null, r.id)}>
                  <div>
                    <label className="label" htmlFor="requestDate">Request date</label>
                    <input id="requestDate" name="requestDate" type="date" defaultValue={fromDbDate(r.requestDate)} className="input" required />
                  </div>
                  <div>
                    <label className="label" htmlFor="depositRequiredCents">Security deposit required ($)</label>
                    <input id="depositRequiredCents" name="depositRequiredCents" defaultValue={centsToInput(r.depositRequiredCents)} inputMode="decimal" className="input" required />
                  </div>
                  <div>
                    <label className="label" htmlFor="rnotes">Notes</label>
                    <textarea id="rnotes" name="notes" defaultValue={r.notes ?? ""} rows={3} className="input" />
                  </div>
                </ModalAction>
              ) : null}
            </div>
            <dl className="mt-4 space-y-4">
              <KeyValue label="Reservation number">{reservationCode(r.number)}</KeyValue>
              <KeyValue label="Created">{formatDateTime(r.createdAt, settings.timezone)}</KeyValue>
              <KeyValue label="Request date">{formatDate(r.requestDate)}</KeyValue>
              <KeyValue label="Confirmed">{r.confirmedAt ? formatDateTime(r.confirmedAt, settings.timezone) : "Not yet"}</KeyValue>
              <KeyValue label="Notes"><span className="whitespace-pre-line">{r.notes ?? "—"}</span></KeyValue>
            </dl>
            {live && checkedOut.length === 0 ? (
              <div className="no-print mt-5 border-t border-line pt-4">
                <ModalAction label="Cancel reservation" icon={<Ban className="h-4 w-4" />} variant="danger" size="sm" title="Cancel this reservation?" subtitle="All gowns not yet picked up are released. The reservation and its history are kept." action={cancelReservationAction.bind(null, r.id)} submitLabel="Cancel reservation" submitVariant="danger">
                  <div>
                    <label className="label" htmlFor="creason">Reason <span className="ml-1 text-[11px] font-normal text-muted/80">optional</span></label>
                    <input id="creason" name="reason" className="input" />
                  </div>
                </ModalAction>
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="History" icon={<History className="h-[18px] w-[18px]" />} />
            <ul className="divide-y divide-line">
              {activity.map((a) => (
                <li key={a.id} className="px-5 py-2.5">
                  <p className="text-[13px] leading-snug">{a.summary}</p>
                  <p className="text-[11.5px] text-muted">{a.actorName} · {formatDateTime(a.createdAt, settings.timezone)}</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
