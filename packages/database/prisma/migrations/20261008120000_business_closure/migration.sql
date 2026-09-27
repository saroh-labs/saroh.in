-- E3: the whole business closed — a range of days, or part of each day.
-- Additive: a new table; nothing existing changes.

-- CreateTable
CREATE TABLE "BusinessClosure" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessClosure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessClosure_organizationId_startAt_idx" ON "BusinessClosure"("organizationId", "startAt");

-- AddForeignKey
ALTER TABLE "BusinessClosure" ADD CONSTRAINT "BusinessClosure_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security: one business never reads another's closures.
ALTER TABLE "BusinessClosure" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BusinessClosure" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "BusinessClosure"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
