import { redirect } from "next/navigation";
import { needsSetup } from "@/lib/services/staff";
import { SetupForm } from "./SetupForm";
import { Monogram } from "@/components/Shell";
import { isLocalTestMode } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "First-time setup" };

export default async function SetupPage() {
  if (!(await needsSetup())) redirect("/login");
  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex flex-col items-center text-center">
          <Monogram size={64} />
          <h1 className="mt-4 font-display text-3xl font-semibold">Welcome to your Gemach</h1>
          <p className="mt-2 max-w-sm text-sm text-muted">Create the administrator account. This page works only once, while no accounts exist.</p>
        </div>
        <div className="card p-7">
          <SetupForm localMode={isLocalTestMode()} />
        </div>
      </div>
    </div>
  );
}
