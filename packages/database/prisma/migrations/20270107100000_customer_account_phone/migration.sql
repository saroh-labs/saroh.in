-- Site sign-in by WhatsApp code (DEC-196): a customer
-- account may hold one verified phone, unique among a business's live
-- accounts as its email is. Additive only; CustomerAccount's row-level
-- security already covers the new columns.

-- AlterTable
ALTER TABLE "CustomerAccount" ADD COLUMN "phoneE164" TEXT,
ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAccount_one_live_per_phone" ON "CustomerAccount"("organizationId", "phoneE164") WHERE (status <> 'REMOVED');
