import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentStaff } from "@/lib/auth/session";
import { needsSetup } from "@/lib/services/staff";
import { LoginForm } from "./LoginForm";
import { Monogram } from "@/components/Shell";
import { Ornament } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentStaff()) redirect("/dashboard");
  const firstRun = await needsSetup();
  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute -top-40 -left-40 h-[480px] w-[480px] rounded-full bg-blush-100/70 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 -bottom-40 h-[520px] w-[520px] rounded-full bg-champagne-100/80 blur-3xl" />
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Monogram size={72} />
          <h1 className="mt-5 font-display text-[2.4rem] leading-tight font-semibold text-ink">Chaya Surah Feldman</h1>
          <p className="mt-1 text-[12px] tracking-[0.34em] text-gold-600 uppercase">Gown Gemach</p>
        </div>
        <div className="card p-7 sm:p-8">
          <h2 className="font-display text-2xl font-semibold">Welcome back</h2>
          <p className="mt-1 mb-6 text-sm text-muted">Sign in to manage the Gemach.</p>
          <LoginForm />
          {firstRun ? (
            <p className="mt-6 rounded-xl bg-champagne-50 px-4 py-3 text-center text-sm text-ink-soft">
              First time here?{" "}
              <Link href="/setup" className="font-medium text-blush-600 underline-offset-2 hover:underline">
                Create the administrator account
              </Link>
            </p>
          ) : null}
        </div>
        <div className="mt-10 text-center">
          <p className="eyebrow">In Loving Memory</p>
          <Ornament className="my-3" />
          <p className="mx-auto max-w-sm font-display text-lg leading-snug text-ink-soft italic">
            Sharing beauty, kindness and generosity in loving memory of Chaya Surah Feldman.
          </p>
        </div>
      </div>
    </div>
  );
}
