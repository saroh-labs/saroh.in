-- Who at Saroh looks after a business (DEC-169, admin console redesign U19):
-- one account manager at a time, brought in (through their link, their code,
-- or their lead's email recorded before the business was made) or assigned
-- by staff. Append-only history: a link is only ever ended, never changed or
-- removed by hand, and one open link per business.

-- CreateTable
CREATE TABLE "AccountManagerLink" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "platformAdminId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedByUserId" TEXT,
    "endedAt" TIMESTAMP(3),
    "endedByUserId" TEXT,
    "endedReason" TEXT,

    CONSTRAINT "AccountManagerLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountManagerLink_organizationId_startedAt_idx" ON "AccountManagerLink"("organizationId", "startedAt");

-- CreateIndex
CREATE INDEX "AccountManagerLink_platformAdminId_endedAt_idx" ON "AccountManagerLink"("platformAdminId", "endedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccountManagerLink_one_open_per_business" ON "AccountManagerLink"("organizationId") WHERE ("endedAt" IS NULL);

-- AddForeignKey
ALTER TABLE "AccountManagerLink" ADD CONSTRAINT "AccountManagerLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The lists in apps/api.saroh.in/src/modules/organizations/account-manager.ts.
ALTER TABLE "AccountManagerLink" ADD CONSTRAINT "AccountManagerLink_source_check"
    CHECK ("source" IN ('LINK', 'CODE', 'LEAD_EMAIL', 'ASSIGNED'));
ALTER TABLE "AccountManagerLink" ADD CONSTRAINT "AccountManagerLink_kind_check"
    CHECK ("kind" IN ('BROUGHT_IN', 'ASSIGNED'));
-- Staff giving a business to a manager is ASSIGNED; every other source is a
-- business the manager brought in.
ALTER TABLE "AccountManagerLink" ADD CONSTRAINT "AccountManagerLink_kind_source_check"
    CHECK (("source" = 'ASSIGNED') = ("kind" = 'ASSIGNED'));
ALTER TABLE "AccountManagerLink" ADD CONSTRAINT "AccountManagerLink_evidence_check"
    CHECK (jsonb_typeof("evidence") = 'object');
ALTER TABLE "AccountManagerLink" ADD CONSTRAINT "AccountManagerLink_ended_check"
    CHECK ("endedAt" IS NULL OR "endedAt" >= "startedAt");
-- What ends a link says why; an open link has nothing to say.
ALTER TABLE "AccountManagerLink" ADD CONSTRAINT "AccountManagerLink_ended_reason_check"
    CHECK (("endedAt" IS NULL) = ("endedReason" IS NULL));

-- append-only:begin
-- A link is written once and only ever ended: an UPDATE may set the three
-- ended columns on an open link and nothing else, and an ended link never
-- changes again. Deleting a business still takes its links with it (the
-- foreign key's cascade); nothing in the API deletes one.
CREATE OR REPLACE FUNCTION "account_manager_link_append_only"() RETURNS trigger AS $$
BEGIN
    IF OLD."endedAt" IS NOT NULL THEN
        RAISE EXCEPTION 'AccountManagerLink % has ended and cannot change', OLD."id"
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."id" IS DISTINCT FROM OLD."id"
        OR NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
        OR NEW."platformAdminId" IS DISTINCT FROM OLD."platformAdminId"
        OR NEW."source" IS DISTINCT FROM OLD."source"
        OR NEW."kind" IS DISTINCT FROM OLD."kind"
        OR NEW."evidence" IS DISTINCT FROM OLD."evidence"
        OR NEW."startedAt" IS DISTINCT FROM OLD."startedAt"
        OR NEW."startedByUserId" IS DISTINCT FROM OLD."startedByUserId" THEN
        RAISE EXCEPTION 'AccountManagerLink % can only be ended', OLD."id"
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "AccountManagerLink_append_only" ON "AccountManagerLink";
CREATE TRIGGER "AccountManagerLink_append_only"
    BEFORE UPDATE ON "AccountManagerLink"
    FOR EACH ROW EXECUTE FUNCTION "account_manager_link_append_only"();
-- append-only:end

-- Row-level security, the template of 20261008100000_rls_remaining_tables.
-- Sign-up writes the link with no org context (the business is being made);
-- the business's own reads see only its links.
ALTER TABLE "AccountManagerLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AccountManagerLink" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "AccountManagerLink";
CREATE POLICY "org_isolation" ON "AccountManagerLink"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
