-- DEC-171, #1087: Insights' "Not now" on a suggestion.
--
-- One person puts off one suggestion in one business until `hiddenUntil`
-- (7 days on), so it stays hidden on every device and comes back after.
-- One row per person, business and key; Not now again writes the same row.
-- Nothing is backfilled: no suggestion was ever put off before this.

-- CreateTable
CREATE TABLE "InsightSuggestionNotNow" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "hiddenUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsightSuggestionNotNow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InsightSuggestionNotNow_userId_idx" ON "InsightSuggestionNotNow"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "InsightSuggestionNotNow_organizationId_userId_key_key" ON "InsightSuggestionNotNow"("organizationId", "userId", "key");

-- AddForeignKey
ALTER TABLE "InsightSuggestionNotNow" ADD CONSTRAINT "InsightSuggestionNotNow_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsightSuggestionNotNow" ADD CONSTRAINT "InsightSuggestionNotNow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security: a business sees and writes only its own rows.
ALTER TABLE "InsightSuggestionNotNow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InsightSuggestionNotNow" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "InsightSuggestionNotNow";
CREATE POLICY "org_isolation" ON "InsightSuggestionNotNow"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
