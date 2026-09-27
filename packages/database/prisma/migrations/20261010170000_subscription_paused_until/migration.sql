-- D8: a pause with an end date. Additive and nullable: a null pause runs
-- until someone resumes it, which is every pause made before this one.
ALTER TABLE "CustomerSubscription" ADD COLUMN "pausedUntil" TIMESTAMP(3);
