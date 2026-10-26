-- A money pack bought for the messaging wallet (DEC-191, #1241): one row per
-- one-off order on Saroh's billing provider. Paid, it credits the wallet once
-- (guarded on its status) and the ledger's TOPUP entry points back at it.
-- Additive only: a new table, an enum, a foreign key on a column that has
-- only ever been null, and a widened invoice source check.

CREATE TYPE "MessagingTopupStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');

CREATE TABLE "MessagingTopup" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "providerOrderId" TEXT NOT NULL,
    "status" "MessagingTopupStatus" NOT NULL DEFAULT 'PENDING',
    "sarohInvoiceId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessagingTopup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MessagingTopup_providerOrderId_key" ON "MessagingTopup"("providerOrderId");

CREATE INDEX "MessagingTopup_organizationId_createdAt_idx" ON "MessagingTopup"("organizationId", "createdAt");

ALTER TABLE "MessagingTopup" ADD CONSTRAINT "MessagingTopup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessagingTopup" ADD CONSTRAINT "MessagingTopup_amountPaise_check" CHECK ("amountPaise" > 0);

-- A top-up is invoiced by Saroh as a service sale (source TOPUP). Widening
-- the check: every row the old one allowed is still allowed.
ALTER TABLE "SarohInvoice" DROP CONSTRAINT "SarohInvoice_source_known";
ALTER TABLE "SarohInvoice" ADD CONSTRAINT "SarohInvoice_source_known"
  CHECK ("source" IN ('NEW', 'UPGRADE', 'SCHEDULED', 'RENEWAL', 'TOPUP'));

-- Nothing has written "topupId" before this unit, so every row is null.
ALTER TABLE "MessagingLedgerEntry" ADD CONSTRAINT "MessagingLedgerEntry_topupId_fkey" FOREIGN KEY ("topupId") REFERENCES "MessagingTopup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MessagingTopup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MessagingTopup" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "MessagingTopup";
CREATE POLICY "org_isolation" ON "MessagingTopup"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
