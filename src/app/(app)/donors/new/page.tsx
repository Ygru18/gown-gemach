import { requireStaffPage } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { DonorForm } from "@/components/PersonForms";
import { createDonorAction } from "@/app/actions/people";

export const metadata = { title: "Add donor" };

export default async function NewDonorPage() {
  await requireStaffPage();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Donors" title="Add a donor" />
      <DonorForm action={createDonorAction} cancelHref="/donors" />
    </div>
  );
}
