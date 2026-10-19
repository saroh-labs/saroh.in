-- A business's own commission rate for its account manager (DEC-169, #1035):
-- the rate, from an "Earns from" day no earlier than its first paid plan,
-- and the line's link to it. No rate is ever written here or in any other
-- file: rates are set in the console and live only in the rows.

-- AlterTable
ALTER TABLE "CommissionLine" ADD COLUMN     "businessRateId" TEXT;

-- CreateTable
CREATE TABLE "BusinessCommissionRate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "platformAdminId" TEXT NOT NULL,
    "basisPoints" INTEGER NOT NULL,
    "earnsFrom" TIMESTAMP(3) NOT NULL,
    "until" TIMESTAMP(3),
    "setByUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endedByUserId" TEXT,
    "endedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessCommissionRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessCommissionRate_organizationId_earnsFrom_idx" ON "BusinessCommissionRate"("organizationId", "earnsFrom");

-- CreateIndex
CREATE INDEX "CommissionLine_businessRateId_idx" ON "CommissionLine"("businessRateId");


ALTER TABLE "BusinessCommissionRate" ADD CONSTRAINT "BusinessCommissionRate_basis_points_check"
    CHECK ("basisPoints" BETWEEN 0 AND 10000);
ALTER TABLE "BusinessCommissionRate" ADD CONSTRAINT "BusinessCommissionRate_text_check"
    CHECK (length(btrim("reason")) > 0
           AND ("endedReason" IS NULL OR length(btrim("endedReason")) > 0));
-- An end on or after its start (on it: ended before it began, so it never earned).
ALTER TABLE "BusinessCommissionRate" ADD CONSTRAINT "BusinessCommissionRate_window_check"
    CHECK ("until" IS NULL OR "until" >= "earnsFrom");
ALTER TABLE "BusinessCommissionRate" ADD CONSTRAINT "BusinessCommissionRate_ended_check"
    CHECK (("endedAt" IS NULL) = ("endedByUserId" IS NULL)
           AND ("endedAt" IS NULL) = ("endedReason" IS NULL)
           AND ("endedAt" IS NULL OR "until" IS NOT NULL));

-- A line is priced by one rate at most: a general one or the business's own.
ALTER TABLE "CommissionLine" DROP CONSTRAINT "CommissionLine_amounts_check";
ALTER TABLE "CommissionLine" ADD CONSTRAINT "CommissionLine_amounts_check"
    CHECK ("baseAmountPaise" >= 0
           AND ("amountPaise" IS NULL OR "amountPaise" >= 0)
           AND ("basisPoints" IS NULL OR "basisPoints" BETWEEN 0 AND 10000)
           AND (("basisPoints" IS NULL) = ("amountPaise" IS NULL))
           AND ("rateId" IS NULL OR "businessRateId" IS NULL)
           AND (("basisPoints" IS NULL) = ("rateId" IS NULL AND "businessRateId" IS NULL)));

-- Written once, but for its end: `until` only ever moves earlier, once
-- ended it stays ended, and nothing else changes.
CREATE OR REPLACE FUNCTION "business_commission_rate_only_ends"() RETURNS trigger AS $$
BEGIN
    IF NEW."id" IS DISTINCT FROM OLD."id"
       OR NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
       OR NEW."platformAdminId" IS DISTINCT FROM OLD."platformAdminId"
       OR NEW."basisPoints" IS DISTINCT FROM OLD."basisPoints"
       OR NEW."earnsFrom" IS DISTINCT FROM OLD."earnsFrom"
       OR NEW."setByUserId" IS DISTINCT FROM OLD."setByUserId"
       OR NEW."reason" IS DISTINCT FROM OLD."reason"
       OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
       OR (OLD."until" IS NOT NULL AND (NEW."until" IS NULL OR NEW."until" > OLD."until"))
       OR (OLD."endedAt" IS NOT NULL AND (
              NEW."endedAt" IS DISTINCT FROM OLD."endedAt"
              OR NEW."endedByUserId" IS DISTINCT FROM OLD."endedByUserId"
              OR NEW."endedReason" IS DISTINCT FROM OLD."endedReason"
              OR NEW."until" IS DISTINCT FROM OLD."until"))
    THEN
        RAISE EXCEPTION 'BusinessCommissionRate % only ever ends earlier', OLD."id"
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "BusinessCommissionRate_only_ends" ON "BusinessCommissionRate";
CREATE TRIGGER "BusinessCommissionRate_only_ends"
    BEFORE UPDATE ON "BusinessCommissionRate"
    FOR EACH ROW EXECUTE FUNCTION "business_commission_rate_only_ends"();

-- Row-level security, as CommissionLine: the console writes and reads with
-- no business set; a business's own context sees only its own.
ALTER TABLE "BusinessCommissionRate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BusinessCommissionRate" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "BusinessCommissionRate";
CREATE POLICY "org_isolation" ON "BusinessCommissionRate"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
