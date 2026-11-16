# Chaya Surah Feldman A"H Gown Gemach

*In Loving Memory — Sharing beauty, kindness and generosity in loving memory of Chaya Surah Feldman A"H.*

A private management application for the Gown Gemach: gown intake with photographs, inventory, customers, donors, a two-step reservation workflow with double-booking prevention, payments and security deposits, pickups, returns, inspections, cleaning and alterations, overdue tracking, reports with CSV export, and a full audit history.

**Stack** (same foundation as the Verizon Bill Manager): Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Prisma 7 (driver adapter `@prisma/adapter-pg`) · Supabase (Postgres, Auth, Storage) · Vercel · GitHub.

---

## Contents

1. [How it is organised](#how-it-is-organised)
2. [Roles & permissions](#roles--permissions)
3. [Security model](#security-model)
4. [First-time setup (Supabase + Vercel)](#first-time-setup)
5. [Creating the administrator and assistants](#creating-the-administrator-and-assistants)
6. [Local development](#local-development)
7. [Tests](#tests)
8. [Database & migrations](#database--migrations)
9. [Backups & recovery](#backups--recovery)
10. [Maintenance & updates](#maintenance--updates)
11. [Future public website](#future-public-website)

---

## How it is organised

```
prisma/
  schema.prisma                 Data model (money = integer cents, dates = DATE)
  migrations/                   SQL migrations, incl. hand-written constraints & RLS
supabase/setup.sql              One-time Supabase project setup (role, extension, bucket)
src/
  app/(app)/…                   Signed-in pages (dashboard, intake, inventory, …)
  app/actions/                  Server actions — thin wrappers around services
  app/login, setup, account     Sign-in, first-run setup, change password
  components/                   UI (boutique design system, forms, gallery, calendar…)
  lib/services/                 ALL business rules & authorization (testable, no UI)
  lib/permissions.ts            Role → permission map (assistants: 4 restrictions only)
  lib/finance.ts                Payment / deposit math (pure, unit-tested)
  lib/gownStatus.ts             Gown & reservation status rules (pure, unit-tested)
  lib/public/catalog.ts         The only approved data source for a future public site
tests/                          Vitest unit + integration tests (real Postgres)
e2e/workflow.e2e.cjs            Browser end-to-end test of the main workflows
```

### Key workflows

* **Gown intake** → every gown gets an automatic ID (`G-0001`), optional donor, measurements and any number of photos (one is the main photo). Saved gowns appear in inventory as *Available*.
* **Reservations are two-step.** Step 1 records a *Pending Reservation* (it does not hold the gown). Step 2 *Confirm* re-checks availability and holds the gown for the dates. Each gown in a reservation has its own dates and fee.
* **Double booking is impossible**: a Postgres exclusion constraint rejects overlapping held dates for the same gown, even when two people confirm at the same moment. Pending requests show as warnings. An administrator may override a conflict (reason required, recorded in the audit log); this can be extended to assistants in Settings.
* **Pickup** → gown and reservation become *Checked Out*.
* **Return** → the gown goes to **Pending Inspection** — never straight to Available. The inspection decides: *Ready*, *Needs cleaning*, *Needs alteration*, *Damaged / Unavailable*, or *Other*. Cleaning/alteration jobs are tracked; completing the last one can mark the gown ready.
* **Overdue** is computed automatically each day. Customers with an overdue gown **and** another upcoming reservation get a prominent warning on the dashboard, the customer profile and the reservations page. Nothing is cancelled automatically.
* **Money**: rental fees (payments, refunds, waivers) and refundable security deposits (collected, returned, retained) are separate ledgers. Entries can be edited or voided (voids stay visible); balances and payment status are calculated automatically.
* **Archive vs dispose**: archive removes a gown from active inventory (restorable); dispose is permanent. Both keep all history. Only an administrator can permanently delete a gown, and only one with no history (e.g. entered by mistake).

## Roles & permissions

| | Administrator | Assistant |
|---|:---:|:---:|
| All daily operations (gowns, photos, customers, donors, reservations, confirmations, cancellations, payments, deposits, pickups, returns, inspections, cleaning, alterations, archive, dispose, reports, exports) | ✓ | ✓ |
| Manage staff / users | ✓ | — |
| Change system settings | ✓ | — |
| Manage logins, credentials, permissions | ✓ | — |
| Permanently delete inventory records | ✓ | — |
| Override an availability conflict | ✓ | only if enabled in Settings |

Permissions are enforced **on the server** in every service function (`assertCan`), not by hiding buttons. Every important action is written to the activity log with the staff member's name.

## Security model

* **Authentication**: Supabase Auth (email + password). Every page and server action re-verifies the session with Supabase (`getUser`) and requires an *active* staff record. `src/proxy.ts` only refreshes cookies.
* **Database access** happens only on the server through Prisma, connecting as the project's `postgres` role (the table owner, which bypasses RLS).
* **Supabase Data API is locked**: Row Level Security is enabled on every table with *no* policies, and the `anon`/`authenticated` roles have no privileges. Even with the public anon key, nobody can read or write data directly.
* **Photos** are in a *private* bucket. The server issues short-lived signed URLs to signed-in staff only; browsers upload with one-time signed upload URLs after a permission check. Images are resized in the browser (max 2000px) before upload.
* **Secrets**: `SUPABASE_SERVICE_ROLE_KEY` and database URLs are server-only environment variables; nothing secret is prefixed `NEXT_PUBLIC_`.
* Security headers (CSP, HSTS, frame-deny, no-index) are set in `next.config.ts`. CSV exports neutralise spreadsheet formula injection.

## First-time setup

> These steps are needed once. Values are entered directly into the Supabase and Vercel dashboards — never paste passwords or keys into chat or commit them.

1. **Supabase project** — create a project (e.g. `gown-gemach`).
2. **Run `supabase/setup.sql`** in the Supabase SQL editor. It creates the `btree_gist` extension and the private `gown-photos` bucket. (Already done for the production project.)
3. **Turn off public sign-ups**: Supabase → Authentication → Sign In / Providers → disable *Allow new users to sign up*. (Staff accounts are created by the administrator inside the app.)
4. **Vercel project** — import this GitHub repository (framework: Next.js). Add these environment variables (Production, Preview, Development):

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Supabase → **Connect** → *Transaction pooler* URI (port 6543) with your database password filled in, plus `?pgbouncer=true` at the end |
   | `DIRECT_URL` | Supabase → **Connect** → *Session pooler* URI (port 5432) with your database password filled in |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API Keys → publishable (or legacy anon) key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → **secret** (or legacy service_role) key — mark *Sensitive* |
   | `SUPABASE_STORAGE_BUCKET` | `gown-photos` |
   | `SETUP_TOKEN` | any long random string (one-time setup code) |

5. **Deploy.** The build runs `prisma generate && prisma migrate deploy && next build`, so the database tables are created automatically on the first deployment.
6. **Supabase Auth URL** (optional): Authentication → URL Configuration → set *Site URL* to the Vercel production URL.

## Creating the administrator and assistants

* **First administrator**: open `https://<your-app>/setup`, enter the `SETUP_TOKEN` code, your name, email and a password (10+ characters). The page only works while no staff accounts exist; afterwards it is permanently disabled.
* **Assistants**: as administrator, go to **Staff / Users → Add staff member**. Enter their name, email, role and a temporary password, and give them the password privately. On first sign-in they must choose their own password.
* **Forgotten password**: Staff / Users → *Reset password* sets a new temporary password.
* **Someone leaves**: *Deactivate* blocks sign-in immediately; everything they recorded stays in the history.

## Local development

Requirements: Node 20.9+ and PostgreSQL 15+.

```bash
npm install
cp .env.example .env        # point DATABASE_URL and DIRECT_URL at your local Postgres
npx prisma migrate deploy   # create tables
npm run dev:local           # http://localhost:3000 (local auth + local photo storage)
```

`npm run dev:local` sets `E2E_LOCAL_MODE=1`, which replaces Supabase Auth with a cookie (sign in with any staff email) and Supabase Storage with `./.local-storage`. It only works with `next dev` outside Vercel. Use `npm run dev` with real Supabase credentials to develop against Supabase.

## Tests

```bash
npm run typecheck && npm run lint
npm test                    # unit + integration tests (needs a Postgres test DB)
npm run test:e2e            # browser test; first start `npm run dev:local`
```

* Integration tests use `TEST_DATABASE_URL` (default `postgresql://postgres:postgres@localhost:5432/gemach_test`, migrated with `DIRECT_URL=<test url> npx prisma migrate deploy`). They truncate that database — never point it at production.
* Covered: permissions for both roles, gown intake/photos, customers without email & duplicate detection, two-step reservations, double-booking prevention (including simultaneous confirmations and raw inserts), override auditing, multi-gown reservations, pickups, returns → pending inspection, inspection/cleaning/alteration flows, overdue + upcoming warnings, archive/dispose/delete rules, payments/refunds/waivers/deposits, reports, staff management and first-run setup.

## Database & migrations

* Schema: `prisma/schema.prisma`. Hand-written safety rules live at the end of `prisma/migrations/*_init/migration.sql` (exclusion constraint, money checks, single primary photo, RLS lock-down).
* **Changing the schema**: edit `schema.prisma`, then locally `npx prisma migrate dev --name describe_change`, review the SQL, commit. The next Vercel deployment applies it (`prisma migrate deploy`).
* Never edit a migration that has already been deployed; add a new one.

## Backups & recovery

* Supabase takes daily database backups (retention depends on plan; the Pro plan adds point-in-time recovery). For an extra copy, run `pg_dump "$DIRECT_URL" > gemach-backup.sql` periodically, or export the CSV reports (Reports → each section → CSV).
* Photos live in the `gown-photos` bucket; they can be downloaded from the Supabase Storage dashboard.
* Historical data is never deleted in normal use: gowns/customers/donors are archived, reservations cancelled, and payments voided rather than removed.
* To restore: Supabase → Database → Backups → restore; or `psql "$DIRECT_URL" < gemach-backup.sql` into a fresh project, then point the Vercel env vars at it.

## Maintenance & updates

* Every push to `main` deploys to production automatically on Vercel; pushes to other branches create preview deployments.
* Keep dependencies current with care: Next.js, Prisma and `@prisma/adapter-pg` should be upgraded together; run `npm run typecheck && npm test && npm run build:local` before deploying. TypeScript is pinned to 6.x because Next.js tooling does not yet support TypeScript 7.
* Settings (default fee, deposit, rental length, turnaround buffer, time zone, assistant override) are changed in the app by an administrator — no code change needed.

## Future public website

The architecture is ready for a public site where customers browse gowns, check availability, request reservations and pay online:

* Gowns already carry `isPubliclyListed` and `publicDescription` fields.
* `src/lib/public/catalog.ts` is the **only** approved way to read gown data for anonymous visitors: it selects a strict whitelist of fields and never touches donors, customers, notes, payments or staff.
* Build it as a separate route group (e.g. `src/app/(public)`) with its own layout; availability can reuse `checkAvailability` but must return only yes/no. Online payments (e.g. Stripe) would add a new `PaymentMethod` and a webhook that records a `Payment` row.
* Reservation requests from the public should create **Pending** reservations, so staff keep the two-step confirmation.
