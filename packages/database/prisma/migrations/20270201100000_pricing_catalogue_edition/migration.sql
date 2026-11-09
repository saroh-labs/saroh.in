-- AlterTable
ALTER TABLE "PricingCatalogVersion" ADD COLUMN     "edition" "Edition" NOT NULL DEFAULT 'INDIA';

-- AlterTable
ALTER TABLE "PricingCoupon" ADD COLUMN     "edition" "Edition" NOT NULL DEFAULT 'INDIA';

-- CreateIndex
CREATE INDEX "PricingCatalogVersion_edition_goLiveAt_idx" ON "PricingCatalogVersion"("edition", "goLiveAt");


-- One shared draft per edition (stage 9): India's row keeps "shared", Global's is "global".
ALTER TABLE "PricingCatalogDraft" DROP CONSTRAINT "PricingCatalogDraft_one_shared";
ALTER TABLE "PricingCatalogDraft" ADD CONSTRAINT "PricingCatalogDraft_one_per_edition"
  CHECK ("id" IN ('shared', 'global'));
