import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "gold";
const variants: Record<Variant, string> = {
  primary: "bg-blush-600 text-white hover:bg-blush-700 shadow-[0_6px_16px_-6px_rgb(168_90_100/0.55)]",
  gold: "bg-gold-500 text-white hover:bg-gold-600 shadow-[0_6px_16px_-6px_rgb(184_149_90/0.6)]",
  secondary: "bg-white text-ink border border-line-strong hover:border-gold-400 hover:bg-champagne-50",
  ghost: "text-ink-soft hover:bg-blush-50 hover:text-blush-700",
  danger: "bg-white text-red-700 border border-red-200 hover:bg-red-50",
};
const sizes = { sm: "h-8 px-3 text-[13px] gap-1.5", md: "h-10 px-4 text-sm gap-2", lg: "h-12 px-6 text-[15px] gap-2" };

export function buttonClass(variant: Variant = "primary", size: keyof typeof sizes = "md", extra?: string) {
  return cx(
    "inline-flex items-center justify-center rounded-full font-medium tracking-wide transition whitespace-nowrap disabled:opacity-50 disabled:pointer-events-none",
    variants[variant],
    sizes[size],
    extra
  );
}

export function Button({ variant = "primary", size = "md", className, ...props }: ComponentProps<"button"> & { variant?: Variant; size?: keyof typeof sizes }) {
  return <button type="button" className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({ variant = "primary", size = "md", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: keyof typeof sizes }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function Card({ className, children, ...rest }: ComponentProps<"div">) {
  return (
    <div className={cx("card", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, icon }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {icon ? <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blush-50 text-blush-600">{icon}</span> : null}
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: string; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
        <h1 className="font-display text-[2.1rem] leading-tight font-semibold text-ink sm:text-[2.5rem]">{title}</h1>
        {subtitle ? <p className="mt-1.5 max-w-2xl text-[15px] text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="no-print flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon ? <div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-blush-50 text-blush-400">{icon}</div> : null}
      <h3 className="font-display text-xl font-semibold text-ink">{title}</h3>
      {children ? <p className="mt-1.5 max-w-sm text-sm text-muted">{children}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Field({ label, name, error, hint, required, children, className }: { label: string; name?: string; error?: string; hint?: ReactNode; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="label" htmlFor={name}>
        {label}
        {required ? <span className="ml-0.5 text-blush-500">*</span> : <span className="ml-1.5 text-[11px] font-normal text-muted/80">optional</span>}
      </label>
      {children}
      {error ? <p className="mt-1 text-[13px] text-red-700">{error}</p> : hint ? <p className="mt-1 text-[12px] text-muted">{hint}</p> : null}
    </div>
  );
}

export function Pill({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap ring-1 ring-inset", TONES[tone], className)}>{children}</span>;
}

export type Tone = "green" | "champagne" | "blush" | "mauve" | "amber" | "sky" | "peach" | "stone" | "grey" | "red" | "neutral" | "gold";
export const TONES: Record<Tone, string> = {
  green: "bg-[#ebf4ee] text-[#3d6a4c] ring-[#cfe5d6]",
  champagne: "bg-champagne-100 text-[#86672c] ring-champagne-200",
  blush: "bg-blush-100 text-blush-700 ring-blush-200",
  mauve: "bg-[#f0e8f4] text-[#6a4b7c] ring-[#e0d0ea]",
  amber: "bg-[#fcefdc] text-[#93602a] ring-[#f4dcb7]",
  sky: "bg-[#e6eff7] text-[#3e6285] ring-[#cfe0ef]",
  peach: "bg-[#fce9df] text-[#985237] ring-[#f5d3c2]",
  stone: "bg-[#efebe7] text-[#675e58] ring-[#e0d9d2]",
  grey: "bg-[#e9e6e4] text-[#57504d] ring-[#d8d3d0]",
  red: "bg-[#fde4e4] text-[#a2353a] ring-[#f5c6c8]",
  neutral: "bg-white text-ink-soft ring-line-strong",
  gold: "bg-champagne-50 text-gold-600 ring-gold-300",
};

export function Dot({ tone }: { tone: Tone }) {
  return <span className={cx("h-1.5 w-1.5 rounded-full bg-current opacity-80")} data-tone={tone} />;
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium tracking-[0.14em] text-muted uppercase">{label}</dt>
      <dd className="mt-1 text-[15px] break-words text-ink">{children ?? "—"}</dd>
    </div>
  );
}

export function Ornament({ className }: { className?: string }) {
  return (
    <div className={cx("flex items-center justify-center gap-3 text-gold-400", className)} aria-hidden>
      <span className="ornament w-16" />
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
        <path d="M12 3c1.5 3 4 4.5 7 4.5-3 0-5.5 1.5-7 4.5-1.5-3-4-4.5-7-4.5 3 0 5.5-1.5 7-4.5Z" />
        <path d="M12 14c.8 1.6 2.1 2.4 3.7 2.4-1.6 0-2.9.8-3.7 2.4-.8-1.6-2.1-2.4-3.7-2.4 1.6 0 2.9-.8 3.7-2.4Z" />
      </svg>
      <span className="ornament w-16" />
    </div>
  );
}

export function GownSilhouette({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 160" className={className} fill="none" aria-hidden>
      <path d="M50 18c0-6 4-10 10-10s10 4 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M48 22h24l-3 26 7 8c10 22 20 52 24 86H20c4-34 14-64 24-86l7-8-3-26Z" fill="currentColor" opacity=".18" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M44 56c10 4 22 4 32 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M38 90c4 22 2 38-4 52M60 64v78M82 90c-4 22-2 38 4 52" stroke="currentColor" strokeWidth="1.2" opacity=".5" strokeLinecap="round" />
    </svg>
  );
}

export function DressIcon({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9.2 3l.7 4.2-.6 3.3L5.5 21h13l-3.8-10.5-.6-3.3.7-4.2" />
      <path d="M9.9 7.2c1.3.7 2.9.7 4.2 0" />
      <path d="M9.3 10.5h5.4" />
    </svg>
  );
}
