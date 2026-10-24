-- Where a business came from (#1190): src and utm from the link its owner
-- landed on saroh.in by. One nullable column, additive only, no backfill:
-- businesses made before it carried none.

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "signupSource" JSONB;
