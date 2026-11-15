import { Suspense } from "react";
import { requireStaffPage } from "@/lib/auth/session";
import { Shell } from "@/components/Shell";
import { ToastProvider, FlashFromQuery } from "@/components/forms";
import { signOutAction } from "@/app/actions/auth";
import { prisma } from "@/lib/db";
import { toDbDate, todayYmd } from "@/lib/dates";
import { getSettings } from "@/lib/services/settings";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaffPage();
  const settings = await getSettings();
  const today = todayYmd(settings.timezone);
  const [pending, inspection, overdue] = await Promise.all([
    prisma.reservation.count({ where: { status: "PENDING" } }),
    prisma.gown.count({ where: { status: "PENDING_INSPECTION" } }),
    prisma.reservationItem.count({ where: { status: "CHECKED_OUT", expectedReturnDate: { lt: toDbDate(today) } } }),
  ]);
  return (
    <ToastProvider>
      <Suspense>
        <FlashFromQuery />
      </Suspense>
      <Shell staff={{ fullName: staff.fullName, role: staff.role }} signOut={signOutAction} badges={{ "/reservations": pending, "/returns": inspection + overdue }}>
        {children}
      </Shell>
    </ToastProvider>
  );
}
