-- Autopay mandates: set-up, status, limit and the two-step charge
-- (round-2 D11, DEC-038). Additive only: nullable columns, one column with
-- a default, and indexes. Nothing sets up a mandate until D12, and
-- `supportsMandates` stays false for Razorpay and Cashfree until D19, so the
-- previous API never meets a column it doesn't know. Both tables already
-- carry row-level security (PaymentIntent since S5, PaymentMandate since
-- 20261016110000_payment_mandates).

-- AlterTable
ALTER TABLE "PaymentIntent" ADD COLUMN     "debitAfter" TIMESTAMP(3),
ADD COLUMN     "preDebitRef" TEXT,
ADD COLUMN     "preDebitStatus" TEXT,
ADD COLUMN     "viaMandateId" TEXT;

-- AlterTable
ALTER TABLE "PaymentMandate" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "failedAt" TIMESTAMP(3),
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "frequency" TEXT,
ADD COLUMN     "maxAmountCents" INTEGER,
ADD COLUMN     "method" TEXT,
ADD COLUMN     "pausedAt" TIMESTAMP(3),
ADD COLUMN     "setupExpiresAt" TIMESTAMP(3),
ADD COLUMN     "setupReference" TEXT;

-- CreateIndex
CREATE INDEX "PaymentIntent_viaMandateId_idx" ON "PaymentIntent"("viaMandateId");

-- A webhook finds a mandate by its set-up before the provider names it.
-- CreateIndex
CREATE INDEX "PaymentMandate_organizationId_provider_setupReference_idx" ON "PaymentMandate"("organizationId", "provider", "setupReference");

-- One row per provider mandate (token) in a business.
-- CreateIndex
CREATE UNIQUE INDEX "PaymentMandate_organizationId_provider_providerMandateId_key" ON "PaymentMandate"("organizationId", "provider", "providerMandateId");

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_viaMandateId_fkey" FOREIGN KEY ("viaMandateId") REFERENCES "PaymentMandate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
