import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { customerCode } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { CustomerForm } from "@/components/PersonForms";
import { updateCustomerAction } from "@/app/actions/people";

export const metadata = { title: "Edit customer" };

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const c = await prisma.customer.findUnique({ where: { id } });
  if (!c) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow={`Edit ${customerCode(c.number)}`} title={c.fullName} />
      <CustomerForm action={updateCustomerAction.bind(null, c.id)} initial={{ fullName: c.fullName, phone: c.phone, email: c.email ?? "", address: c.address ?? "", notes: c.notes ?? "" }} cancelHref={`/customers/${c.id}`} submitLabel="Save changes" />
    </div>
  );
}
