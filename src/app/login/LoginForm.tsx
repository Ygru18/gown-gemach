"use client";

import { ActionForm, SubmitButton, ToastProvider } from "@/components/forms";
import { signInAction } from "@/app/actions/auth";

export function LoginForm() {
  return (
    <ToastProvider>
      <ActionForm action={signInAction} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
        </div>
        <SubmitButton className="w-full" size="lg" pendingLabel="Signing in…">
          Sign in
        </SubmitButton>
      </ActionForm>
    </ToastProvider>
  );
}
