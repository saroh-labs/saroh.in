-- "Members can pause from their account" (round 2, A8): whether a member
-- may pause their own plan from the account area on the business's site.
-- Additive with a default of true (on, as the plan's default), so every
-- business, with or without a profile row, reads as on, and the previous
-- API image, which never reads it, is unaffected.

-- AlterTable
ALTER TABLE "BusinessProfile" ADD COLUMN     "membersCanPause" BOOLEAN NOT NULL DEFAULT true;
