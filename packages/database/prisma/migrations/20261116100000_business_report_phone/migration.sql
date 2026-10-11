-- Whoever reports a business now gives a mobile number as well as an email
-- (DEC-138, 11 Oct), so the team can reach them about the report. Nullable:
-- reports sent before this have none, and the requirement is the API's
-- (`SubmitBusinessReportDto`). The table's row-level security is unchanged.

-- AlterTable
ALTER TABLE "BusinessReport" ADD COLUMN     "reporterPhone" TEXT;
