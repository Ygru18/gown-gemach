"use client";

import { useEffect } from "react";
import { buttonClass } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="grid min-h-[70dvh] place-items-center px-4">
      <div className="card max-w-md p-8 text-center">
        <h1 className="font-display text-3xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted">Nothing was changed. Please try again — if the problem continues, let the administrator know{error.digest ? ` (reference ${error.digest})` : ""}.</p>
        <div className="mt-6 flex justify-center gap-2">
          <button type="button" onClick={reset} className={buttonClass("primary")}>Try again</button>
          <a href="/dashboard" className={buttonClass("secondary")}>Dashboard</a>
        </div>
      </div>
    </div>
  );
}
