import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { gownFilterOptions } from "@/lib/services/gowns";
import { fromDbDate } from "@/lib/dates";
import { gownCode } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { GownForm } from "@/components/GownForm";
import { updateGownAction } from "@/app/actions/gowns";

export const metadata = { title: "Edit gown" };

export default async function EditGownPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const g = await prisma.gown.findUnique({ where: { id }, include: { donor: true } });
  if (!g) notFound();
  const [donors, opts] = await Promise.all([
    prisma.donor.findMany({ where: { OR: [{ isArchived: false }, { id: g.donorId ?? undefined }] }, orderBy: { name: "asc" }, select: { id: true, name: true, phone: true } }),
    gownFilterOptions(),
  ]);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow={`Edit ${gownCode(g.number)}`} title={g.description} subtitle={g.donor ? `Current donor: ${g.donor.name}` : "No donor recorded"} />
      <GownForm
        mode="edit"
        initial={{
          intakeDate: fromDbDate(g.intakeDate),
          description: g.description,
          style: g.style,
          size: g.size,
          color: g.color,
          designer: g.designer ?? "",
          intakeCondition: g.intakeCondition ?? "",
          currentCondition: g.currentCondition ?? "",
          bust: g.bust ?? "",
          waist: g.waist ?? "",
          hips: g.hips ?? "",
          length: g.length ?? "",
          otherMeasurements: g.otherMeasurements ?? "",
          notes: g.notes ?? "",
          donorId: g.donorId,
        }}
        donors={donors}
        suggestions={{ styles: opts.styles, colors: opts.colors, sizes: opts.sizes }}
        action={updateGownAction.bind(null, g.id)}
        cancelHref={`/inventory/${g.id}`}
      />
    </div>
  );
}
