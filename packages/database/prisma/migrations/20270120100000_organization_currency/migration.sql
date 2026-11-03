-- The currency a Global business chose at setup (DEC-204). Null for every
-- business until now: they keep working out theirs as before.
ALTER TABLE "Organization" ADD COLUMN "currency" TEXT;
