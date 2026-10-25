-- The day each upgrade prompt was last shown to a business (#1197, DEC-187):
-- "shown" goes to PostHog once a day per prompt. One nullable column,
-- additive only, no backfill: nothing was counted before it.

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "promptsShown" JSONB;
