-- A subscription's own classes a month (round 2, D10): the plan's value,
-- taken at subscribe and at each renewal, so a change to a plan's classes
-- reaches each member at their next renewal rather than at once.
--
-- Additive: two nullable columns the previous API image never reads. It
-- keeps creating subscriptions with both null until it stops serving (and
-- again after a rollback), so readers take the plan's value while
-- "classesPerPeriodSetAt" is null, and the backfill below is re-run as a
-- script after the deploy (packages/database/src/backfill/
-- classes-per-period.cli.ts; docs/architecture/ROUND_2_PHASE_2_ROLLOUT.md,
-- D10). Follow-up Z1 removes that fallback once no live row is unset.

-- AlterTable
ALTER TABLE "CustomerSubscription" ADD COLUMN     "classesPerPeriod" INTEGER,
ADD COLUMN     "classesPerPeriodSetAt" TIMESTAMP(3);

-- Backfill: every live subscription takes its plan's classes a month now,
-- which is what it reads today, so no member's allowance moves at deploy.
-- A null (no allowance) is copied as null and still counts as set.
UPDATE "CustomerSubscription" s
SET "classesPerPeriod" = p."classesPerMonth",
    "classesPerPeriodSetAt" = CURRENT_TIMESTAMP
FROM "SubscriptionPlan" p
WHERE p."id" = s."planId"
  AND s."classesPerPeriodSetAt" IS NULL
  AND s."status" <> 'CANCELLED';
