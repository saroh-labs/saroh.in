-- Storefront people join the team (round 2, F16; DEC-048 amended
-- 2026-09-27). Team shows owners and admins a one-time notice naming the
-- people the backfill added as "Storefront team"; this is when it was
-- dismissed, per business. Additive and nullable: the previous image never
-- reads it.

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "storefrontTeamNoticeDismissedAt" TIMESTAMP(3);
