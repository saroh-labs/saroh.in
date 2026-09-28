-- Pack drafts (round-2 E14, DEC-043, as D5 did for plans). A live pack's
-- unpublished changes, when they were last saved, the revision every editor
-- save carries (#285), and who moved it last (named in a stale editor's 409).
--
-- Additive: five columns the previous API image never reads or writes. The
-- draft revision defaults to 0, so every existing pack reads as live with no
-- pending set. `status` is a String, so DRAFT needs no enum change.
--
-- Rollback: the previous image already refuses to sell any pack whose status
-- isn't ACTIVE, and a draft has no purchases to spend, so a DRAFT row is
-- never sold by it. It would list a draft among the staff's packs, though
-- (it has no `include=drafts` filter), so roll back only after checking
-- `SELECT count(*) FROM "ClassPack" WHERE status = 'DRAFT'` is 0, or accept
-- that drafts show as cards whose Sell answers 409.

-- AlterTable
ALTER TABLE "ClassPack" ADD COLUMN     "draftRevision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pendingChangedAt" TIMESTAMP(3),
ADD COLUMN     "pendingChanges" JSONB,
ADD COLUMN     "revisedAt" TIMESTAMP(3),
ADD COLUMN     "revisedById" TEXT;
