-- When a person dismissed the workspace's one-time notice that says how it
-- is recorded (DEC-125, owner 10 Oct). Additive only: one nullable column.
-- Null is "not dismissed yet": the notice shows, and it is shown before any
-- recording starts. The image still serving during the deploy neither reads
-- nor writes it.
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "usageNoticeSeenAt" TIMESTAMP(3);
