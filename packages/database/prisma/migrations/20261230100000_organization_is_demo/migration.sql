-- Demo businesses (DEC-188, #1191): one column, additive only, every
-- existing business false. No backfill: the demo script sets it.
-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;
