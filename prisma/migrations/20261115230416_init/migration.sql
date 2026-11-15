-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('ADMIN', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "GownStatus" AS ENUM ('AVAILABLE', 'PENDING_RESERVATION', 'RESERVED', 'CHECKED_OUT', 'PENDING_INSPECTION', 'PENDING_CLEANING', 'NEEDS_ALTERATION', 'UNAVAILABLE_OTHER', 'DISPOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "GownCondition" AS ENUM ('NEW_WITH_TAGS', 'EXCELLENT', 'VERY_GOOD', 'GOOD', 'FAIR', 'POOR');

-- CreateEnum
CREATE TYPE "PhotoKind" AS ENUM ('GALLERY', 'DAMAGE');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CHECKED_OUT', 'RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReservationItemStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CHECKED_OUT', 'RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CHECK', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('PAYMENT', 'REFUND', 'WAIVER');

-- CreateEnum
CREATE TYPE "DepositTransactionKind" AS ENUM ('COLLECTED', 'RETURNED', 'RETAINED');

-- CreateEnum
CREATE TYPE "InspectionOutcome" AS ENUM ('READY', 'NEEDS_CLEANING', 'NEEDS_ALTERATION', 'DAMAGED', 'OTHER');

-- CreateEnum
CREATE TYPE "WorkStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "staff_users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL DEFAULT 'ASSISTANT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdById" UUID,

    CONSTRAINT "staff_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "defaultRentalFeeCents" INTEGER NOT NULL DEFAULT 0,
    "defaultDepositCents" INTEGER NOT NULL DEFAULT 0,
    "defaultRentalDays" INTEGER NOT NULL DEFAULT 7,
    "turnaroundBufferDays" INTEGER NOT NULL DEFAULT 0,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "allowAssistantOverride" BOOLEAN NOT NULL DEFAULT false,
    "upcomingWindowDays" INTEGER NOT NULL DEFAULT 14,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "contactAddress" TEXT,
    "reservationTerms" TEXT,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donors" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "phoneDigits" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdById" UUID,

    CONSTRAINT "donors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneDigits" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdById" UUID,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gowns" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "intakeDate" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "style" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "sizeSort" DECIMAL(6,2),
    "color" TEXT NOT NULL,
    "designer" TEXT,
    "intakeCondition" "GownCondition",
    "currentCondition" "GownCondition",
    "bust" TEXT,
    "waist" TEXT,
    "hips" TEXT,
    "length" TEXT,
    "otherMeasurements" TEXT,
    "notes" TEXT,
    "status" "GownStatus" NOT NULL DEFAULT 'AVAILABLE',
    "statusReason" TEXT,
    "statusChangedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "donorId" UUID,
    "archivedAt" TIMESTAMPTZ(6),
    "archiveReason" TEXT,
    "disposedAt" TIMESTAMPTZ(6),
    "disposedDate" DATE,
    "disposalReason" TEXT,
    "disposalNotes" TEXT,
    "isPubliclyListed" BOOLEAN NOT NULL DEFAULT false,
    "publicDescription" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdById" UUID,

    CONSTRAINT "gowns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gown_photos" (
    "id" UUID NOT NULL,
    "gownId" UUID NOT NULL,
    "kind" "PhotoKind" NOT NULL DEFAULT 'GALLERY',
    "storagePath" TEXT NOT NULL,
    "thumbPath" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "caption" TEXT,
    "returnId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID,

    CONSTRAINT "gown_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gown_status_changes" (
    "id" UUID NOT NULL,
    "gownId" UUID NOT NULL,
    "fromStatus" "GownStatus",
    "toStatus" "GownStatus" NOT NULL,
    "reason" TEXT,
    "changedById" UUID,
    "changedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gown_status_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "customerId" UUID NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "requestDate" DATE NOT NULL,
    "depositRequiredCents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "confirmedAt" TIMESTAMPTZ(6),
    "confirmedById" UUID,
    "cancelledAt" TIMESTAMPTZ(6),
    "cancelledById" UUID,
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdById" UUID,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_items" (
    "id" UUID NOT NULL,
    "reservationId" UUID NOT NULL,
    "gownId" UUID NOT NULL,
    "status" "ReservationItemStatus" NOT NULL DEFAULT 'PENDING',
    "requestedPickupDate" DATE NOT NULL,
    "confirmedPickupDate" DATE,
    "expectedReturnDate" DATE NOT NULL,
    "blockedThroughDate" DATE NOT NULL,
    "actualPickupDate" DATE,
    "actualReturnDate" DATE,
    "rentalFeeCents" INTEGER NOT NULL DEFAULT 0,
    "blocksAvailability" BOOLEAN NOT NULL DEFAULT false,
    "conflictOverride" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "overrideById" UUID,
    "cancelledAt" TIMESTAMPTZ(6),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reservation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickups" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "pickupDate" DATE NOT NULL,
    "condition" "GownCondition",
    "notes" TEXT,
    "processedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pickups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gown_returns" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "returnDate" DATE NOT NULL,
    "condition" "GownCondition",
    "hasDamage" BOOLEAN NOT NULL DEFAULT false,
    "damageNotes" TEXT,
    "notes" TEXT,
    "daysLate" INTEGER NOT NULL DEFAULT 0,
    "processedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gown_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspections" (
    "id" UUID NOT NULL,
    "gownId" UUID NOT NULL,
    "returnId" UUID,
    "inspectionDate" DATE NOT NULL,
    "outcome" "InspectionOutcome" NOT NULL,
    "condition" "GownCondition",
    "notes" TEXT,
    "inspectedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cleaning_records" (
    "id" UUID NOT NULL,
    "gownId" UUID NOT NULL,
    "identifiedDate" DATE NOT NULL,
    "reason" TEXT,
    "assignedTo" TEXT,
    "status" "WorkStatus" NOT NULL DEFAULT 'OPEN',
    "completedDate" DATE,
    "costCents" INTEGER,
    "notes" TEXT,
    "inspectionId" UUID,
    "createdById" UUID,
    "completedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cleaning_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alteration_records" (
    "id" UUID NOT NULL,
    "gownId" UUID NOT NULL,
    "identifiedDate" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "assignedTo" TEXT,
    "status" "WorkStatus" NOT NULL DEFAULT 'OPEN',
    "completedDate" DATE,
    "costCents" INTEGER,
    "notes" TEXT,
    "inspectionId" UUID,
    "createdById" UUID,
    "completedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "alteration_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "reservationId" UUID NOT NULL,
    "kind" "PaymentKind" NOT NULL DEFAULT 'PAYMENT',
    "amountCents" INTEGER NOT NULL,
    "method" "PaymentMethod",
    "paymentDate" DATE NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "isVoided" BOOLEAN NOT NULL DEFAULT false,
    "voidedAt" TIMESTAMPTZ(6),
    "voidedById" UUID,
    "voidReason" TEXT,
    "recordedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposit_transactions" (
    "id" UUID NOT NULL,
    "reservationId" UUID NOT NULL,
    "kind" "DepositTransactionKind" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" "PaymentMethod",
    "transactionDate" DATE NOT NULL,
    "reason" TEXT,
    "notes" TEXT,
    "isVoided" BOOLEAN NOT NULL DEFAULT false,
    "voidedAt" TIMESTAMPTZ(6),
    "voidedById" UUID,
    "voidReason" TEXT,
    "recordedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "actorName" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_users_email_key" ON "staff_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "donors_number_key" ON "donors"("number");

-- CreateIndex
CREATE INDEX "donors_name_idx" ON "donors"("name");

-- CreateIndex
CREATE INDEX "donors_phoneDigits_idx" ON "donors"("phoneDigits");

-- CreateIndex
CREATE UNIQUE INDEX "customers_number_key" ON "customers"("number");

-- CreateIndex
CREATE INDEX "customers_fullName_idx" ON "customers"("fullName");

-- CreateIndex
CREATE INDEX "customers_phoneDigits_idx" ON "customers"("phoneDigits");

-- CreateIndex
CREATE UNIQUE INDEX "gowns_number_key" ON "gowns"("number");

-- CreateIndex
CREATE INDEX "gowns_status_idx" ON "gowns"("status");

-- CreateIndex
CREATE INDEX "gowns_intakeDate_idx" ON "gowns"("intakeDate");

-- CreateIndex
CREATE INDEX "gowns_donorId_idx" ON "gowns"("donorId");

-- CreateIndex
CREATE INDEX "gowns_size_idx" ON "gowns"("size");

-- CreateIndex
CREATE INDEX "gowns_color_idx" ON "gowns"("color");

-- CreateIndex
CREATE INDEX "gowns_style_idx" ON "gowns"("style");

-- CreateIndex
CREATE UNIQUE INDEX "gown_photos_storagePath_key" ON "gown_photos"("storagePath");

-- CreateIndex
CREATE INDEX "gown_photos_gownId_kind_idx" ON "gown_photos"("gownId", "kind");

-- CreateIndex
CREATE INDEX "gown_status_changes_gownId_changedAt_idx" ON "gown_status_changes"("gownId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_number_key" ON "reservations"("number");

-- CreateIndex
CREATE INDEX "reservations_customerId_idx" ON "reservations"("customerId");

-- CreateIndex
CREATE INDEX "reservations_status_idx" ON "reservations"("status");

-- CreateIndex
CREATE INDEX "reservation_items_gownId_status_idx" ON "reservation_items"("gownId", "status");

-- CreateIndex
CREATE INDEX "reservation_items_reservationId_idx" ON "reservation_items"("reservationId");

-- CreateIndex
CREATE INDEX "reservation_items_expectedReturnDate_idx" ON "reservation_items"("expectedReturnDate");

-- CreateIndex
CREATE INDEX "reservation_items_requestedPickupDate_idx" ON "reservation_items"("requestedPickupDate");

-- CreateIndex
CREATE UNIQUE INDEX "pickups_itemId_key" ON "pickups"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "gown_returns_itemId_key" ON "gown_returns"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "inspections_returnId_key" ON "inspections"("returnId");

-- CreateIndex
CREATE INDEX "inspections_gownId_idx" ON "inspections"("gownId");

-- CreateIndex
CREATE INDEX "cleaning_records_gownId_status_idx" ON "cleaning_records"("gownId", "status");

-- CreateIndex
CREATE INDEX "alteration_records_gownId_status_idx" ON "alteration_records"("gownId", "status");

-- CreateIndex
CREATE INDEX "payments_reservationId_idx" ON "payments"("reservationId");

-- CreateIndex
CREATE INDEX "payments_paymentDate_idx" ON "payments"("paymentDate");

-- CreateIndex
CREATE INDEX "deposit_transactions_reservationId_idx" ON "deposit_transactions"("reservationId");

-- CreateIndex
CREATE INDEX "deposit_transactions_transactionDate_idx" ON "deposit_transactions"("transactionDate");

-- CreateIndex
CREATE INDEX "activity_logs_createdAt_idx" ON "activity_logs"("createdAt");

-- CreateIndex
CREATE INDEX "activity_logs_entityType_entityId_idx" ON "activity_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "activity_logs_actorId_idx" ON "activity_logs"("actorId");

-- AddForeignKey
ALTER TABLE "gowns" ADD CONSTRAINT "gowns_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "donors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gown_photos" ADD CONSTRAINT "gown_photos_gownId_fkey" FOREIGN KEY ("gownId") REFERENCES "gowns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gown_photos" ADD CONSTRAINT "gown_photos_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "gown_returns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gown_status_changes" ADD CONSTRAINT "gown_status_changes_gownId_fkey" FOREIGN KEY ("gownId") REFERENCES "gowns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_items" ADD CONSTRAINT "reservation_items_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_items" ADD CONSTRAINT "reservation_items_gownId_fkey" FOREIGN KEY ("gownId") REFERENCES "gowns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickups" ADD CONSTRAINT "pickups_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "reservation_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gown_returns" ADD CONSTRAINT "gown_returns_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "reservation_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_gownId_fkey" FOREIGN KEY ("gownId") REFERENCES "gowns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "gown_returns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cleaning_records" ADD CONSTRAINT "cleaning_records_gownId_fkey" FOREIGN KEY ("gownId") REFERENCES "gowns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alteration_records" ADD CONSTRAINT "alteration_records_gownId_fkey" FOREIGN KEY ("gownId") REFERENCES "gowns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_transactions" ADD CONSTRAINT "deposit_transactions_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ===========================================================================
-- Hand-written integrity & security rules (not expressible in Prisma schema)
-- ===========================================================================

-- ---- Double-booking prevention --------------------------------------------
-- A gown can never have two availability-blocking reservation items whose
-- [pickup, blockedThrough] date ranges overlap. This holds even when two
-- staff members confirm at the same instant: Postgres serialises the
-- constraint check, and the second transaction fails.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "reservation_items"
  ADD CONSTRAINT "reservation_items_no_double_booking"
  EXCLUDE USING gist (
    "gownId" WITH =,
    daterange(COALESCE("confirmedPickupDate", "requestedPickupDate"), "blockedThroughDate", '[]') WITH &&
  ) WHERE ("blocksAvailability" AND NOT "conflictOverride");

ALTER TABLE "reservation_items"
  ADD CONSTRAINT "reservation_items_dates_ordered"
  CHECK ("expectedReturnDate" >= COALESCE("confirmedPickupDate", "requestedPickupDate")
     AND "blockedThroughDate" >= "expectedReturnDate");

-- ---- Money sanity ----------------------------------------------------------
ALTER TABLE "reservation_items" ADD CONSTRAINT "reservation_items_fee_nonneg" CHECK ("rentalFeeCents" >= 0);
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_deposit_nonneg" CHECK ("depositRequiredCents" >= 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amountCents" > 0);
ALTER TABLE "deposit_transactions" ADD CONSTRAINT "deposit_tx_amount_positive" CHECK ("amountCents" > 0);
ALTER TABLE "cleaning_records" ADD CONSTRAINT "cleaning_cost_nonneg" CHECK ("costCents" IS NULL OR "costCents" >= 0);
ALTER TABLE "alteration_records" ADD CONSTRAINT "alteration_cost_nonneg" CHECK ("costCents" IS NULL OR "costCents" >= 0);
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_singleton" CHECK ("id" = 1);
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_nonneg" CHECK (
  "defaultRentalFeeCents" >= 0 AND "defaultDepositCents" >= 0 AND
  "defaultRentalDays" >= 1 AND "turnaroundBufferDays" >= 0 AND "upcomingWindowDays" >= 1);

-- At most one primary photo per gown.
CREATE UNIQUE INDEX "gown_photos_one_primary" ON "gown_photos" ("gownId") WHERE "isPrimary";

-- Fast "open work" lookups.
CREATE INDEX "reservation_items_blocking" ON "reservation_items" ("gownId") WHERE "blocksAvailability";

INSERT INTO "app_settings" ("id", "updatedAt") VALUES (1, now()) ON CONFLICT DO NOTHING;

-- ---- Supabase Data API lock-down -------------------------------------------
-- All application data is read and written ONLY by the Next.js server
-- (through Prisma, as the table owner), after its own authentication and
-- role checks. Supabase's auto-generated REST/GraphQL API must expose none
-- of it: Row Level Security is enabled with NO policies (deny-all) and the
-- anon/authenticated roles hold no privileges. A future public website must
-- go through dedicated server endpoints that whitelist safe fields — never
-- through these tables directly.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
  END IF;
END $$;
