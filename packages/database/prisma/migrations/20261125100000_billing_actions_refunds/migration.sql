-- Admin billing controls (DEC-166, owner 17 Oct 2026): what an operator
-- must act on (BillingAction), refunds and disputes on Saroh's payments
-- (BillingRefund), the amount the provider says it took on each invoice,
-- and one waiting run of the daily reconcile against the provider.

-- AlterTable
ALTER TABLE "SarohInvoice" ADD COLUMN     "providerAmountPaise" INTEGER;

-- CreateTable
CREATE TABLE "BillingAction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "code" TEXT NOT NULL,
    "refs" JSONB NOT NULL,
    "note" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolution" TEXT,

    CONSTRAINT "BillingAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingRefund" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "provider" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'REFUND',
    "providerRefundId" TEXT NOT NULL,
    "providerPaymentId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "amountPaise" INTEGER,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "source" TEXT NOT NULL,
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingRefund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingAction_dedupeKey_key" ON "BillingAction"("dedupeKey");

-- CreateIndex
CREATE INDEX "BillingAction_resolvedAt_createdAt_idx" ON "BillingAction"("resolvedAt", "createdAt");

-- CreateIndex
CREATE INDEX "BillingAction_organizationId_resolvedAt_idx" ON "BillingAction"("organizationId", "resolvedAt");

-- CreateIndex
CREATE INDEX "BillingRefund_providerPaymentId_idx" ON "BillingRefund"("providerPaymentId");

-- CreateIndex
CREATE INDEX "BillingRefund_invoiceId_idx" ON "BillingRefund"("invoiceId");

-- CreateIndex
CREATE INDEX "BillingRefund_organizationId_createdAt_idx" ON "BillingRefund"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingRefund_provider_providerRefundId_key" ON "BillingRefund"("provider", "providerRefundId");

-- CreateIndex
CREATE UNIQUE INDEX "Job_one_pending_billing_reconcile" ON "Job"("type") WHERE (type = 'billing.reconcile' AND status = 'PENDING');


-- Row-level security (org_isolation, FORCE), as AdminOrganizationNote and
-- AdminAuditEvent: a row with no business is read only with no business set.
ALTER TABLE "BillingAction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingAction" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "BillingAction"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "BillingRefund" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingRefund" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "BillingRefund"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
