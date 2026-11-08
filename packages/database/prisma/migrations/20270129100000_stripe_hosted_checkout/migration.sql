-- Stripe hosted Checkout (plan 2026-11-07-002, U2). Additive and nullable:
-- every existing row reads as before, and no backfill (the account country
-- fills lazily on the next Stripe checkout).

-- The hosted-checkout session (`cs_…`), kept after the PaymentIntent is known.
ALTER TABLE "PaymentIntent" ADD COLUMN     "providerCheckoutId" TEXT;
CREATE UNIQUE INDEX "PaymentIntent_providerCheckoutId_key" ON "PaymentIntent"("providerCheckoutId");

-- The payer as a Customer (`cus_…`) in the business's own Stripe account.
ALTER TABLE "Contact" ADD COLUMN     "stripeCustomerId" TEXT;

-- The connected account's country (ISO 3166-1 alpha-2), null until read.
ALTER TABLE "MerchantPaymentProvider" ADD COLUMN     "accountCountry" TEXT;
