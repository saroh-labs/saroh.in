-- The payments on an invoice, as a ledger (DEC-173, #1113): one row per
-- payment in integer paise, with cheques and their bank status, and a soft
-- remove for a payment recorded by mistake. `Invoice.paidCents` caches the
-- live sum (not removed, not bounced), recomputed with every ledger write.
-- Additive only: nothing reads or writes these until the ledger API (U2)
-- lands, and the backfill (`src/backfill/invoice-payments.ts`) gives every
-- invoice already paid, except an order's, its one row.
-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "paidCents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "InvoicePayment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "chequeNumber" TEXT,
    "chequeBank" TEXT,
    "bankStatus" TEXT,
    "clearedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "bounceReason" TEXT,
    "removedAt" TIMESTAMP(3),
    "removedById" TEXT,
    "removedReason" TEXT,
    "recordedById" TEXT,
    "paymentIntentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoicePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvoicePayment_paymentIntentId_key" ON "InvoicePayment"("paymentIntentId");

-- CreateIndex
CREATE INDEX "InvoicePayment_invoiceId_idx" ON "InvoicePayment"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoicePayment_organizationId_receivedAt_idx" ON "InvoicePayment"("organizationId", "receivedAt");

-- CreateIndex
CREATE INDEX "InvoicePayment_organizationId_bankStatus_idx" ON "InvoicePayment"("organizationId", "bankStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_id_organizationId_key" ON "Invoice"("id", "organizationId");

-- AddForeignKey
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_invoiceId_organizationId_fkey" FOREIGN KEY ("invoiceId", "organizationId") REFERENCES "Invoice"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- What is paid so far is never negative. Its cap (no more than the total)
-- is held by the ledger's code: a bounced or removed payment can only lower
-- it, and an overpayment is refused before it is written.
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paidCents_check"
    CHECK ("paidCents" >= 0);

-- A payment is money in: more than nothing, by a method Saroh knows.
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_amount_check"
    CHECK ("amountCents" > 0);
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_method_check"
    CHECK ("method" IN ('CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'OTHER', 'CHEQUE', 'ONLINE'));
-- Only a cheque has a bank status, and every cheque has one. Cleared and
-- bounced each say when, and only a bounced cheque has a bounce reason.
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_cheque_check"
    CHECK ((("method" = 'CHEQUE') = ("bankStatus" IS NOT NULL))
           AND ("bankStatus" IS NULL OR "bankStatus" IN ('WAITING', 'CLEARED', 'BOUNCED'))
           AND (("bankStatus" IS NOT DISTINCT FROM 'CLEARED') = ("clearedAt" IS NOT NULL))
           AND (("bankStatus" IS NOT DISTINCT FROM 'BOUNCED') = ("bouncedAt" IS NOT NULL))
           AND ("bounceReason" IS NULL OR "bankStatus" IS NOT DISTINCT FROM 'BOUNCED')
           AND (("chequeNumber" IS NULL AND "chequeBank" IS NULL) OR "method" = 'CHEQUE'));
-- Removed once: a removed payment says when; who and why only with it.
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_removed_check"
    CHECK ("removedAt" IS NOT NULL
           OR ("removedById" IS NULL AND "removedReason" IS NULL));

-- Row-level security, as its invoice (Invoice, InvoiceLine).
ALTER TABLE "InvoicePayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoicePayment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "InvoicePayment";
CREATE POLICY "org_isolation" ON "InvoicePayment"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
