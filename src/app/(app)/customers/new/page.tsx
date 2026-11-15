import { requireStaffPage } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { CustomerForm } from "@/components/PersonForms";
import { createCustomerAction } from "@/app/actions/people";

export const metadata = { title: "Add customer" };

export default async function NewCustomerPage() {
  await requireStaffPage();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Customers" title="Add a customer" subtitle="A Customer ID is assigned automatically. Email is never required." />
      <CustomerForm action={createCustomerAction} cancelHref="/customers" />
    </div>
  );
}
