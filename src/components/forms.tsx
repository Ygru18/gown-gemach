"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { CheckCircle2, AlertCircle, X, Loader2 } from "lucide-react";
import type { ActionResult } from "@/lib/actionTypes";
import { buttonClass, cx } from "./ui";

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

type Toast = { id: number; kind: "success" | "error"; text: string };
const ToastCtx = createContext<(kind: Toast["kind"], text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 9000 : 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cx(
              "pointer-events-auto flex max-w-lg items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-lift",
              t.kind === "success" ? "border-[#cfe5d6] bg-white text-[#2f5a3e]" : "border-red-200 bg-white text-red-800"
            )}
          >
            {t.kind === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{t.text}</span>
            <button className="ml-1 text-muted hover:text-ink" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** Shows ?msg=... as a toast once, then removes it from the URL. */
export function FlashFromQuery() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const msg = params.get("msg");
  const denied = params.get("denied");
  useEffect(() => {
    if (!msg && !denied) return;
    if (msg) toast("success", msg);
    if (denied) toast("error", "That area is for administrators only.");
    const next = new URLSearchParams(params.toString());
    next.delete("msg");
    next.delete("denied");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }, [msg, denied, params, pathname, router, toast]);
  return null;
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

interface FormCtxValue {
  pending: boolean;
  fieldErrors: Record<string, string>;
}
const FormCtx = createContext<FormCtxValue>({ pending: false, fieldErrors: {} });
export const useFormCtx = () => useContext(FormCtx);

export function FieldError({ name }: { name: string }) {
  const { fieldErrors } = useFormCtx();
  const msg = fieldErrors[name];
  return msg ? <p className="mt-1 text-[13px] text-red-700">{msg}</p> : null;
}

export interface ActionFormProps {
  action: (fd: FormData) => Promise<ActionResult>;
  children: ReactNode;
  className?: string;
  /** Toast on success (unless the action returns its own message). */
  successMessage?: string;
  /** Ask for confirmation before submitting. */
  confirm?: { title: string; body?: ReactNode; confirmLabel?: string; danger?: boolean };
  resetOnSuccess?: boolean;
  onSuccess?: (res: ActionResult) => void;
  /** Show errors inline at the top of the form, in addition to a toast. */
  inlineErrors?: boolean;
  id?: string;
}

export function ActionForm({ action, children, className, successMessage, confirm, resetOnSuccess, onSuccess, inlineErrors = true, id }: ActionFormProps) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const toast = useToast();

  const submit = () => {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    start(async () => {
      let res: ActionResult;
      try {
        res = await action(fd);
      } catch {
        res = { ok: false, error: "Could not reach the server. Please check your connection and try again." };
      }
      setResult(res);
      if (res.ok) {
        if (res.message || successMessage) toast("success", res.message ?? successMessage!);
        if (resetOnSuccess) form.reset();
        onSuccess?.(res);
        if (res.redirect) router.push(res.redirect);
        else router.refresh();
      } else {
        toast("error", res.error ?? "Please check the form.");
        if (res.redirect) router.push(res.redirect);
      }
    });
  };

  return (
    <FormCtx.Provider value={{ pending, fieldErrors: result?.ok ? {} : (result?.fieldErrors ?? {}) }}>
      <form
        id={id}
        ref={formRef}
        className={className}
        noValidate={false}
        onSubmit={(e) => {
          e.preventDefault();
          if (confirm) setAskOpen(true);
          else submit();
        }}
      >
        {inlineErrors && result && !result.ok && result.error ? (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/70 px-4 py-3 text-sm text-red-800" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{result.error}</span>
          </div>
        ) : null}
        {children}
      </form>
      {confirm ? (
        <ConfirmDialog
          open={askOpen}
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          onCancel={() => setAskOpen(false)}
          onConfirm={() => {
            setAskOpen(false);
            submit();
          }}
        />
      ) : null}
    </FormCtx.Provider>
  );
}

export function SubmitButton({ children, variant = "primary", size = "md", className, pendingLabel = "Saving…", disabled }: { children: ReactNode; variant?: Parameters<typeof buttonClass>[0]; size?: Parameters<typeof buttonClass>[1]; className?: string; pendingLabel?: string; disabled?: boolean }) {
  const { pending } = useFormCtx();
  return (
    <button type="submit" disabled={pending || disabled} className={buttonClass(variant, size, className)}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {pending ? pendingLabel : children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

export function ConfirmDialog({ open, title, body, confirmLabel = "Confirm", danger, onConfirm, onCancel }: { open: boolean; title: string; body?: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm">
      {body ? <div className="text-[15px] text-ink-soft">{body}</div> : null}
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className={buttonClass("secondary")} onClick={onCancel}>
          Go back
        </button>
        <button type="button" className={buttonClass(danger ? "danger" : "primary")} onClick={onConfirm} autoFocus>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function Modal({ open, onClose, title, subtitle, children, size = "md" }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; size?: "sm" | "md" | "lg" }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cx(
        "m-auto w-[calc(100%-2rem)] rounded-3xl border border-line bg-ivory p-0 text-ink shadow-lift backdrop:bg-[#3b3134]/30 backdrop:backdrop-blur-[2px]",
        size === "sm" ? "max-w-md" : size === "lg" ? "max-w-3xl" : "max-w-xl"
      )}
    >
      {open ? (
        <div className="max-h-[85dvh] overflow-y-auto p-6 sm:p-7">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 id={titleId} className="font-display text-2xl font-semibold">
                {title}
              </h2>
              {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
            </div>
            <button type="button" onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-blush-50 hover:text-ink" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}

/** A button that opens a modal containing an ActionForm. */
export function ModalAction({
  label,
  title,
  subtitle,
  action,
  children,
  submitLabel = "Save",
  variant = "secondary",
  size = "md",
  icon,
  successMessage,
  confirm,
  submitVariant = "primary",
  modalSize,
  disabled,
}: {
  label: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  action: (fd: FormData) => Promise<ActionResult>;
  children: ReactNode;
  submitLabel?: string;
  variant?: Parameters<typeof buttonClass>[0];
  size?: Parameters<typeof buttonClass>[1];
  icon?: ReactNode;
  successMessage?: string;
  confirm?: ActionFormProps["confirm"];
  submitVariant?: Parameters<typeof buttonClass>[0];
  modalSize?: "sm" | "md" | "lg";
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={buttonClass(variant, size)} onClick={() => setOpen(true)} disabled={disabled}>
        {icon}
        {label}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} subtitle={subtitle} size={modalSize}>
        <ActionForm action={action} successMessage={successMessage} onSuccess={() => setOpen(false)} confirm={confirm}>
          <div className="space-y-4">{children}</div>
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" className={buttonClass("secondary")} onClick={() => setOpen(false)}>
              Cancel
            </button>
            <SubmitButton variant={submitVariant}>{submitLabel}</SubmitButton>
          </div>
        </ActionForm>
      </Modal>
    </>
  );
}

/** Simple one-click action with optional confirmation (e.g. "Confirm reservation"). */
export function ActionButton({
  action,
  label,
  variant = "secondary",
  size = "md",
  icon,
  confirm,
  successMessage,
  hidden,
}: {
  action: (fd: FormData) => Promise<ActionResult>;
  label: ReactNode;
  variant?: Parameters<typeof buttonClass>[0];
  size?: Parameters<typeof buttonClass>[1];
  icon?: ReactNode;
  confirm?: ActionFormProps["confirm"];
  successMessage?: string;
  hidden?: Record<string, string>;
}) {
  return (
    <ActionForm action={action} confirm={confirm} successMessage={successMessage} inlineErrors={false} className="inline">
      {hidden ? Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />) : null}
      <SubmitButton variant={variant} size={size} pendingLabel="Working…">
        {icon}
        {label}
      </SubmitButton>
    </ActionForm>
  );
}
