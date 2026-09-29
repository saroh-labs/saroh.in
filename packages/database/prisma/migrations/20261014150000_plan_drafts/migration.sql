-- Plan drafts (round-2 D5, the writers; D21 shipped the readers that refuse
-- a DRAFT at CP-1). A live plan's unpublished changes, when and by whom they
-- were last saved, and the revision every editor save carries (#285).
--
-- Additive: four columns the previous API image never reads or writes. The
-- draft revision defaults to 0, so every existing plan reads as live with no
-- pending set. `status` is a String, so DRAFT needs no enum change.
--
-- Rollback: once any DRAFT row exists, rolling back below CP-1 (the D21
-- readers) is not safe — an older image would sell it. Rolling back to CP-1
-- or later is safe: those images refuse a DRAFT, and they ignore these
-- columns (a live plan's pending set simply stays unpublished).

-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "draftRevision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pendingChangedAt" TIMESTAMP(3),
ADD COLUMN     "pendingChangedById" TEXT,
ADD COLUMN     "pendingChanges" JSONB;
