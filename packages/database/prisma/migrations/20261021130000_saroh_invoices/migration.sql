-- Saroh's own invoices (pricing catalogue U17): the GST invoice Saroh issues
-- a business for each charge it takes for its plan.
--   * BillingCheckout keeps the state and GSTIN given at checkout;
--   * SarohInvoice and its lines, written by the billing webhook with the
--     charge they record, once per charge;
--   * SarohInvoiceSequence, the count behind each series.
-- Expand-only: two nullable columns and three new tables.

-- AlterTable
ALTER TABLE "BillingCheckout" ADD COLUMN     "billToGstin" TEXT,
ADD COLUMN     "billToState" TEXT;

-- CreateTable
CREATE TABLE "SarohInvoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "chargeKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerSubscriptionId" TEXT,
    "providerEventId" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "checkoutId" TEXT,
    "planId" TEXT,
    "planName" TEXT NOT NULL,
    "cycle" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "sellerName" TEXT NOT NULL,
    "sellerLegalName" TEXT,
    "sellerGstin" TEXT,
    "sellerState" TEXT,
    "sellerAddress" TEXT,
    "sellerEmail" TEXT,
    "billToName" TEXT NOT NULL,
    "billToEmail" TEXT,
    "billToAddress" TEXT,
    "billToState" TEXT,
    "billToGstin" TEXT,
    "placeOfSupply" TEXT,
    "taxType" TEXT NOT NULL,
    "subtotalPaise" INTEGER NOT NULL,
    "discountPaise" INTEGER NOT NULL DEFAULT 0,
    "taxablePaise" INTEGER NOT NULL,
    "cgstPaise" INTEGER NOT NULL,
    "sgstPaise" INTEGER NOT NULL,
    "igstPaise" INTEGER NOT NULL,
    "taxPaise" INTEGER NOT NULL,
    "totalPaise" INTEGER NOT NULL,
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SarohInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SarohInvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "sac" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPaise" INTEGER NOT NULL,
    "discountPaise" INTEGER NOT NULL DEFAULT 0,
    "taxablePaise" INTEGER NOT NULL,
    "gstRateBps" INTEGER NOT NULL,
    "cgstPaise" INTEGER NOT NULL,
    "sgstPaise" INTEGER NOT NULL,
    "igstPaise" INTEGER NOT NULL,
    "taxPaise" INTEGER NOT NULL,
    "amountPaise" INTEGER NOT NULL,

    CONSTRAINT "SarohInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SarohInvoiceSequence" (
    "series" TEXT NOT NULL,
    "last" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SarohInvoiceSequence_pkey" PRIMARY KEY ("series")
);

-- CreateIndex
CREATE UNIQUE INDEX "SarohInvoice_number_key" ON "SarohInvoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "SarohInvoice_chargeKey_key" ON "SarohInvoice"("chargeKey");

-- CreateIndex
CREATE INDEX "SarohInvoice_organizationId_issuedAt_idx" ON "SarohInvoice"("organizationId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SarohInvoice_id_organizationId_key" ON "SarohInvoice"("id", "organizationId");

-- CreateIndex
CREATE INDEX "SarohInvoiceLine_organizationId_idx" ON "SarohInvoiceLine"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SarohInvoiceLine_invoiceId_position_key" ON "SarohInvoiceLine"("invoiceId", "position");

-- AddForeignKey
ALTER TABLE "SarohInvoice" ADD CONSTRAINT "SarohInvoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SarohInvoiceLine" ADD CONSTRAINT "SarohInvoiceLine_invoiceId_organizationId_fkey" FOREIGN KEY ("invoiceId", "organizationId") REFERENCES "SarohInvoice"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;


-- What a checkout's bill-to may hold.
ALTER TABLE "BillingCheckout" ADD CONSTRAINT "BillingCheckout_bill_to_state_code"
  CHECK ("billToState" IS NULL OR "billToState" ~ '^[0-9]{2}$');
ALTER TABLE "BillingCheckout" ADD CONSTRAINT "BillingCheckout_bill_to_gstin_shape"
  CHECK ("billToGstin" IS NULL OR "billToGstin" ~ '^[0-9]{2}[A-Z0-9]{13}$');

-- What an invoice may hold.
ALTER TABLE "SarohInvoice" ADD CONSTRAINT "SarohInvoice_source_known"
  CHECK ("source" IN ('NEW', 'UPGRADE', 'SCHEDULED', 'RENEWAL'));
ALTER TABLE "SarohInvoice" ADD CONSTRAINT "SarohInvoice_cycle_known"
  CHECK ("cycle" IN ('month', 'year'));
ALTER TABLE "SarohInvoice" ADD CONSTRAINT "SarohInvoice_tax_type_known"
  CHECK ("taxType" IN ('INTRA', 'INTER'));
ALTER TABLE "SarohInvoice" ADD CONSTRAINT "SarohInvoice_amounts_whole"
  CHECK ("subtotalPaise" >= 0 AND "discountPaise" >= 0 AND "taxablePaise" >= 0
     AND "cgstPaise" >= 0 AND "sgstPaise" >= 0 AND "igstPaise" >= 0);
-- The sums add up: taxable is what is left after the discount, the tax is its
-- parts, and the total is the two together.
ALTER TABLE "SarohInvoice" ADD CONSTRAINT "SarohInvoice_sums"
  CHECK ("taxablePaise" = "subtotalPaise" - "discountPaise"
     AND "taxPaise" = "cgstPaise" + "sgstPaise" + "igstPaise"
     AND "totalPaise" = "taxablePaise" + "taxPaise");
-- CGST + SGST within the seller's state, IGST across states; never both.
ALTER TABLE "SarohInvoice" ADD CONSTRAINT "SarohInvoice_tax_split"
  CHECK (("taxType" = 'INTRA' AND "igstPaise" = 0)
      OR ("taxType" = 'INTER' AND "cgstPaise" = 0 AND "sgstPaise" = 0));

ALTER TABLE "SarohInvoiceLine" ADD CONSTRAINT "SarohInvoiceLine_amounts_whole"
  CHECK ("quantity" > 0 AND "unitPaise" >= 0 AND "discountPaise" >= 0
     AND "taxablePaise" >= 0 AND "gstRateBps" >= 0
     AND "cgstPaise" >= 0 AND "sgstPaise" >= 0 AND "igstPaise" >= 0);
ALTER TABLE "SarohInvoiceLine" ADD CONSTRAINT "SarohInvoiceLine_sums"
  CHECK ("taxablePaise" = "quantity" * "unitPaise" - "discountPaise"
     AND "taxPaise" = "cgstPaise" + "sgstPaise" + "igstPaise"
     AND "amountPaise" = "taxablePaise" + "taxPaise");

ALTER TABLE "SarohInvoiceSequence" ADD CONSTRAINT "SarohInvoiceSequence_last_positive"
  CHECK ("last" > 0);

-- Row-level security (org_isolation, FORCE): an invoice and its lines are
-- one business's. The sequence is Saroh's (rls-coverage NOT_TENANT_OWNED).
ALTER TABLE "SarohInvoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SarohInvoice" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "SarohInvoice"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "SarohInvoiceLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SarohInvoiceLine" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "SarohInvoiceLine"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
