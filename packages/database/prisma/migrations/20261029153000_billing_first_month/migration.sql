-- DEC-093: a paid plan starts with a nominal first month on autopay. The
-- first month's charge is taken as the mandate is authorised, so a TRIAL
-- checkout may now charge something now, as an UPGRADE always could. Every
-- other kind still charges nothing now.
--
-- Expand-only: a CHECK replaced by a looser one; no data changes.
ALTER TABLE "BillingCheckout" DROP CONSTRAINT "BillingCheckout_charge_now_upgrade";
ALTER TABLE "BillingCheckout" ADD CONSTRAINT "BillingCheckout_charge_now_upgrade"
  CHECK ("kind" IN ('UPGRADE', 'TRIAL') OR ("chargeNowPaise" = 0 AND "chargeNowGstPaise" = 0));
