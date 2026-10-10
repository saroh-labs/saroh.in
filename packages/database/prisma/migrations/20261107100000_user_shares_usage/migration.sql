-- "Help improve Saroh": a person's own choice to share how they use the
-- workspace as masked session recordings (DEC-123, owner 10 Oct). Additive
-- only: one nullable column. Null is "never chosen"; the image still
-- serving during the deploy neither reads nor writes it.
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sharesUsage" BOOLEAN;
