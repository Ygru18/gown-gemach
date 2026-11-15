import Link from "next/link";
import { HeartHandshake, Plus } from "lucide-react";
import { requireStaffPage } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { donorSearchWhere } from "@/lib/services/donors";
import { donorCode, formatPhone } from "@/lib/format";
import { formatDate } from "@/lib/dates";
import { Card, EmptyState, LinkButton, PageHeader, Pill } from "@/components/ui";
import { FilterBar } from "@/components/FilterBar";

export const metadata = { title: "Donors" };

export default async function DonorsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireStaffPage();
  const sp = await searchParams;
  const donors = await prisma.donor.findMany({
    where: { ...donorSearchWhere(sp.q, sp.show === "all"), ...(sp.has === "gowns" ? { gowns: { some: {} } } : {}) },
    orderBy: sp.sort === "gowns" ? { gowns: { _count: "desc" } } : sp.sort === "recent" ? { createdAt: "desc" } : { name: "asc" },
    include: { _count: { select: { gowns: true } }, gowns: { orderBy: { intakeDate: "desc" }, take: 1, select: { intakeDate: true } } },
    take: 300,
  });
  return (
    <div>
      <PageHeader eyebrow="Donors" title="Our generous donors" subtitle="Every gown carries someone's kindness. Contact details are always optional." actions={<LinkButton href="/donors/new"><Plus className="h-4 w-4" /> Add donor</LinkButton>} />
      <FilterBar
        placeholder="Search donors by name, phone, email or ID (D-0001)…"
        filters={[
          { name: "show", label: "Show", type: "select", options: [{ value: "", label: "Active donors" }, { value: "all", label: "Include archived" }] },
          { name: "has", label: "Filter", type: "select", options: [{ value: "", label: "All donors" }, { value: "gowns", label: "Has donated gowns" }] },
          { name: "sort", label: "Sort", type: "select", options: [{ value: "", label: "Name A–Z" }, { value: "gowns", label: "Most gowns" }, { value: "recent", label: "Recently added" }] },
        ]}
      />
      <Card className="overflow-hidden">
        {donors.length === 0 ? (
          <EmptyState icon={<HeartHandshake className="h-6 w-6" />} title={sp.q ? "No donors match" : "No donors yet"} action={<LinkButton href="/donors/new">Add a donor</LinkButton>}>
            Donors can also be added while recording a gown in Gown Intake.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-elegant">
              <thead><tr><th>ID</th><th>Name</th><th>Phone</th><th>Email</th><th>Gowns donated</th><th>Last donation</th></tr></thead>
              <tbody>
                {donors.map((d) => (
                  <tr key={d.id}>
                    <td className="font-medium whitespace-nowrap text-gold-600">{donorCode(d.number)}</td>
                    <td><Link href={`/donors/${d.id}`} className="font-medium hover:text-blush-700">{d.name}</Link>{d.isArchived ? <Pill tone="grey" className="ml-2">Archived</Pill> : null}</td>
                    <td className="whitespace-nowrap">{d.phone ? formatPhone(d.phone) : "—"}</td>
                    <td className="text-ink-soft">{d.email ?? "—"}</td>
                    <td>{d._count.gowns}</td>
                    <td className="text-ink-soft">{d.gowns[0] ? formatDate(d.gowns[0].intakeDate) : "—"}</td>
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
