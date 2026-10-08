-- UX-012: a connected payment or email provider that refused the business's
-- keys on a live call is marked as needing attention (reason + since when).
-- Null while it works; entering the keys again clears both.

-- AlterTable
ALTER TABLE "MerchantPaymentProvider" ADD COLUMN     "attentionAt" TIMESTAMP(3),
ADD COLUMN     "attentionReason" TEXT;

-- AlterTable
ALTER TABLE "CommunicationProvider" ADD COLUMN     "attentionAt" TIMESTAMP(3),
ADD COLUMN     "attentionReason" TEXT;
