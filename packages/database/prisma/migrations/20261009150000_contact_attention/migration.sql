-- Needs attention (DEC-040, C1): one list per customer of what the team must
-- know — Allergy, Medical, Access or Other — with sensitive entries left out
-- by the API for roles without the sensitive permission. Additive only: a
-- new table and three enums. The note allergens become Allergy entries
-- through the backfill (packages/database/src/backfill/contact-attention.ts),
-- run after this migration.

-- CreateEnum
CREATE TYPE "AttentionKind" AS ENUM ('ALLERGY', 'MEDICAL', 'ACCESS', 'OTHER');

-- CreateEnum
CREATE TYPE "AttentionSource" AS ENUM ('STAFF', 'BOOKING_PAGE', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "AttentionStatus" AS ENUM ('SUGGESTED', 'ACTIVE');

-- CreateTable
CREATE TABLE "ContactAttention" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "kind" "AttentionKind" NOT NULL,
    "label" TEXT NOT NULL,
    "detail" TEXT,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "allergenId" TEXT,
    "source" "AttentionSource" NOT NULL DEFAULT 'STAFF',
    "status" "AttentionStatus" NOT NULL DEFAULT 'ACTIVE',
    "bookingId" TEXT,
    "createdByUserId" TEXT,
    "confirmedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "ContactAttention_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactAttention_organizationId_contactId_idx" ON "ContactAttention"("organizationId", "contactId");

-- CreateIndex
CREATE INDEX "ContactAttention_organizationId_status_idx" ON "ContactAttention"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ContactAttention_allergenId_idx" ON "ContactAttention"("allergenId");

-- CreateIndex
CREATE INDEX "ContactAttention_bookingId_idx" ON "ContactAttention"("bookingId");

-- AddForeignKey
ALTER TABLE "ContactAttention" ADD CONSTRAINT "ContactAttention_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactAttention" ADD CONSTRAINT "ContactAttention_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactAttention" ADD CONSTRAINT "ContactAttention_allergenId_fkey" FOREIGN KEY ("allergenId") REFERENCES "StoreAllergen"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactAttention" ADD CONSTRAINT "ContactAttention_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Organization-owned: row-level security, as every tenant table
-- (20260923150000_products_v2).
ALTER TABLE "ContactAttention" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContactAttention" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "ContactAttention"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
