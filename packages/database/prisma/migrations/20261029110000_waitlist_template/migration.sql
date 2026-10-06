-- A waitlist entry remembers the gallery template its owner saved
-- (saroh.in/templates, industry templates U13). Existing entries stay NULL.
ALTER TABLE "WaitlistSignup" ADD COLUMN "template" TEXT;
