import "server-only";
import { centsToInput } from "@/lib/money";
import { fromDbDate } from "@/lib/dates";
import { CONDITION_LABEL, DEPOSIT_KIND_LABEL, GOWN_STATUS_LABEL, PAYMENT_KIND_LABEL, PAYMENT_METHOD_LABEL, RESERVATION_STATUS_LABEL, customerCode, donorCode, gownCode, reservationCode } from "@/lib/format";
import { prisma } from "@/lib/db";
import { customerReport, donationReport, financialReport, overdueReport, reservationReport, type Range } from "./reports";

export const REPORTS = ["inventory", "donations", "reservations", "cancelled", "most-borrowed", "customers", "payments", "overdue", "late-returns", "financial-payments", "financial-deposits", "outstanding", "activity"] as const;
export type ReportName = (typeof REPORTS)[number];

const d = (x: Date | null | undefined) => (x ? fromDbDate(x) : "");

export async function buildExport(name: ReportName, r: Range, today: string): Promise<{ headers: string[]; rows: (string | number | null)[][] }> {
  switch (name) {
    case "inventory": {
      const gowns = await prisma.gown.findMany({ include: { donor: true }, orderBy: { number: "asc" } });
      return {
        headers: ["Gown ID", "Description", "Style", "Size", "Color", "Designer", "Status", "Status reason", "Intake date", "Intake condition", "Current condition", "Bust", "Waist", "Hips", "Length", "Other measurements", "Donor", "Archived at", "Disposed date", "Disposal reason", "Notes"],
        rows: gowns.map((g) => [gownCode(g.number), g.description, g.style, g.size, g.color, g.designer, GOWN_STATUS_LABEL[g.status], g.statusReason, d(g.intakeDate), g.intakeCondition ? CONDITION_LABEL[g.intakeCondition] : "", g.currentCondition ? CONDITION_LABEL[g.currentCondition] : "", g.bust, g.waist, g.hips, g.length, g.otherMeasurements, g.donor?.name ?? "", g.archivedAt ? g.archivedAt.toISOString() : "", d(g.disposedDate), g.disposalReason, g.notes]),
      };
    }
    case "donations": {
      const rep = await donationReport(r);
      return { headers: ["Intake date", "Gown ID", "Description", "Size", "Color", "Donor ID", "Donor"], rows: rep.gowns.map((g) => [d(g.intakeDate), gownCode(g.number), g.description, g.size, g.color, g.donor ? donorCode(g.donor.number) : "", g.donor?.name ?? ""]) };
    }
    case "reservations":
    case "cancelled": {
      const rep = await reservationReport(r);
      const list = name === "cancelled" ? rep.cancelled : rep.reservations;
      return {
        headers: ["Reservation", "Request date", "Customer ID", "Customer", "Status", "Gowns", "Pickup dates", "Return dates", "Total fee", "Cancelled at", "Cancellation reason"],
        rows: list.map((x) => [reservationCode(x.number), d(x.requestDate), customerCode(x.customer.number), x.customer.fullName, RESERVATION_STATUS_LABEL[x.status], x.items.map((i) => gownCode(i.gown.number)).join(" "), x.items.map((i) => d(i.confirmedPickupDate ?? i.requestedPickupDate)).join(" "), x.items.map((i) => d(i.expectedReturnDate)).join(" "), centsToInput(x.items.filter((i) => i.status !== "CANCELLED").reduce((s, i) => s + i.rentalFeeCents, 0)), x.cancelledAt ? x.cancelledAt.toISOString() : "", x.cancellationReason]),
      };
    }
    case "most-borrowed": {
      const rep = await reservationReport(r);
      return { headers: ["Gown ID", "Description", "Size", "Color", "Times borrowed"], rows: rep.mostBorrowed.map((m) => [gownCode(m.gown.number), m.gown.description, m.gown.size, m.gown.color, m.count]) };
    }
    case "customers": {
      const rep = await customerReport(r);
      return { headers: ["Customer ID", "Name", "Phone", "Email", "Reservations in range", "Gowns borrowed", "Paid in range", "Outstanding balance (all time)", "Late returns"], rows: rep.rows.map((x) => [customerCode(x.customer.number), x.customer.fullName, x.customer.phone, x.customer.email, x.reservations, x.gowns, centsToInput(x.paid), centsToInput(x.balance), x.late]) };
    }
    case "payments":
    case "financial-payments": {
      const rep = await customerReport(r);
      return { headers: ["Date", "Reservation", "Customer", "Type", "Method", "Amount", "Reference", "Notes", "Voided", "Void reason"], rows: rep.payments.map((p) => [d(p.paymentDate), reservationCode(p.reservation.number), p.reservation.customer.fullName, PAYMENT_KIND_LABEL[p.kind], p.method ? PAYMENT_METHOD_LABEL[p.method] : "", centsToInput(p.amountCents), p.reference, p.notes, p.isVoided ? "yes" : "", p.voidReason]) };
    }
    case "financial-deposits": {
      const rep = await financialReport(r);
      return { headers: ["Date", "Reservation", "Customer", "Type", "Method", "Amount", "Reason", "Notes"], rows: rep.deposits.map((x) => [d(x.transactionDate), reservationCode(x.reservation.number), x.reservation.customer.fullName, DEPOSIT_KIND_LABEL[x.kind], x.method ? PAYMENT_METHOD_LABEL[x.method] : "", centsToInput(x.amountCents), x.reason, x.notes]) };
    }
    case "outstanding": {
      const rep = await financialReport(r);
      return { headers: ["Reservation", "Customer", "Phone", "Rental fee", "Paid", "Waived", "Balance due", "Deposit held"], rows: rep.outstandingRows.map((x) => [reservationCode(x.reservation.number), x.reservation.customer.fullName, x.reservation.customer.phone, centsToInput(x.summary.rentalFeeCents), centsToInput(x.summary.netPaidCents), centsToInput(x.summary.waivedCents), centsToInput(x.summary.balanceDueCents), centsToInput(x.summary.depositHeldCents)]) };
    }
    case "overdue": {
      const rep = await overdueReport(r, today);
      return { headers: ["Customer", "Phone", "Gown", "Reservation", "Expected return", "Days overdue"], rows: rep.current.map((o) => [o.customerName, o.customerPhone, `${gownCode(o.gownNumber)} ${o.gownDescription}`, reservationCode(o.reservationNumber), o.expectedReturnDate, o.daysOverdue]) };
    }
    case "late-returns": {
      const rep = await overdueReport(r, today);
      return { headers: ["Return date", "Customer", "Phone", "Gown", "Reservation", "Days late"], rows: rep.late.map((x) => [d(x.returnDate), x.item.reservation.customer.fullName, x.item.reservation.customer.phone, `${gownCode(x.item.gown.number)} ${x.item.gown.description}`, reservationCode(x.item.reservation.number), x.daysLate]) };
    }
    case "activity": {
      const logs = await prisma.activityLog.findMany({ where: { createdAt: { gte: new Date(`${r.from}T00:00:00Z`), lte: new Date(`${r.to}T23:59:59Z`) } }, orderBy: { createdAt: "desc" }, take: 20000 });
      return { headers: ["When (UTC)", "Staff member", "Action", "Record type", "Summary"], rows: logs.map((l) => [l.createdAt.toISOString(), l.actorName, l.action, l.entityType, l.summary]) };
    }
  }
}
