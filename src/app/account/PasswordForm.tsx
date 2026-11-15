"use client";

import { ActionForm, FieldError, SubmitButton, ToastProvider } from "@/components/forms";
import { changePasswordAction } from "@/app/actions/auth";

export function PasswordForm() {
  return (
    <ToastProvider>
      <ActionForm action={changePasswordAction} className="space-y-4" resetOnSuccess hardRedirect>
        <div>
          <label className="label" htmlFor="newPassword">New password</label>
          <input id="newPassword" name="newPassword" type="password" minLength={10} required className="input" autoComplete="new-password" />
          <FieldError name="newPassword" />
        </div>
        <div>
          <label className="label" htmlFor="confirmPassword">Confirm new password</label>
          <input id="confirmPassword" name="confirmPassword" type="password" required className="input" autoComplete="new-password" />
          <FieldError name="confirmPassword" />
        </div>
        <p className="text-[12px] text-muted">At least 10 characters.</p>
        <SubmitButton className="w-full">Save new password</SubmitButton>
      </ActionForm>
    </ToastProvider>
  );
}
