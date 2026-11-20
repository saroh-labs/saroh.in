-- Admin ledger hardening (admin access review, 20 Nov 2026).

-- B1: where each admin action came from.
ALTER TABLE "AdminAuditEvent" ADD COLUMN "ipAddress" TEXT;
ALTER TABLE "AdminAuditEvent" ADD COLUMN "userAgent" TEXT;
ALTER TABLE "AdminAuditEvent" ADD COLUMN "sessionId" TEXT;
CREATE INDEX "AdminAuditEvent_sessionId_idx" ON "AdminAuditEvent"("sessionId");

-- B7: the ledger is append-only. Row triggers do not fire on TRUNCATE, which
-- only the table owner (migrations, the test suite's wipe) may run.
CREATE OR REPLACE FUNCTION "admin_audit_event_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'AdminAuditEvent is append-only (% refused)', TG_OP
        USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS "AdminAuditEvent_append_only" ON "AdminAuditEvent";
CREATE TRIGGER "AdminAuditEvent_append_only"
    BEFORE UPDATE OR DELETE ON "AdminAuditEvent"
    FOR EACH ROW EXECUTE FUNCTION "admin_audit_event_append_only"();

-- A5: deleting a staff account no longer erases its grant and role history.
ALTER TABLE "PlatformAdmin" DROP CONSTRAINT "PlatformAdmin_userId_fkey";
ALTER TABLE "PlatformAdmin" ADD CONSTRAINT "PlatformAdmin_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
