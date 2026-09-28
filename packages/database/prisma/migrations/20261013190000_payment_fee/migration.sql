-- Plan 005 E19 (default 47): the fee a provider reports on a payment, in
-- minor units. Nullable and additive: a payment the provider reported no fee
-- for keeps null, and nothing is back-filled or estimated.
ALTER TABLE "PaymentIntent" ADD COLUMN "feeCents" INTEGER;
