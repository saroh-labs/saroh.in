-- A customer's "Ask to remove my data" request (DEC-172, #1106; site
-- templates v2 plan, U13). Nothing is deleted when they ask: the business
-- acts through the existing privacy removal, which marks the open request
-- DONE in its own transaction, or closes it without removal, with a reason.
-- The row outlives the account and the contact it names, so both keys clear
-- (SET NULL) rather than cascade. Additive only.
-- CreateEnum
CREATE TYPE "CustomerDataRequestKind" AS ENUM ('REMOVAL');

-- CreateEnum
CREATE TYPE "CustomerDataRequestStatus" AS ENUM ('OPEN', 'DONE', 'CLOSED_WITHOUT_REMOVAL');

-- CreateTable
CREATE TABLE "CustomerDataRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerAccountId" TEXT,
    "contactId" TEXT,
    "requesterName" TEXT,
    "requesterEmail" TEXT NOT NULL,
    "kind" "CustomerDataRequestKind" NOT NULL DEFAULT 'REMOVAL',
    "status" "CustomerDataRequestStatus" NOT NULL DEFAULT 'OPEN',
    "reason" TEXT,
    "handledByUserId" TEXT,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerDataRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerDataRequest_organizationId_status_createdAt_idx" ON "CustomerDataRequest"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerDataRequest_contactId_idx" ON "CustomerDataRequest"("contactId");

-- CreateIndex
CREATE INDEX "CustomerDataRequest_customerAccountId_createdAt_idx" ON "CustomerDataRequest"("customerAccountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerDataRequest_one_open_per_account" ON "CustomerDataRequest"("customerAccountId") WHERE (status = 'OPEN');

-- AddForeignKey
ALTER TABLE "CustomerDataRequest" ADD CONSTRAINT "CustomerDataRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerDataRequest" ADD CONSTRAINT "CustomerDataRequest_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerDataRequest" ADD CONSTRAINT "CustomerDataRequest_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- A request's status says what was done with it: an open one is not
-- handled yet; a handled one says when; only one closed without removal
-- carries a reason, and it always does.
ALTER TABLE "CustomerDataRequest" ADD CONSTRAINT "CustomerDataRequest_handled_check"
    CHECK ((("status" = 'OPEN') = ("handledAt" IS NULL))
           AND (("status" = 'CLOSED_WITHOUT_REMOVAL') = ("reason" IS NOT NULL AND btrim("reason") <> ''))
           AND ("status" <> 'OPEN' OR "handledByUserId" IS NULL));
-- Whoever asked has an email to be told at.
ALTER TABLE "CustomerDataRequest" ADD CONSTRAINT "CustomerDataRequest_email_check"
    CHECK (btrim("requesterEmail") <> '');

-- Row-level security, as the customer's account (CustomerAccount).
ALTER TABLE "CustomerDataRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerDataRequest" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "CustomerDataRequest";
CREATE POLICY "org_isolation" ON "CustomerDataRequest"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
