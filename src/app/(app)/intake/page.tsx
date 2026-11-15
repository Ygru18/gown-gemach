import { requireStaffPage } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { gownFilterOptions } from "@/lib/services/gowns";
import { getToday } from "@/lib/services/settings";
import { PageHeader } from "@/components/ui";
import { GownForm } from "@/components/GownForm";
import { createGownAction, preparePhotoUploadsAction, registerPhotosAction } from "@/app/actions/gowns";

export const metadata = { title: "Gown Intake" };

export default async function IntakePage() {
  await requireStaffPage();
  const [donors, opts, today] = await Promise.all([
    prisma.donor.findMany({ where: { isArchived: false }, orderBy: { name: "asc" }, select: { id: true, name: true, phone: true } }),
    gownFilterOptions(),
    getToday(),
  ]);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="Gown Intake" title="Welcome a new gown" subtitle="Record a donated gown. Once saved, it appears in the inventory as Available." />
      <GownForm
        mode="create"
        initial={{ intakeDate: today, description: "", style: "", size: "", color: "", designer: "", intakeCondition: "", bust: "", waist: "", hips: "", length: "", otherMeasurements: "", notes: "" }}
        donors={donors}
        suggestions={{ styles: opts.styles, colors: opts.colors, sizes: opts.sizes }}
        action={createGownAction}
        prepareUploads={preparePhotoUploadsAction}
        registerPhotos={registerPhotosAction}
        cancelHref="/inventory"
      />
    </div>
  );
}
