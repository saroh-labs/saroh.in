-- A business's referral code (DEC-102, #812): the `?ref=` its site's
-- "Made with Saroh" credit links with on Free. Additive only: one nullable
-- column and its unique index; the code is given when the credit is first
-- drawn, so no backfill. The previous API ignores it.

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "referralCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Organization_referralCode_key" ON "Organization"("referralCode");
