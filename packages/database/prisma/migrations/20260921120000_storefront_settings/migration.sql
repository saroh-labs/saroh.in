-- AlterTable
ALTER TABLE "StoreSettings" ADD COLUMN     "address" TEXT,
ADD COLUMN     "checkoutProvider" TEXT,
ADD COLUMN     "collectionEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "guestCheckout" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'ONLINE',
ADD COLUMN     "openingHours" JSONB,
ADD COLUMN     "pausedAt" TIMESTAMP(3),
ADD COLUMN     "tipsEnabled" BOOLEAN NOT NULL DEFAULT false;

