import Link from "next/link";
import { GownSilhouette, buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="text-center">
        <GownSilhouette className="mx-auto h-32 w-24 text-blush-300" />
        <h1 className="mt-4 font-display text-3xl font-semibold">We couldn&apos;t find that page</h1>
        <p className="mt-2 text-muted">It may have been moved, or the link is incomplete.</p>
        <Link href="/dashboard" className={buttonClass("primary", "md", "mt-6")}>Back to the dashboard</Link>
      </div>
    </div>
  );
}
