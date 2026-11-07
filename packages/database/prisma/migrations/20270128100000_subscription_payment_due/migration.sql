-- DEC-210: a renewal that wasn't paid stays on its plan until this date.
ALTER TABLE "Subscription" ADD COLUMN "paymentDueUntil" TIMESTAMP(3);
CREATE INDEX "Subscription_paymentDueUntil_idx" ON "Subscription"("paymentDueUntil");
