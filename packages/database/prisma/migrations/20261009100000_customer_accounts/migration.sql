-- Customer accounts on merchant sites (ADR-011, DEC-037, DEC-049; round-2
-- plan A, unit A1). A business's own customers sign in on its site with an
-- email code: one account per business, linked to exactly one Contact, never
-- a Better Auth User.
--
-- Additive only: three new tables, two new enums, two nullable Contact
-- columns (nothing backfilled: no contact starts verified) and two unique
-- indexes on ids that are already unique, which composite foreign keys
-- target so the database refuses a row mixing two businesses. No Site
-- column: sign-in is always on for every site.
-- CreateEnum
CREATE TYPE "ContactEmailVerifiedVia" AS ENUM ('SIGN_IN_CODE', 'ORDER_CONFIRMATION', 'BOOKING_CONFIRMATION', 'STAFF_CONFIRMED');

-- CreateEnum
CREATE TYPE "CustomerAccountStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'MERGED', 'REMOVED');

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "emailVerifiedVia" "ContactEmailVerifiedVia";

-- CreateTable
CREATE TABLE "CustomerAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3) NOT NULL,
    "status" "CustomerAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "mergedIntoId" TEXT,
    "unlinkedFromContactId" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSignedInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerSignInCode" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "destinationHash" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "clientHash" TEXT,
    "newDestination" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerSignInCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerAccount_organizationId_idx" ON "CustomerAccount"("organizationId");

-- CreateIndex
CREATE INDEX "CustomerAccount_contactId_idx" ON "CustomerAccount"("contactId");

-- CreateIndex
CREATE INDEX "CustomerAccount_mergedIntoId_idx" ON "CustomerAccount"("mergedIntoId");

-- CreateIndex
CREATE INDEX "CustomerAccount_unlinkedFromContactId_idx" ON "CustomerAccount"("unlinkedFromContactId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAccount_one_live_per_email" ON "CustomerAccount"("organizationId", "email") WHERE (status <> 'REMOVED');

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAccount_one_live_per_contact" ON "CustomerAccount"("contactId") WHERE (status <> 'REMOVED');

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAccount_id_organizationId_key" ON "CustomerAccount"("id", "organizationId");

-- CreateIndex
CREATE INDEX "CustomerSignInCode_organizationId_destinationHash_createdAt_idx" ON "CustomerSignInCode"("organizationId", "destinationHash", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerSignInCode_organizationId_createdAt_idx" ON "CustomerSignInCode"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerSignInCode_createdAt_idx" ON "CustomerSignInCode"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSession_tokenHash_key" ON "CustomerSession"("tokenHash");

-- CreateIndex
CREATE INDEX "CustomerSession_organizationId_idx" ON "CustomerSession"("organizationId");

-- CreateIndex
CREATE INDEX "CustomerSession_accountId_idx" ON "CustomerSession"("accountId");

-- CreateIndex
CREATE INDEX "CustomerSession_siteId_idx" ON "CustomerSession"("siteId");

-- CreateIndex
CREATE INDEX "CustomerSession_expiresAt_idx" ON "CustomerSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Site_id_organizationId_key" ON "Site"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_id_organizationId_key" ON "Contact"("id", "organizationId");

-- AddForeignKey
ALTER TABLE "CustomerAccount" ADD CONSTRAINT "CustomerAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAccount" ADD CONSTRAINT "CustomerAccount_contactId_organizationId_fkey" FOREIGN KEY ("contactId", "organizationId") REFERENCES "Contact"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAccount" ADD CONSTRAINT "CustomerAccount_mergedIntoId_organizationId_fkey" FOREIGN KEY ("mergedIntoId", "organizationId") REFERENCES "CustomerAccount"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAccount" ADD CONSTRAINT "CustomerAccount_unlinkedFromContactId_fkey" FOREIGN KEY ("unlinkedFromContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSignInCode" ADD CONSTRAINT "CustomerSignInCode_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSession" ADD CONSTRAINT "CustomerSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSession" ADD CONSTRAINT "CustomerSession_accountId_organizationId_fkey" FOREIGN KEY ("accountId", "organizationId") REFERENCES "CustomerAccount"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSession" ADD CONSTRAINT "CustomerSession_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "Site"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row-level security: every new table is organization-owned and follows the
-- org_isolation shape of 20260923150000_products_v2 (permissive while the GUC
-- is unset, for jobs and public paths; RLS_ROLLOUT_AND_OPS.md).
ALTER TABLE "CustomerAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerAccount" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "CustomerAccount"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "CustomerSignInCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerSignInCode" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "CustomerSignInCode"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "CustomerSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerSession" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "CustomerSession"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
