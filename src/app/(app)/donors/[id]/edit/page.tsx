import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { donorCode } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { DonorForm } from "@/components/PersonForms";
import { updateDonorAction } from "@/app/actions/people";

export const metadata = { title: "Edit donor" };

export default async function EditDonorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await prisma.donor.findUnique({ where: { id } });
  if (!d) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow={`Edit ${donorCode(d.number)}`} title={d.name} />
      <DonorForm action={updateDonorAction.bind(null, d.id)} initial={{ name: d.name, phone: d.phone ?? "", email: d.email ?? "", address: d.address ?? "", notes: d.notes ?? "" }} cancelHref={`/donors/${d.id}`} />
    </div>
  );
}
