import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Phone, Mail, MapPin, Gift, Archive, ArchiveRestore } from "lucide-react";
import { requireStaffPage } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { thumbUrls } from "@/lib/photos";
import { donorCode, formatPhone, gownCode } from "@/lib/format";
import { formatDate } from "@/lib/dates";
import { Card, CardHeader, EmptyState, LinkButton, PageHeader, Pill } from "@/components/ui";
import { GownThumb } from "@/components/bits";
import { GownStatusBadge } from "@/components/status";
import { ActionButton } from "@/components/forms";
import { setDonorArchivedAction } from "@/app/actions/people";

export const metadata = { title: "Donor" };

export default async function DonorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await prisma.donor.findUnique({
    where: { id },
    include: { gowns: { orderBy: { intakeDate: "desc" }, include: { photos: { where: { kind: "GALLERY" }, orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1 } } } },
  });
  if (!d) notFound();
  const gowns = await thumbUrls(d.gowns);
  return (
    <div>
      <div className="mb-3 text-sm"><Link href="/donors" className="text-muted hover:text-blush-700">← Donors</Link></div>
      <PageHeader
        eyebrow={donorCode(d.number)}
        title={<span className="flex flex-wrap items-center gap-3">{d.name}{d.isArchived ? <Pill tone="grey">Archived</Pill> : null}</span>}
        subtitle={`${d.gowns.length} gown${d.gowns.length === 1 ? "" : "s"} donated`}
        actions={
          <>
            <LinkButton href={`/donors/${d.id}/edit`} variant="secondary"><Pencil className="h-4 w-4" /> Edit</LinkButton>
            {d.isArchived ? (
              <ActionButton action={setDonorArchivedAction.bind(null, d.id, false)} label="Restore" icon={<ArchiveRestore className="h-4 w-4" />} />
            ) : (
              <ActionButton action={setDonorArchivedAction.bind(null, d.id, true)} label="Archive" variant="ghost" icon={<Archive className="h-4 w-4" />} confirm={{ title: "Archive this donor?", body: "They will be hidden from lists. Their donated gowns and history are not affected." }} />
            )}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <Card className="h-fit p-5 sm:p-6">
          <h3 className="mb-4 font-display text-lg font-semibold">Contact</h3>
          <ul className="space-y-3 text-[15px]">
            <li className="flex items-center gap-3"><Phone className="h-4 w-4 text-gold-500" />{d.phone ? formatPhone(d.phone) : <span className="text-muted">No phone</span>}</li>
            <li className="flex items-center gap-3"><Mail className="h-4 w-4 text-gold-500" />{d.email ?? <span className="text-muted">No email</span>}</li>
            <li className="flex items-start gap-3"><MapPin className="mt-1 h-4 w-4 text-gold-500" />{d.address ?? <span className="text-muted">No address</span>}</li>
          </ul>
          {d.notes ? (<><div className="my-4 ornament" /><p className="text-sm whitespace-pre-line text-ink-soft">{d.notes}</p></>) : null}
        </Card>
        <Card>
          <CardHeader title="Donated gowns" icon={<Gift className="h-[18px] w-[18px]" />} />
          {gowns.length === 0 ? (
            <EmptyState title="No gowns recorded yet" action={<LinkButton href="/intake" size="sm">Record a gown</LinkButton>} />
          ) : (
            <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 sm:p-6 xl:grid-cols-4">
              {gowns.map((g) => (
                <Link key={g.id} href={`/inventory/${g.id}`} className="group">
                  <GownThumb url={g.photoUrl} alt={g.description} className="aspect-[3/4] rounded-2xl ring-1 ring-line group-hover:ring-gold-300" />
                  <p className="mt-2 text-[11px] tracking-[0.14em] text-gold-600">{gownCode(g.number)} · {formatDate(g.intakeDate, "short")}</p>
                  <p className="truncate text-sm font-medium">{g.description}</p>
                  <div className="mt-1"><GownStatusBadge status={g.status} /></div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
