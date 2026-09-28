-- The class waitlist (round-2 A12, R13, default 9): a place in line for one
-- session of a full class, offered to the first in line when a place frees.
-- Additive only: one new enum and one new table. The previous API neither
-- reads nor writes them, and nothing it counts changes until this release
-- writes an offer.

-- CreateEnum
CREATE TYPE "ClassWaitlistStatus" AS ENUM ('WAITING', 'OFFERED', 'ACCEPTED', 'EXPIRED', 'LEFT', 'CLOSED');

-- CreateTable
CREATE TABLE "ClassWaitlistEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "contactId" TEXT NOT NULL,
    "customerAccountId" TEXT,
    "position" INTEGER NOT NULL,
    "status" "ClassWaitlistStatus" NOT NULL DEFAULT 'WAITING',
    "offeredAt" TIMESTAMP(3),
    "offeredUntil" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "bookingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassWaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassWaitlistEntry_organizationId_idx" ON "ClassWaitlistEntry"("organizationId");

-- CreateIndex
CREATE INDEX "ClassWaitlistEntry_serviceId_startAt_status_position_idx" ON "ClassWaitlistEntry"("serviceId", "startAt", "status", "position");

-- CreateIndex
CREATE INDEX "ClassWaitlistEntry_status_offeredUntil_idx" ON "ClassWaitlistEntry"("status", "offeredUntil");

-- CreateIndex
CREATE INDEX "ClassWaitlistEntry_contactId_status_idx" ON "ClassWaitlistEntry"("contactId", "status");

-- CreateIndex
CREATE INDEX "ClassWaitlistEntry_customerAccountId_createdAt_idx" ON "ClassWaitlistEntry"("customerAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "ClassWaitlistEntry_closedAt_idx" ON "ClassWaitlistEntry"("closedAt");

-- One live place per person per session.
-- CreateIndex
CREATE UNIQUE INDEX "ClassWaitlistEntry_one_live_per_session" ON "ClassWaitlistEntry"("serviceId", "startAt", "contactId") WHERE (status IN ('WAITING', 'OFFERED'));

-- AddForeignKey
ALTER TABLE "ClassWaitlistEntry" ADD CONSTRAINT "ClassWaitlistEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassWaitlistEntry" ADD CONSTRAINT "ClassWaitlistEntry_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassWaitlistEntry" ADD CONSTRAINT "ClassWaitlistEntry_contactId_organizationId_fkey" FOREIGN KEY ("contactId", "organizationId") REFERENCES "Contact"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassWaitlistEntry" ADD CONSTRAINT "ClassWaitlistEntry_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Organization-owned: row-level security, as every tenant table
-- (20260923150000_products_v2).
ALTER TABLE "ClassWaitlistEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClassWaitlistEntry" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "ClassWaitlistEntry"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
