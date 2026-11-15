"use client";

import { ActionForm, FieldError, SubmitButton, ToastProvider } from "@/components/forms";
import { setupAction } from "@/app/actions/auth";

export function SetupForm({ localMode }: { localMode: boolean }) {
  return (
    <ToastProvider>
      <ActionForm action={setupAction} className="space-y-4">
        <div>
          <label className="label" htmlFor="setupToken">Setup code</label>
          <input id="setupToken" name="setupToken" className="input" required defaultValue={localMode ? "local-test" : ""} autoComplete="off" />
          <p className="mt-1 text-[12px] text-muted">The one-time code you were given with the deployment instructions.</p>
          <FieldError name="setupToken" />
        </div>
        <div>
          <label className="label" htmlFor="fullName">Your full name</label>
          <input id="fullName" name="fullName" className="input" required autoComplete="name" />
          <FieldError name="fullName" />
        </div>
        <div>
          <label className="label" htmlFor="email">Email (used to sign in)</label>
          <input id="email" name="email" type="email" className="input" required autoComplete="email" />
          <FieldError name="email" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" name="password" type="password" minLength={10} className="input" required autoComplete="new-password" />
            <FieldError name="password" />
          </div>
          <div>
            <label className="label" htmlFor="confirmPassword">Confirm password</label>
            <input id="confirmPassword" name="confirmPassword" type="password" className="input" required autoComplete="new-password" />
            <FieldError name="confirmPassword" />
          </div>
        </div>
        <p className="text-[12px] text-muted">At least 10 characters.</p>
        <SubmitButton className="w-full" size="lg" pendingLabel="Creating account…">Create administrator account</SubmitButton>
      </ActionForm>
    </ToastProvider>
  );
}
