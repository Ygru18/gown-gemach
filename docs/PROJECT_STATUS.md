# Chaya Surah Feldman A"H Gown Gemach — Project Status & Handoff

*Last updated: November 16, 2026*

## 1. What this is

A private management web app for a gown gemach: donated gowns are taken in, photographed, lent to customers for a small fee, returned, inspected, cleaned/altered, and lent again. Used by an administrator and assistants. Built so a public-facing site (browse, check availability, reserve, pay) can be added later without a rebuild.

**Status: live in production.** The first administrator account was created on the deployed site; no errors in database, auth, or storage logs.

## 2. Where everything lives

| Item | Location |
|---|---|
| Source code | GitHub `Ygru18/gown-gemach` (private), branch `main` |
| Hosting | Vercel project `gown-gemach`, auto-deploys every push to `main` |
| Database / Auth / Storage | Supabase project `gown-gemach` (ref `ugqgrepactaujoodlcex`, region ca-central-1, free plan) |
| Photo storage | Private Supabase Storage bucket `gown-photos` (no public access, JPEG only, 10 MB max) |
| Setup & maintenance guide | `README.md` in the repo |

Separate and untouched: the Verizon Bill Manager app (repo `Ygru18/verizon-bill-manager`, Supabase `verizon-bill-manager`). Its test database `verizon-bill-manager-preview` was **paused** (not deleted) to free a free-plan project slot; restore it from the Supabase dashboard when needed (free plan allows only 2 active projects).

## 3. Technology stack

Same foundation as the Verizon Bill Manager:
- Next.js 16.3.5 (App Router, Turbopack, `src/proxy.ts`), React 19.3, TypeScript 6.0.3 (pinned — Next.js tooling doesn't support TS 7 yet)
- Tailwind CSS 4.3, lucide-react icons, self-hosted fonts via Fontsource (Cormorant Garamond + Jost). `next/font/google` was dropped because of a Turbopack build bug.
- Prisma 7.10 with the `@prisma/adapter-pg` driver adapter; zod 4 for validation
- Supabase: Postgres 17, Auth (email + password), Storage
- Vitest (unit + integration), Playwright (browser end-to-end)

## 4. Features delivered

- **Dashboard:** dedication ("In Loving Memory — Sharing beauty, kindness and generosity in loving memory of Chaya Surah Feldman A"H."), 12 clickable summary cards (inventory, available, pending/confirmed reservations, checked out, pending inspection, cleaning, alterations, other unavailable, overdue, outstanding payments, outstanding deposits), upcoming pickups/returns, overdue list, recently added/returned gowns, recent reservations, recent activity.
- **Overdue + upcoming-reservation warning:** prominent "ATTENTION" panel on the dashboard, customer profile and reservations page when a customer has an overdue gown and another upcoming reservation. Nothing is cancelled automatically.
- **Gown intake:** auto Gown ID (G-0001), required description/style/size/color, optional designer, donor (existing or new, entirely optional), condition, measurements, notes, multiple photos with a main photo.
- **Inventory:** gallery and table views; search (ID, description, style, color, designer, donor); filters (status, size, color, style, donor, date added); sorting; gown detail page with photos + lightbox, all details, reservation/condition/cleaning/alteration/status history.
- **Customers:** auto Customer ID (C-0001); name + phone required, **email never required**; duplicate detection with "this is a different person" override; profile with current/previous reservations, gowns borrowed, payments, balances, deposits, pickups, returns, late returns; mark inactive (history kept).
- **Donors:** auto Donor ID, all contact info optional, donated-gowns gallery, search/filter, archive.
- **Reservations — two-step:** Pending (request; doesn't hold the gown) → Confirm (re-checks availability, holds the gown). Multiple gowns per reservation, each with its own dates and fee. Can be started from inventory, reservations or a customer profile; new customers can be added inside the workflow. Live availability while choosing gowns. Calendar (month) and list views. Cancel a whole reservation or a single gown, with reason and who/when recorded.
- **Double-booking prevention:** a Postgres exclusion constraint makes overlapping holds on the same gown impossible, even with simultaneous confirmations. Pending overlaps show as warnings. Configurable turnaround buffer days. Administrator override with required reason + audit entry (can be extended to assistants in Settings).
- **Payments & security deposits** (integer cents everywhere): separate ledgers for rental fees (payment, refund, waiver) and refundable deposits (collected, returned, retained). Multiple/partial payments, edit and void (voids stay visible), automatic balances and statuses (Unpaid, Partially Paid, Paid, Refunded, Waived). Methods: cash, check, other.
- **Pickup:** per gown; records date, condition, notes and who processed it. Reservation and gown become Checked Out.
- **Returns & inspections:** return records date, condition, damage notes and damage photos, and days late. The gown goes to **Pending Inspection** — never straight to Available. Inspection outcomes: Ready / Needs cleaning / Needs alteration / Damaged / Other.
- **Cleaning & alterations:** tracked jobs (dates, assignee, cost, notes). Completing the last open job can mark the gown ready; otherwise it returns to inspection.
- **Archive vs dispose:** archive (restorable, comes back via inspection); dispose (permanent, blocks future reservations). Both keep full history. Permanent delete is admin-only and allowed only for gowns with no history.
- **Reports:** inventory, donations (by date range and by donor), reservations (by month, date range, cancelled, most borrowed), customers (rental and payment history), overdue and late returns, financial (rental income vs refundable deposits kept separate), activity log. Date filters, CSV export (formula-injection safe), printer-friendly layout.
- **Staff / Users (admin only):** create accounts with a temporary password (forced change on first sign-in), edit role, reset password, deactivate (blocks login, keeps history). Cannot remove the last admin or deactivate yourself.
- **Settings (admin only):** default fee, deposit, rental length, turnaround buffer, dashboard look-ahead, time zone, assistant override toggle, contact details, rental terms.
- **Audit history:** every important action is logged with the staff member's name and time.
- **Design:** bridal-boutique palette (blush, ivory, champagne, beige, gold), elegant typography, rounded cards, soft status badges; responsive for desktop, tablet and phone. The name is defined once in `src/lib/brand.ts` (`HONOREE`, `APP_NAME`, `DEDICATION`).

Not built, as agreed: accessory tracking, the public website (architecture prepared — see section 9).

## 5. Roles & permissions (enforced server-side)

Assistants have **all** operational capabilities. Only four restrictions: they cannot (1) manage users/assistants, (2) change settings, (3) manage logins/credentials/permissions, (4) permanently delete inventory records. Availability override is admin-only unless the admin enables it for assistants. Enforced in every service function (`src/lib/permissions.ts` → `assertCan`), not by hiding buttons.

## 6. Security model

- Every page and server action re-verifies the Supabase session (`getUser`) and requires an **active** staff record. `proxy.ts` only refreshes cookies.
- All data access is server-side via Prisma, connecting as the `postgres` role (table owner).
- **Supabase Data API locked down:** RLS enabled on every table with no policies (deny-all); `anon`/`authenticated` hold no privileges, and default privileges for future tables are revoked too. Verified on production: public reads are denied.
- Photos: private bucket, no storage policies; access only through short-lived signed URLs issued by the server after a permission check. Images are resized in the browser before upload.
- Secrets live only in Vercel environment variables (server-only); none prefixed `NEXT_PUBLIC_`. CSP, HSTS, frame-deny and no-index headers are set.

## 7. Database

- Schema: `prisma/schema.prisma`. Migrations: `prisma/migrations/` — `20261115230416_init` (tables, indexes, exclusion constraint, money checks, single-primary-photo rule, RLS lock-down) and `20261116090000_lockdown_default_privileges`.
- Both migrations are **already applied** to production and recorded in `_prisma_migrations`. The Vercel build runs `prisma generate && prisma migrate deploy && next build`, so future migrations apply on deploy.
- Conventions: money = integer cents; calendar dates = `DATE`; human IDs G-/C-/D-/R- plus UUID keys; nothing historical is hard-deleted.
- Overdue is computed from dates (no stored "overdue" flag). "Pending Reservation"/"Reserved" gown statuses are derived from active reservations; work and terminal states (inspection, cleaning, alteration, unavailable, archived, disposed) are never overridden by reservations.

## 8. Environment variables (names only)

`DATABASE_URL` (transaction pooler, `?pgbouncer=true`), `DIRECT_URL` (session pooler, used by migrations), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only; signs photo URLs and manages staff logins), `SUPABASE_STORAGE_BUCKET=gown-photos`, `SETUP_TOKEN` (one-time `/setup` code; no longer needed now that the admin exists — safe to delete from Vercel).

## 9. Future public website (prepared, not built)

Gowns have `isPubliclyListed` and `publicDescription`. `src/lib/public/catalog.ts` is the only approved data source for anonymous visitors — a strict whitelist that never touches donors, customers, notes, payments or staff. Build it as a separate route group (e.g. `src/app/(public)`); public requests should create **Pending** reservations so staff keep the two-step confirmation; online payments would add a payment method plus a webhook that records a `Payment`.

## 10. Testing

- `npm run typecheck`, `npm run lint` — clean.
- `npm test` — 52 Vitest unit + integration tests against a real Postgres test database: permissions for both roles, intake/photos, customers without email + duplicates, two-step reservations, double booking (including simultaneous confirmations and raw inserts), override auditing, multi-gown reservations, pickup, return → pending inspection, inspection/cleaning/alteration flows, overdue + upcoming warnings, archive/dispose/delete rules, payments/refunds/waivers/deposits, reports, staff management, first-run setup.
- `npm run test:e2e` — 16-step browser walkthrough (settings, intake with photos, new customer, reservation, confirm, payment + deposit, pickup, refused double booking, return with damage photos, inspection, cleaning → ready, settle balance, dashboard/calendar, all reports + CSV, assistant restrictions, mobile layout). All passing.
- Production checks: double booking rejected by the live database; public role denied; admin account created through the deployed site; no log errors.
- Local development: `npm run dev:local` uses a local Postgres plus a local stand-in for Supabase Auth/Storage (`E2E_LOCAL_MODE=1`; only works under `next dev` outside Vercel).

## 11. Open items & caveats

1. **Vercel build log not reviewed by Claude** — the Vercel connector can't see the `gown-gemach` project. The deployment was verified through the database instead.
2. **Confirm public sign-ups are disabled** in Supabase → Authentication → Sign In / Providers (staff accounts are created inside the app).
3. **Free-plan limits:** projects auto-pause after about a week of inactivity, and there are no restorable backups. Recommendation: Supabase Pro (~$45/month for the three projects) — no auto-pause, daily backups, and the Verizon preview database back. Until then, export CSV reports periodically.
4. Delete `SETUP_TOKEN` from Vercel (optional; `/setup` is permanently disabled once an admin exists).
5. Minor: the first sign-in performed by `/setup` doesn't set `lastLoginAt`; regular sign-ins do.

## 12. Suggested next steps

1. Admin: sign in, set defaults in Settings, add assistants under Staff / Users, start entering gowns.
2. Decide on Supabase Pro (see 11.3).
3. Later phases: public catalogue and reservation requests, online payments, optional SMS/email reminders for pickups and overdue returns.
