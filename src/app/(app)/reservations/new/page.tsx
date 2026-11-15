import { requireStaffPage } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/services/settings";
import { todayYmd } from "@/lib/dates";
import { centsToInput } from "@/lib/money";
import { thumbUrls } from "@/lib/photos";
import { PageHeader } from "@/components/ui";
import { ReservationBuilder } from "@/components/ReservationBuilder";
import { quickCreateCustomerAction, searchCustomersAction } from "@/app/actions/people";
import { checkAvailabilityAction, createReservationAction, searchGownsForReservationAction } from "@/app/actions/reservations";

export const metadata = { title: "New reservation" };

export default async function NewReservationPage({ searchParams }: { searchParams: Promise<{ gownId?: string; customerId?: string }> }) {
  await requireStaffPage();
  const sp = await searchParams;
  const settings = await getSettings();
  const uuid = /^[0-9a-f-]{36}$/i;
  const [customer, gown] = await Promise.all([
    sp.customerId && uuid.test(sp.customerId) ? prisma.customer.findUnique({ where: { id: sp.customerId }, select: { id: true, number: true, fullName: true, phone: true, email: true } }) : null,
    sp.gownId && uuid.test(sp.gownId)
      ? prisma.gown.findUnique({ where: { id: sp.gownId }, include: { photos: { where: { kind: "GALLERY" }, orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1 } } })
      : null,
  ]);
  const g = gown ? (await thumbUrls([gown]))[0]! : null;
  return (
    <div>
      <PageHeader eyebrow="Reservations" title="New reservation" subtitle="Step 1: record the request as a pending reservation. You'll confirm it once you've reviewed availability." />
      <ReservationBuilder
        today={todayYmd(settings.timezone)}
        defaults={{ rentalFee: centsToInput(settings.defaultRentalFeeCents), deposit: centsToInput(settings.defaultDepositCents), rentalDays: settings.defaultRentalDays }}
        initialCustomer={customer}
        initialGown={g ? { id: g.id, number: g.number, description: g.description, size: g.size, color: g.color, style: g.style, status: g.status, photoUrl: g.photoUrl, availability: null } : null}
        searchCustomers={searchCustomersAction}
        quickCreateCustomer={quickCreateCustomerAction}
        searchGowns={searchGownsForReservationAction}
        checkAvailability={checkAvailabilityAction}
        createReservation={createReservationAction}
      />
    </div>
  );
}
