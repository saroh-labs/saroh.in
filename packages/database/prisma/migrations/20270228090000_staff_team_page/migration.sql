-- "Show on Our team" (DEC-248): opt-in, off for everyone until switched on.
-- AlterTable
ALTER TABLE "StaffMember" ADD COLUMN "showOnTeamPage" BOOLEAN NOT NULL DEFAULT false;
