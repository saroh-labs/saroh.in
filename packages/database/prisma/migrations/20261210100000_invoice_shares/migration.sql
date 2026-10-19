-- Sharing an invoice by hand, and its receipt (DEC-173, U5 #1117).
-- `InvoiceShare` logs each time an invoice is opened on WhatsApp
-- (click-to-chat: Saroh sends nothing), its link is copied, its PDF is
-- downloaded or its paper printed; the one-reminder-a-day rule reads the
-- WhatsApp ones beside the email Messages. `InvoicePayment.receiptMessageId`
-- is the receipt the `invoice.receipt` job emailed for a payment, set under
-- the payment's row lock so a job run twice emails it once.
-- Additive only.

-- AlterTable
ALTER TABLE "InvoicePayment" ADD COLUMN     "receiptMessageId" TEXT;

-- CreateTable
CREATE TABLE "InvoiceShare" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "byUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceShare_invoiceId_createdAt_idx" ON "InvoiceShare"("invoiceId", "createdAt");

-- AddForeignKey
ALTER TABLE "InvoiceShare" ADD CONSTRAINT "InvoiceShare_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceShare" ADD CONSTRAINT "InvoiceShare_invoiceId_organizationId_fkey" FOREIGN KEY ("invoiceId", "organizationId") REFERENCES "Invoice"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- A share is one of the ways Saroh knows, saying one of the three messages.
ALTER TABLE "InvoiceShare" ADD CONSTRAINT "InvoiceShare_channel_check"
    CHECK ("channel" IN ('WHATSAPP', 'LINK', 'PDF', 'PRINT'));
ALTER TABLE "InvoiceShare" ADD CONSTRAINT "InvoiceShare_kind_check"
    CHECK ("kind" IN ('NEW', 'REMINDER', 'RECEIPT'));

-- Row-level security, as its invoice (Invoice, InvoiceLine, InvoicePayment).
ALTER TABLE "InvoiceShare" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceShare" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "InvoiceShare";
CREATE POLICY "org_isolation" ON "InvoiceShare"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
