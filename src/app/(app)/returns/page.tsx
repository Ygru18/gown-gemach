import Link from "next/link";
import { Undo2, ClipboardCheck, Droplets, Scissors, CircleSlash } from "lucide-react";
import { requireStaffPage } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/services/settings";
import { listOpenWork } from "@/lib/services/care";
import { thumbUrls } from "@/lib/photos";
import { diffDays, formatDate, fromDbDate, todayYmd } from "@/lib/dates";
import { centsToInput } from "@/lib/money";
import { formatPhone, gownCode, reservationCode } from "@/lib/format";
import { Card, CardHeader, EmptyState, PageHeader, Pill } from "@/components/ui";
import { GownThumb } from "@/components/bits";
import { WorkStatusBadge } from "@/components/status";
import { ReturnButton } from "@/components/ReservationPanels";
import { InspectionButton, UpdateWorkButton } from "@/components/CareForms";
import { returnAction } from "@/app/actions/reservations";
import { preparePhotoUploadsAction, recordInspectionAction, updateWorkAction } from "@/app/actions/gowns";

export const metadata = { title: "Returns & Inspections" };

export default async function ReturnsPage() {
  await requireStaffPage();
  const settings = await getSettings();
  const today = todayYmd(settings.timezone);
  const [out, inspectGowns, unavailable, work, recent] = await Promise.all([
    prisma.reservationItem.findMany({
      where: { status: "CHECKED_OUT" },
      include: { gown: { select: { id: true, number: true, description: true } }, reservation: { select: { id: true, number: true, customer: { select: { id: true, fullName: true, phone: true } } } } },
      orderBy: { expectedReturnDate: "asc" },
    }),
    prisma.gown.findMany({
      where: { status: "PENDING_INSPECTION" },
      include: { photos: { where: { kind: "GALLERY" }, orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1 } },
      orderBy: { statusChangedAt: "asc" },
    }),
    prisma.gown.findMany({ where: { status: "UNAVAILABLE_OTHER" }, include: { photos: { where: { kind: "GALLERY" }, orderBy: [{ isPrimary: "desc" }], take: 1 } }, orderBy: { statusChangedAt: "asc" } }),
    listOpenWork(),
    prisma.gownReturn.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { item: { include: { gown: { select: { id: true, number: true, description: true } }, reservation: { select: { id: true, number: true, customer: { select: { fullName: true } } } } } } },
    }),
  ]);
  const toInspect = await thumbUrls(inspectGowns);
  const unavail = await thumbUrls(unavailable);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Returns & Inspections" title="Returns & care" subtitle="Returned gowns wait in Pending Inspection until someone decides they are ready, need cleaning, or need alterations." />

      <Card>
        <CardHeader title="Checked out — awaiting return" subtitle={`${out.length} gown${out.length === 1 ? "" : "s"} out`} icon={<Undo2 className="h-[18px] w-[18px]" />} />
        {out.length === 0 ? (
          <EmptyState title="All gowns are home">No gowns are currently checked out.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {out.map((i) => {
              const exp = fromDbDate(i.expectedReturnDate);
              const late = exp < today ? diffDays(exp, today) : 0;
              return (
                <li key={i.id} className={`flex flex-wrap items-center gap-4 px-5 py-3.5 sm:px-6 ${late ? "bg-red-50/40" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <Link href={`/reservations/${i.reservation.id}`} className="font-medium hover:text-blush-700">{gownCode(i.gown.number)} · {i.gown.description}</Link>
                    <p className="text-[13px] text-muted">
                      {i.reservation.customer.fullName} · {formatPhone(i.reservation.customer.phone)} · {reservationCode(i.reservation.number)}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p>Due {formatDate(exp)}</p>
                    {late ? <Pill tone="red">{late} day{late === 1 ? "" : "s"} overdue</Pill> : exp === today ? <Pill tone="amber">Due today</Pill> : null}
                  </div>
                  <ReturnButton item={{ id: i.id, gownId: i.gown.id, gownNumber: i.gown.number, description: i.gown.description, expectedReturn: formatDate(exp) }} today={today} action={returnAction.bind(null, i.reservation.id)} prepareUploads={preparePhotoUploadsAction} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card id="inspection">
        <CardHeader title="Pending inspection" subtitle="Inspect each gown before it can be rented again" icon={<ClipboardCheck className="h-[18px] w-[18px]" />} />
        {toInspect.length === 0 ? (
          <EmptyState title="Nothing waiting for inspection" />
        ) : (
          <ul className="divide-y divide-line">
            {toInspect.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5 sm:px-6">
                <GownThumb url={g.photoUrl} alt="" className="h-16 w-12 rounded-lg ring-1 ring-line" />
                <div className="min-w-0 flex-1">
                  <Link href={`/inventory/${g.id}`} className="font-medium hover:text-blush-700">{gownCode(g.number)} · {g.description}</Link>
                  <p className="text-[13px] text-muted">{g.statusReason ?? "Awaiting inspection"} · since {formatDate(g.statusChangedAt)}</p>
                </div>
                <InspectionButton gownId={g.id} today={today} action={recordInspectionAction} label="Inspect" />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        {(["cleaning", "alteration"] as const).map((kind) => {
          const rows = kind === "cleaning" ? work.cleanings : work.alterations;
          return (
            <Card key={kind} id={kind}>
              <CardHeader title={kind === "cleaning" ? "Cleaning in progress" : "Alterations in progress"} icon={kind === "cleaning" ? <Droplets className="h-[18px] w-[18px]" /> : <Scissors className="h-[18px] w-[18px]" />} />
              {rows.length === 0 ? (
                <EmptyState title={kind === "cleaning" ? "No open cleaning" : "No open alterations"} />
              ) : (
                <ul className="divide-y divide-line">
                  {rows.map((r) => {
                    const text = "reason" in r ? r.reason : (r as { description: string }).description;
                    return (
                      <li key={r.id} className="flex items-start justify-between gap-3 px-5 py-3.5">
                        <div className="min-w-0">
                          <Link href={`/inventory/${r.gown.id}`} className="font-medium hover:text-blush-700">{gownCode(r.gown.number)} · {r.gown.description}</Link>
                          <p className="text-[13px] text-ink-soft">{text ?? "—"}</p>
                          <p className="text-[12px] text-muted">Since {formatDate(r.identifiedDate)}{r.assignedTo ? ` · ${r.assignedTo}` : ""}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <WorkStatusBadge status={r.status} />
                          <UpdateWorkButton kind={kind} record={{ status: r.status, assignedTo: r.assignedTo, costInput: centsToInput(r.costCents), notes: r.notes, text: text ?? null }} today={today} action={updateWorkAction.bind(null, kind, r.id)} />
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

      {unavail.length ? (
        <Card>
          <CardHeader title="Unavailable – other" subtitle="Damaged or set aside; inspect to mark ready" icon={<CircleSlash className="h-[18px] w-[18px]" />} />
          <ul className="divide-y divide-line">
            {unavail.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5 sm:px-6">
                <GownThumb url={g.photoUrl} alt="" className="h-16 w-12 rounded-lg ring-1 ring-line" />
                <div className="min-w-0 flex-1">
                  <Link href={`/inventory/${g.id}`} className="font-medium hover:text-blush-700">{gownCode(g.number)} · {g.description}</Link>
                  <p className="text-[13px] text-muted">{g.statusReason ?? "Unavailable"}</p>
                </div>
                <InspectionButton gownId={g.id} today={today} action={recordInspectionAction} label="Inspect / mark ready" variant="secondary" />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Recently returned" />
        {recent.length === 0 ? <p className="px-6 py-5 text-sm text-muted">No returns yet.</p> : (
          <ul className="divide-y divide-line">
            {recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm sm:px-6">
                <span><Link href={`/inventory/${r.item.gown.id}`} className="font-medium hover:text-blush-700">{gownCode(r.item.gown.number)} · {r.item.gown.description}</Link> <span className="text-muted">· {r.item.reservation.customer.fullName}</span></span>
                <span className="flex items-center gap-2 text-ink-soft">{formatDate(r.returnDate)}{r.daysLate ? <Pill tone="red">{r.daysLate}d late</Pill> : null}{r.hasDamage ? <Pill tone="peach">Damage</Pill> : null}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
