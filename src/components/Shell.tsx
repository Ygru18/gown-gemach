"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Gift,
  CalendarHeart,
  Users,
  HeartHandshake,
  ClipboardCheck,
  ChartNoAxesColumn,
  UserCog,
  Settings,
  Menu,
  X,
  LogOut,
  KeyRound,
} from "lucide-react";
import { cx, DressIcon } from "./ui";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/intake", label: "Gown Intake", icon: Gift },
  { href: "/inventory", label: "Inventory", icon: DressIcon },
  { href: "/reservations", label: "Reservations", icon: CalendarHeart },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/donors", label: "Donors", icon: HeartHandshake },
  { href: "/returns", label: "Returns & Inspections", icon: ClipboardCheck },
  { href: "/reports", label: "Reports", icon: ChartNoAxesColumn },
  { href: "/staff", label: "Staff / Users", icon: UserCog, adminOnly: true },
  { href: "/settings", label: "Settings", icon: Settings, adminOnly: true },
] as const;

export function Monogram({ size = 44 }: { size?: number }) {
  return (
    <span className="relative grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-blush-100 to-champagne-100 ring-1 ring-gold-300" style={{ width: size, height: size }}>
      <span className="absolute inset-[3px] rounded-full ring-1 ring-gold-300/60" />
      <span className="font-display text-[15px] font-semibold tracking-[0.08em] text-gold-600" style={{ fontSize: size * 0.34 }}>
        CSF
      </span>
    </span>
  );
}

function NavLinks({ isAdmin, onNavigate, badges }: { isAdmin: boolean; onNavigate?: () => void; badges: Record<string, number> }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {NAV.filter((n) => !("adminOnly" in n) || isAdmin).map((n, i, arr) => {
        const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
        const Icon = n.icon;
        const sep = "adminOnly" in n && !("adminOnly" in (arr[i - 1] ?? {}));
        return (
          <div key={n.href}>
            {sep ? <div className="mx-3 my-3 border-t border-line" /> : null}
            <Link
              href={n.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cx(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14.5px] transition",
                active ? "bg-gradient-to-r from-blush-100 to-blush-50 font-medium text-blush-700 shadow-[inset_0_0_0_1px_rgb(236_185_188/0.6)]" : "text-ink-soft hover:bg-champagne-50 hover:text-ink"
              )}
            >
              <Icon className={cx("h-[18px] w-[18px] shrink-0", active ? "text-blush-600" : "text-muted group-hover:text-gold-500")} />
              <span className="flex-1">{n.label}</span>
              {badges[n.href] ? (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-blush-500 px-1.5 text-[11px] font-semibold text-white">{badges[n.href]}</span>
              ) : null}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-3">
      <Monogram />
      <span className="leading-tight">
        <span className="block font-display text-[19px] font-semibold text-ink">Chaya Surah Feldman</span>
        <span className="block text-[11px] tracking-[0.28em] text-gold-600 uppercase">Gown Gemach</span>
      </span>
    </Link>
  );
}

function UserBox({ name, role, signOut }: { name: string; role: string; signOut: () => Promise<void> }) {
  return (
    <div className="rounded-2xl border border-line bg-white/70 p-3">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-champagne-100 font-display text-base font-semibold text-gold-600">
          {name
            .split(/\s+/)
            .map((p) => p[0])
            .slice(0, 2)
            .join("")
            .toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{name}</p>
          <p className="text-[11px] tracking-[0.14em] text-muted uppercase">{role === "ADMIN" ? "Administrator" : "Assistant"}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-1.5">
        <Link href="/account" className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[12.5px] text-ink-soft hover:bg-champagne-50">
          <KeyRound className="h-3.5 w-3.5" /> Account
        </Link>
        <form action={signOut} className="flex-1">
          <button className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-[12.5px] text-ink-soft hover:bg-blush-50 hover:text-blush-700">
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </form>
      </div>
    </div>
  );
}

export function Shell({ children, staff, signOut, badges }: { children: ReactNode; staff: { fullName: string; role: string }; signOut: () => Promise<void>; badges: Record<string, number> }) {
  const [open, setOpen] = useState(false);
  const isAdmin = staff.role === "ADMIN";
  return (
    <div className="min-h-dvh lg:pl-[272px]">
      {/* Desktop sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-[272px] flex-col border-r border-line bg-ivory/95 px-4 py-6 lg:flex">
        <div className="px-2">
          <Brand />
        </div>
        <div className="mx-2 my-6 ornament" />
        <div className="flex-1 overflow-y-auto">
          <NavLinks isAdmin={isAdmin} badges={badges} />
        </div>
        <p className="mx-2 mt-4 mb-3 text-center font-display text-[13px] leading-snug text-muted italic">In loving memory of Chaya Surah Feldman</p>
        <UserBox name={staff.fullName} role={staff.role} signOut={signOut} />
      </aside>

      {/* Mobile top bar */}
      <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-line bg-ivory/90 px-4 py-3 backdrop-blur lg:hidden">
        <Brand />
        <button onClick={() => setOpen(true)} className="rounded-full p-2 text-ink-soft hover:bg-blush-50" aria-label="Open menu">
          <Menu className="h-6 w-6" />
        </button>
      </header>
      {open ? (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-[86%] max-w-xs flex-col bg-ivory px-4 py-5 shadow-lift">
            <div className="mb-4 flex justify-end">
              <button onClick={() => setOpen(false)} className="rounded-full p-2 text-ink-soft hover:bg-blush-50" aria-label="Close menu">
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <NavLinks isAdmin={isAdmin} onNavigate={() => setOpen(false)} badges={badges} />
            </div>
            <UserBox name={staff.fullName} role={staff.role} signOut={signOut} />
          </div>
        </div>
      ) : null}

      <main className="mx-auto w-full max-w-[1320px] px-4 py-7 sm:px-6 lg:px-10 lg:py-10">{children}</main>
    </div>
  );
}
