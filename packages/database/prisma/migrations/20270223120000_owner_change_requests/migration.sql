-- Two staff members for an Owner change (security review F3, 20 Nov 2026).
CREATE TABLE "OwnerChangeRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "role" TEXT,
    "fromRole" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "confirmedByUserId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnerChangeRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OwnerChangeRequest_organizationId_confirmedAt_idx" ON "OwnerChangeRequest"("organizationId", "confirmedAt");

ALTER TABLE "OwnerChangeRequest" ADD CONSTRAINT "OwnerChangeRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security: only the console reads it, outside any business's
-- context; inside one, only that business's rows.
ALTER TABLE "OwnerChangeRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OwnerChangeRequest" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "OwnerChangeRequest"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
