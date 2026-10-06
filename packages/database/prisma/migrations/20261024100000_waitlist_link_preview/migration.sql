-- The link preview tool's email gate (resources plan U2, KTD-5): the link a
-- visitor checked, when, and whether they ticked "Also send me Saroh news".
-- Nullable: entries from the waitlist forms have none of them.
ALTER TABLE "WaitlistSignup" ADD COLUMN "checkedUrl" TEXT;
ALTER TABLE "WaitlistSignup" ADD COLUMN "checkedAt" TIMESTAMP(3);
ALTER TABLE "WaitlistSignup" ADD COLUMN "newsConsent" BOOLEAN;
