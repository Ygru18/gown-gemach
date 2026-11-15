import { requireAdminPage } from "@/lib/auth/session";
import { getSettings } from "@/lib/services/settings";
import { centsToInput } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { PageHeader } from "@/components/ui";
import { SettingsForm } from "./SettingsForm";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireAdminPage();
  const s = await getSettings();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="Administration" title="Settings" subtitle={`Defaults used across the Gemach. Last saved ${formatDateTime(s.updatedAt, s.timezone)}.`} />
      <SettingsForm
        initial={{
          defaultRentalFeeCents: centsToInput(s.defaultRentalFeeCents),
          defaultDepositCents: centsToInput(s.defaultDepositCents),
          defaultRentalDays: s.defaultRentalDays,
          turnaroundBufferDays: s.turnaroundBufferDays,
          upcomingWindowDays: s.upcomingWindowDays,
          timezone: s.timezone,
          allowAssistantOverride: s.allowAssistantOverride,
          contactPhone: s.contactPhone ?? "",
          contactEmail: s.contactEmail ?? "",
          contactAddress: s.contactAddress ?? "",
          reservationTerms: s.reservationTerms ?? "",
        }}
      />
    </div>
  );
}
