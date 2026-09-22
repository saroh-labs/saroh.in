-- Invoice pay link (ADR-007, U13). Additive: the API image before this one
-- keeps working after it runs — it always sets orderId, which the CHECK
-- below allows, and never reads the new columns.

-- A PaymentIntent now pays an Order OR an Invoice.
ALTER TABLE "PaymentIntent" ADD COLUMN     "invoiceId" TEXT,
ALTER COLUMN "orderId" DROP NOT NULL;

-- The pay link's token, stored only as its SHA-256.
ALTER TABLE "Invoice" ADD COLUMN     "payTokenHash" TEXT;

-- CreateIndex
CREATE INDEX "PaymentIntent_invoiceId_idx" ON "PaymentIntent"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_invoiceId_idempotencyKey_key" ON "PaymentIntent"("invoiceId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_payTokenHash_key" ON "Invoice"("payTokenHash");

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Exactly one of the two is set. Prisma cannot declare a CHECK, and does not
-- read one back as drift, so it lives here only (schema.prisma says so).
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_one_target"
    CHECK (("orderId" IS NULL) <> ("invoiceId" IS NULL));
