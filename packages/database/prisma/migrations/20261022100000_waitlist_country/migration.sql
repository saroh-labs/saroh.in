-- The waitlist records the visitor's country, as the site's host saw their
-- connection (never asked). Nullable: older entries have none.
ALTER TABLE "WaitlistSignup" ADD COLUMN "country" TEXT;
