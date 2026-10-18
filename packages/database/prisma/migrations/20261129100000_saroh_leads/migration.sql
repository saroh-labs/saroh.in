-- Saroh's own sales leads and the calls and visits logged on them (DEC-169,
-- admin console redesign U20). A lead belongs to Saroh, not a business, so
-- SarohLead has no organizationId and no row-level policy (rls-coverage.test.ts
-- lists it in NOT_TENANT_OWNED). A contact log row on a business carries its
-- organizationId and gets the org-isolation policy; a row on a lead has none
-- and is written only by the admin console, with no org context.

-- CreateTable
CREATE TABLE "SarohLead" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "emailKey" TEXT,
    "emailAt" TIMESTAMP(3),
    "signUpEmail" TEXT,
    "signUpEmailKey" TEXT,
    "signUpEmailAt" TIMESTAMP(3),
    "phone" TEXT,
    "city" TEXT,
    "kind" TEXT,
    "source" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'NEW',
    "stagedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "followUpOn" DATE,
    "notes" TEXT,
    "wonOrganizationId" TEXT,
    "wonAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "ownerPlatformAdminId" TEXT,
    "ownerSince" TIMESTAMP(3),
    "ownedHow" TEXT,
    "websiteSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SarohLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SarohContactLog" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "organizationId" TEXT,
    "platformAdminId" TEXT,
    "actorUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "happenedAt" TIMESTAMP(3) NOT NULL,
    "minutes" INTEGER,
    "summary" TEXT NOT NULL,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SarohContactLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SarohLead_emailKey_key" ON "SarohLead"("emailKey");

-- CreateIndex
CREATE UNIQUE INDEX "SarohLead_signUpEmailKey_key" ON "SarohLead"("signUpEmailKey");

-- CreateIndex
CREATE INDEX "SarohLead_ownerPlatformAdminId_stage_idx" ON "SarohLead"("ownerPlatformAdminId", "stage");

-- CreateIndex
CREATE INDEX "SarohLead_stage_followUpOn_idx" ON "SarohLead"("stage", "followUpOn");

-- CreateIndex
CREATE INDEX "SarohLead_websiteSeenAt_idx" ON "SarohLead"("websiteSeenAt");

-- CreateIndex
CREATE INDEX "SarohContactLog_leadId_happenedAt_idx" ON "SarohContactLog"("leadId", "happenedAt");

-- CreateIndex
CREATE INDEX "SarohContactLog_organizationId_happenedAt_idx" ON "SarohContactLog"("organizationId", "happenedAt");

-- CreateIndex
CREATE INDEX "SarohContactLog_platformAdminId_happenedAt_idx" ON "SarohContactLog"("platformAdminId", "happenedAt");

-- AddForeignKey
ALTER TABLE "SarohLead" ADD CONSTRAINT "SarohLead_ownerPlatformAdminId_fkey" FOREIGN KEY ("ownerPlatformAdminId") REFERENCES "PlatformAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SarohContactLog" ADD CONSTRAINT "SarohContactLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "SarohLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SarohContactLog" ADD CONSTRAINT "SarohContactLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SarohContactLog" ADD CONSTRAINT "SarohContactLog_platformAdminId_fkey" FOREIGN KEY ("platformAdminId") REFERENCES "PlatformAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- The lists in saroh-leads/lead-rules.ts.
ALTER TABLE "SarohLead" ADD CONSTRAINT "SarohLead_source_check"
    CHECK ("source" IN ('WEBSITE', 'WAITLIST', 'ADDED'));
ALTER TABLE "SarohLead" ADD CONSTRAINT "SarohLead_stage_check"
    CHECK ("stage" IN ('NEW', 'TALKED', 'DEMO', 'TRIAL', 'WON', 'LOST'));
ALTER TABLE "SarohLead" ADD CONSTRAINT "SarohLead_ownedHow_check"
    CHECK ("ownedHow" IS NULL OR "ownedHow" IN ('ADDED', 'ASSIGNED'));
-- Won names the business it became; Lost says why.
ALTER TABLE "SarohLead" ADD CONSTRAINT "SarohLead_won_check"
    CHECK ("stage" <> 'WON' OR ("wonOrganizationId" IS NOT NULL AND "wonAt" IS NOT NULL));
ALTER TABLE "SarohLead" ADD CONSTRAINT "SarohLead_lost_check"
    CHECK ("stage" <> 'LOST' OR length(btrim(coalesce("lostReason", ''))) > 0);
-- An email and its key go together, with when it was recorded.
ALTER TABLE "SarohLead" ADD CONSTRAINT "SarohLead_email_check"
    CHECK (("email" IS NULL AND "emailKey" IS NULL AND "emailAt" IS NULL)
        OR ("email" IS NOT NULL AND "emailKey" IS NOT NULL AND "emailAt" IS NOT NULL));
ALTER TABLE "SarohLead" ADD CONSTRAINT "SarohLead_signUpEmail_check"
    CHECK (("signUpEmail" IS NULL AND "signUpEmailKey" IS NULL AND "signUpEmailAt" IS NULL)
        OR ("signUpEmail" IS NOT NULL AND "signUpEmailKey" IS NOT NULL AND "signUpEmailAt" IS NOT NULL));
ALTER TABLE "SarohLead" ADD CONSTRAINT "SarohLead_name_check"
    CHECK (length(btrim("name")) > 0);

ALTER TABLE "SarohContactLog" ADD CONSTRAINT "SarohContactLog_kind_check"
    CHECK ("kind" IN ('CALL', 'VISIT', 'MESSAGE'));
ALTER TABLE "SarohContactLog" ADD CONSTRAINT "SarohContactLog_target_check"
    CHECK ("leadId" IS NOT NULL OR "organizationId" IS NOT NULL);
ALTER TABLE "SarohContactLog" ADD CONSTRAINT "SarohContactLog_minutes_check"
    CHECK ("minutes" IS NULL OR "minutes" > 0);
ALTER TABLE "SarohContactLog" ADD CONSTRAINT "SarohContactLog_summary_check"
    CHECK (length(btrim("summary")) > 0);

-- Row-level security, the template of 20261008100000_rls_remaining_tables.
-- Nullable organizationId: a lead's row (no organization) is visible and
-- writable only with no org context, which is the admin console.
ALTER TABLE "SarohContactLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SarohContactLog" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "SarohContactLog";
CREATE POLICY "org_isolation" ON "SarohContactLog"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
