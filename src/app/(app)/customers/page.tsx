import Link from "next/link";
import { UserPlus, Users } from "lucide-react";
import { requireStaffPage } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { customerSearchWhere } from "@/lib/services/customers";
import { customerCode, formatPhone } from "@/lib/format";
import { formatDate } from "@/lib/dates";
import { Card, EmptyState, LinkButton, PageHeader, Pill } from "@/components/ui";
import { FilterBar } from "@/components/FilterBar";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireStaffPage();
  const sp = await searchParams;
  const showInactive = sp.show === "all";
  const customers = await prisma.customer.findMany({
    where: customerSearchWhere(sp.q, showInactive),
    orderBy: sp.sort === "recent" ? { createdAt: "desc" } : { fullName: "asc" },
    take: 300,
    include: { _count: { select: { reservations: true } }, reservations: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } },
  });
  return (
    <div>
      <PageHeader eyebrow="Customers" title="Our customers" subtitle="Name and phone number are all that's needed — email is always optional." actions={<LinkButton href="/customers/new"><UserPlus className="h-4 w-4" /> Add customer</LinkButton>} />
      <FilterBar
        placeholder="Search by name, phone number or Customer ID (C-0001)…"
        filters={[
          { name: "show", label: "Show", type: "select", options: [{ value: "", label: "Active customers" }, { value: "all", label: "Include inactive" }] },
          { name: "sort", label: "Sort", type: "select", options: [{ value: "", label: "Name A–Z" }, { value: "recent", label: "Recently added" }] },
        ]}
      />
      <Card className="overflow-hidden">
        {customers.length === 0 ? (
          <EmptyState icon={<Users className="h-6 w-6" />} title={sp.q ? "No customers match" : "No customers yet"} action={<LinkButton href="/customers/new">Add a customer</LinkButton>}>
            Customers can also be added directly while creating a reservation.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-elegant">
              <thead><tr><th>ID</th><th>Name</th><th>Phone</th><th>Email</th><th>Reservations</th><th>Last reservation</th></tr></thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td className="font-medium whitespace-nowrap text-gold-600">{customerCode(c.number)}</td>
                    <td>
                      <Link href={`/customers/${c.id}`} className="font-medium hover:text-blush-700">{c.fullName}</Link>
                      {c.isArchived ? <Pill tone="grey" className="ml-2">Inactive</Pill> : null}
                    </td>
                    <td className="whitespace-nowrap">{formatPhone(c.phone)}</td>
                    <td className="text-ink-soft">{c.email ?? "—"}</td>
                    <td>{c._count.reservations}</td>
                    <td className="text-ink-soft">{c.reservations[0] ? formatDate(c.reservations[0].createdAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
