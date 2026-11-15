import Link from "next/link";
import { requireStaffPage } from "@/lib/auth/session";
import { PasswordForm } from "./PasswordForm";
import { Monogram } from "@/components/Shell";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "My account" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ first?: string }> }) {
  const staff = await requireStaffPage({ allowPasswordChange: true });
  const { first } = await searchParams;
  const mustChange = staff.mustChangePassword || first === "1";
  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <Monogram size={60} />
          <h1 className="mt-4 font-display text-3xl font-semibold">{mustChange ? "Choose your password" : "My account"}</h1>
          <p className="mt-1 text-sm text-muted">
            {staff.fullName} · {staff.email} · {staff.role === "ADMIN" ? "Administrator" : "Assistant"}
          </p>
        </div>
        <div className="card p-7">
          {mustChange ? <p className="mb-5 rounded-xl bg-champagne-50 px-4 py-3 text-sm text-ink-soft">For your security, please replace the temporary password you were given.</p> : null}
          <PasswordForm />
        </div>
        {!staff.mustChangePassword ? (
          <Link href="/dashboard" className="mt-6 flex items-center justify-center gap-2 text-sm text-ink-soft hover:text-blush-700">
            <ArrowLeft className="h-4 w-4" /> Back to the dashboard
          </Link>
        ) : null}
      </div>
    </div>
  );
}
