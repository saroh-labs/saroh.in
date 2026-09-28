-- Autopay mandates at the business's own provider (round-2 D11, DEC-038),
-- as far as D20 needs them: a mandate belongs to one subscription and ends
-- with it, a privacy removal or a merge. Additive only: one new table.
-- Nothing creates a mandate yet (D12 does, and `supportsMandates` stays
-- false in production until D11 and D19 pass a test-mode run), so the
-- previous API never meets a row.

-- CreateTable
CREATE TABLE "PaymentMandate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerCustomerId" TEXT,
    "providerMandateId" TEXT,
    "displayHint" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "activatedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "cancelConfirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMandate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentMandate_organizationId_idx" ON "PaymentMandate"("organizationId");

-- CreateIndex
CREATE INDEX "PaymentMandate_organizationId_subscriptionId_status_idx" ON "PaymentMandate"("organizationId", "subscriptionId", "status");

-- CreateIndex
CREATE INDEX "PaymentMandate_organizationId_contactId_status_idx" ON "PaymentMandate"("organizationId", "contactId", "status");

-- A subscription has at most one ACTIVE mandate.
-- CreateIndex
CREATE UNIQUE INDEX "PaymentMandate_one_active_per_subscription" ON "PaymentMandate"("subscriptionId") WHERE (status = 'ACTIVE');

-- AddForeignKey
ALTER TABLE "PaymentMandate" ADD CONSTRAINT "PaymentMandate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMandate" ADD CONSTRAINT "PaymentMandate_contactId_organizationId_fkey" FOREIGN KEY ("contactId", "organizationId") REFERENCES "Contact"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMandate" ADD CONSTRAINT "PaymentMandate_subscriptionId_organizationId_fkey" FOREIGN KEY ("subscriptionId", "organizationId") REFERENCES "CustomerSubscription"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Organization-owned: row-level security, as every tenant table
-- (20260923150000_products_v2).
ALTER TABLE "PaymentMandate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentMandate" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "PaymentMandate"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
