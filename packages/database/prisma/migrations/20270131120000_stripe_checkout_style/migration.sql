-- Where a Stripe customer pays (owner, 8 Nov 2026, DEC-208). Additive and
-- nullable: null reads as Stripe's hosted Checkout, as every row does today.
ALTER TABLE "MerchantPaymentProvider" ADD COLUMN     "checkoutStyle" TEXT;
