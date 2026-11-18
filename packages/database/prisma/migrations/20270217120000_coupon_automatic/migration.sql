-- Coupons for the launch offer (owner, 18 Nov 2026). Expand-only: two new
-- columns with safe defaults and a widened CHECK that every existing row
-- (an amount coupon) still meets.

-- AlterTable
ALTER TABLE "PricingCoupon" ADD COLUMN     "automatic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "percentOff" INTEGER;

-- A coupon is an amount off (`discountPaise` > 0, no percent) or a whole
-- percent off (1 to 90, `discountPaise` 0), never both.
ALTER TABLE "PricingCoupon" DROP CONSTRAINT "PricingCoupon_amounts_positive";
ALTER TABLE "PricingCoupon" ADD CONSTRAINT "PricingCoupon_amounts_positive"
  CHECK ("months" >= 1 AND "maxRedemptions" >= 1
    AND (("percentOff" IS NULL AND "discountPaise" > 0)
      OR ("percentOff" BETWEEN 1 AND 90 AND "discountPaise" = 0)));
