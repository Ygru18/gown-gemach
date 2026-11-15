import Link from "next/link";
import { LayoutGrid, Rows3, Gift, ChevronLeft, ChevronRight } from "lucide-react";
import { requireStaffPage } from "@/lib/auth/session";
import { listGowns, gownFilterOptions, type GownFilters } from "@/lib/services/gowns";
import { thumbUrls } from "@/lib/photos";
import { GOWN_STATUS_LABEL, GOWN_STATUS_ORDER, gownCode } from "@/lib/format";
import { formatDate, fromDbDate } from "@/lib/dates";
import { PageHeader, LinkButton, Card, EmptyState, DressIcon, buttonClass } from "@/components/ui";
import { FilterBar, ViewToggle } from "@/components/FilterBar";
import { GownThumb } from "@/components/bits";
import { GownStatusBadge } from "@/components/status";

export const metadata = { title: "Inventory" };

type SP = Record<string, string | undefined>;

export default async function InventoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaffPage();
  const sp = await searchParams;
  const filters: GownFilters = { q: sp.q, status: sp.status, size: sp.size, color: sp.color, style: sp.style, donorId: sp.donor, addedFrom: sp.from, addedTo: sp.to, sort: sp.sort };
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const [{ gowns, total, pageSize }, opts] = await Promise.all([listGowns(filters, page), gownFilterOptions()]);
  const rows = await thumbUrls(gowns);
  const view = sp.view === "table" ? "table" : "gallery";
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const pageHref = (p: number) => {
    const n = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    n.set("page", String(p));
    return `/inventory?${n}`;
  };

  return (
    <div>
      <PageHeader
        eyebrow="Inventory"
        title="The collection"
        subtitle={`${total} gown${total === 1 ? "" : "s"} ${filters.status === "all" ? "in total" : filters.status && filters.status !== "active" ? `· ${GOWN_STATUS_LABEL[filters.status as keyof typeof GOWN_STATUS_LABEL] ?? (filters.status === "unavailable" ? "Unavailable" : "")}` : "in active inventory"}`}
        actions={
          <>
            <LinkButton href="/intake"><Gift className="h-4 w-4" /> Add a gown</LinkButton>
          </>
        }
      />
      <FilterBar
        placeholder="Search by Gown ID (G-0012), description, style, color, designer, donor…"
        extra={<ViewToggle options={[{ value: "gallery", label: "Gallery", icon: <LayoutGrid className="h-4 w-4" /> }, { value: "table", label: "Table", icon: <Rows3 className="h-4 w-4" /> }]} />}
        filters={[
          {
            name: "status",
            label: "Status",
            type: "select",
            options: [
              { value: "", label: "Active inventory" },
              { value: "all", label: "All gowns (incl. archived)" },
              { value: "unavailable", label: "All unavailable" },
              ...GOWN_STATUS_ORDER.map((s) => ({ value: s, label: GOWN_STATUS_LABEL[s] })),
            ],
          },
          { name: "size", label: "Size", type: "select", options: [{ value: "", label: "Any size" }, ...opts.sizes.map((s) => ({ value: s, label: s }))] },
          { name: "color", label: "Color", type: "select", options: [{ value: "", label: "Any color" }, ...opts.colors.map((s) => ({ value: s, label: s }))] },
          { name: "style", label: "Style", type: "select", options: [{ value: "", label: "Any style" }, ...opts.styles.map((s) => ({ value: s, label: s }))] },
          { name: "donor", label: "Donor", type: "select", options: [{ value: "", label: "Any donor" }, ...opts.donors.map((d) => ({ value: d.id, label: d.name }))] },
          { name: "from", label: "Added from", type: "date" },
          { name: "to", label: "Added to", type: "date" },
          {
            name: "sort",
            label: "Sort by",
            type: "select",
            options: [
              { value: "", label: "Newest first" },
              { value: "added", label: "Date added (oldest)" },
              { value: "id", label: "Gown ID" },
              { value: "id_desc", label: "Gown ID (desc)" },
              { value: "size", label: "Size" },
              { value: "color", label: "Color" },
              { value: "style", label: "Style" },
            ],
          },
        ]}
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={<DressIcon className="h-6 w-6" />} title={total === 0 && !sp.q ? "No gowns here yet" : "No gowns match"} action={<LinkButton href="/intake">Add a gown</LinkButton>}>
            {sp.q || sp.size || sp.color ? "Try a different search or clear the filters." : "Gowns you record in Gown Intake will appear here."}
          </EmptyState>
        </Card>
      ) : view === "gallery" ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 xl:grid-cols-5">
          {rows.map((g) => {
            const next = g.reservationItems[0];
            return (
              <Link key={g.id} href={`/inventory/${g.id}`} className="group card overflow-hidden transition hover:-translate-y-0.5 hover:border-gold-300 hover:shadow-lift">
                <div className="relative">
                  <GownThumb url={g.photoUrl} alt={g.description} className="aspect-[3/4]" />
                  <div className="absolute top-2.5 left-2.5">
                    <GownStatusBadge status={g.status} />
                  </div>
                </div>
                <div className="p-3.5">
                  <p className="text-[11px] font-medium tracking-[0.16em] text-gold-600">{gownCode(g.number)}</p>
                  <p className="mt-0.5 line-clamp-2 font-display text-[17px] leading-snug font-semibold text-ink">{g.description}</p>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-ink-soft">
                    <span>Size <b className="font-medium text-ink">{g.size}</b></span>
                    <span>{g.color}</span>
                    <span className="text-muted">{g.style}</span>
                  </div>
                  {next ? (
                    <p className="mt-2 text-[11.5px] text-muted">
                      {next.status === "CHECKED_OUT" ? "Due back " : "Next: "}
                      {next.status === "CHECKED_OUT" ? formatDate(next.expectedReturnDate, "short") : `${formatDate(next.confirmedPickupDate ?? next.requestedPickupDate, "short")} – ${formatDate(next.expectedReturnDate, "short")}`}
                    </p>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-elegant">
              <thead>
                <tr>
                  <th></th>
                  <th>Gown ID</th>
                  <th>Description</th>
                  <th>Style</th>
                  <th>Size</th>
                  <th>Color</th>
                  <th>Designer</th>
                  <th>Donor</th>
                  <th>Added</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((g) => (
                  <tr key={g.id}>
                    <td className="w-12">
                      <GownThumb url={g.photoUrl} alt="" className="h-12 w-9 rounded-md" />
                    </td>
                    <td className="font-medium whitespace-nowrap text-gold-600">
                      <Link href={`/inventory/${g.id}`} className="hover:underline">{gownCode(g.number)}</Link>
                    </td>
                    <td className="min-w-[14rem]">
                      <Link href={`/inventory/${g.id}`} className="hover:text-blush-700">{g.description}</Link>
                    </td>
                    <td>{g.style}</td>
                    <td>{g.size}</td>
                    <td>{g.color}</td>
                    <td className="text-ink-soft">{g.designer ?? "—"}</td>
                    <td className="text-ink-soft">{g.donor ? <Link href={`/donors/${g.donor.id}`} className="hover:text-blush-700">{g.donor.name}</Link> : "—"}</td>
                    <td className="whitespace-nowrap text-ink-soft">{formatDate(fromDbDate(g.intakeDate))}</td>
                    <td><GownStatusBadge status={g.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {pages > 1 ? (
        <div className="mt-8 flex items-center justify-center gap-3">
          {page > 1 ? <Link href={pageHref(page - 1)} className={buttonClass("secondary", "sm")}><ChevronLeft className="h-4 w-4" /> Previous</Link> : null}
          <span className="text-sm text-muted">Page {page} of {pages}</span>
          {page < pages ? <Link href={pageHref(page + 1)} className={buttonClass("secondary", "sm")}>Next <ChevronRight className="h-4 w-4" /></Link> : null}
        </div>
      ) : null}
    </div>
  );
}
