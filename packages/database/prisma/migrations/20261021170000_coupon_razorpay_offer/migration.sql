-- A coupon's Razorpay Offer (pricing catalogue, after U16). Razorpay takes a
-- discount off a subscription only through an Offer passed as `offer_id`
-- when the subscription is made, and Offers can't be made through its API
-- (405, the test-mode spike): the owner makes one in the Razorpay Dashboard
-- and pastes its id onto the coupon. Expand-only: a nullable column.

-- AlterTable
ALTER TABLE "PricingCoupon" ADD COLUMN     "razorpayOfferId" TEXT;

-- Razorpay's offer id: `offer_` and 14 letters or digits, 20 in all.
ALTER TABLE "PricingCoupon" ADD CONSTRAINT "PricingCoupon_razorpay_offer_shape"
  CHECK ("razorpayOfferId" IS NULL OR "razorpayOfferId" ~ '^offer_[A-Za-z0-9]{14}$');
