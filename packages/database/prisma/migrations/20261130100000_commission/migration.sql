-- Commission (DEC-169, admin console U21): the rates, a line per cleared
-- Saroh payment for its business's account manager, and the month's payout.
-- No rate is ever written here or in any other file: rates are set in the
-- console and live only in CommissionRate's rows.

-- CreateTable
CREATE TABLE "CommissionRate" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "basisPoints" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "setByUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "platformAdminId" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "sarohInvoiceId" TEXT NOT NULL,
    "installment" INTEGER NOT NULL DEFAULT 1,
    "installments" INTEGER NOT NULL DEFAULT 1,
    "kind" TEXT NOT NULL,
    "baseAmountPaise" INTEGER NOT NULL,
    "rateId" TEXT,
    "basisPoints" INTEGER,
    "amountPaise" INTEGER,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "statementMonth" TEXT,
    "payoutId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionPayout" (
    "id" TEXT NOT NULL,
    "platformAdminId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "lineCount" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "paidByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommissionRate_kind_effectiveFrom_idx" ON "CommissionRate"("kind", "effectiveFrom");

-- CreateIndex
CREATE INDEX "CommissionLine_platformAdminId_statementMonth_idx" ON "CommissionLine"("platformAdminId", "statementMonth");

-- CreateIndex
CREATE INDEX "CommissionLine_platformAdminId_status_idx" ON "CommissionLine"("platformAdminId", "status");

-- CreateIndex
CREATE INDEX "CommissionLine_status_periodEnd_idx" ON "CommissionLine"("status", "periodEnd");

-- CreateIndex
CREATE INDEX "CommissionLine_organizationId_idx" ON "CommissionLine"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionLine_sarohInvoiceId_installment_key" ON "CommissionLine"("sarohInvoiceId", "installment");

-- CreateIndex
CREATE INDEX "CommissionPayout_month_idx" ON "CommissionPayout"("month");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionPayout_platformAdminId_month_key" ON "CommissionPayout"("platformAdminId", "month");


-- What the API's lists hold (`commission/commission-rules.ts`).
ALTER TABLE "CommissionRate" ADD CONSTRAINT "CommissionRate_kind_check"
    CHECK ("kind" IN ('BROUGHT_IN', 'ASSIGNED'));
ALTER TABLE "CommissionRate" ADD CONSTRAINT "CommissionRate_basis_points_check"
    CHECK ("basisPoints" BETWEEN 0 AND 10000);
ALTER TABLE "CommissionRate" ADD CONSTRAINT "CommissionRate_reason_check"
    CHECK (length(btrim("reason")) > 0);

ALTER TABLE "CommissionLine" ADD CONSTRAINT "CommissionLine_status_check"
    CHECK ("status" IN ('PENDING', 'HELD', 'NO_RATE', 'PAYABLE', 'CANCELLED', 'PAID'));
ALTER TABLE "CommissionLine" ADD CONSTRAINT "CommissionLine_kind_check"
    CHECK ("kind" IN ('BROUGHT_IN', 'ASSIGNED'));
ALTER TABLE "CommissionLine" ADD CONSTRAINT "CommissionLine_installment_check"
    CHECK ("installments" >= 1 AND "installment" BETWEEN 1 AND "installments");
ALTER TABLE "CommissionLine" ADD CONSTRAINT "CommissionLine_amounts_check"
    CHECK ("baseAmountPaise" >= 0
           AND ("amountPaise" IS NULL OR "amountPaise" >= 0)
           AND ("basisPoints" IS NULL OR "basisPoints" BETWEEN 0 AND 10000)
           AND (("basisPoints" IS NULL) = ("amountPaise" IS NULL))
           AND (("basisPoints" IS NULL) = ("rateId" IS NULL)));
-- Worked out before it can be held, paid or waited on; never with a rate while NO_RATE.
ALTER TABLE "CommissionLine" ADD CONSTRAINT "CommissionLine_rated_check"
    CHECK (CASE "status"
             WHEN 'NO_RATE' THEN "basisPoints" IS NULL
             WHEN 'CANCELLED' THEN true
             ELSE "basisPoints" IS NOT NULL
           END);
ALTER TABLE "CommissionLine" ADD CONSTRAINT "CommissionLine_statement_check"
    CHECK (("status" IN ('PAYABLE', 'PAID')) = ("statementMonth" IS NOT NULL)
           AND (("status" = 'PAID') = ("payoutId" IS NOT NULL))
           AND ("statementMonth" IS NULL OR "statementMonth" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'));

ALTER TABLE "CommissionPayout" ADD CONSTRAINT "CommissionPayout_month_check"
    CHECK ("month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "CommissionPayout" ADD CONSTRAINT "CommissionPayout_amounts_check"
    CHECK ("amountPaise" >= 0 AND "lineCount" >= 1);
ALTER TABLE "CommissionPayout" ADD CONSTRAINT "CommissionPayout_text_check"
    CHECK (length(btrim("reference")) > 0 AND length(btrim("reason")) > 0);

-- A rate and a payout are written once: a change is a new rate; a payout
-- made by mistake is a Needs action for the owner, not an edit.
CREATE OR REPLACE FUNCTION "commission_written_once"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION '% % is written once and cannot change', TG_TABLE_NAME, OLD."id"
        USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "CommissionRate_written_once" ON "CommissionRate";
CREATE TRIGGER "CommissionRate_written_once"
    BEFORE UPDATE ON "CommissionRate"
    FOR EACH ROW EXECUTE FUNCTION "commission_written_once"();

DROP TRIGGER IF EXISTS "CommissionPayout_written_once" ON "CommissionPayout";
CREATE TRIGGER "CommissionPayout_written_once"
    BEFORE UPDATE ON "CommissionPayout"
    FOR EACH ROW EXECUTE FUNCTION "commission_written_once"();

-- Row-level security, the template of 20261008100000_rls_remaining_tables.
-- The line job and the console write and read lines with no business set
-- (a job, across businesses); a business's own context sees only its own.
ALTER TABLE "CommissionLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommissionLine" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "CommissionLine";
CREATE POLICY "org_isolation" ON "CommissionLine"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
