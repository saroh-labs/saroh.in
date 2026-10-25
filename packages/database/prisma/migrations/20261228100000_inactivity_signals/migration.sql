-- Signs a business has gone quiet (R13, #1199): one open row per kind per
-- business. One new table, additive only, no backfill: the first sweep fills it.
-- CreateEnum
CREATE TYPE "InactivitySignalKind" AS ENUM ('NO_ACTIVITY', 'NO_TRADING', 'PAYMENT_DISCONNECTED');

-- CreateTable
CREATE TABLE "InactivitySignal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "InactivitySignalKind" NOT NULL,
    "since" TIMESTAMP(3) NOT NULL,
    "emailedAt" TIMESTAMP(3),
    "clearedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InactivitySignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InactivitySignal_clearedAt_emailedAt_idx" ON "InactivitySignal"("clearedAt", "emailedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InactivitySignal_one_open_per_kind" ON "InactivitySignal"("organizationId", "kind") WHERE ("clearedAt" IS NULL);

-- AddForeignKey
ALTER TABLE "InactivitySignal" ADD CONSTRAINT "InactivitySignal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security (#53).
ALTER TABLE "InactivitySignal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InactivitySignal" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "InactivitySignal"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
