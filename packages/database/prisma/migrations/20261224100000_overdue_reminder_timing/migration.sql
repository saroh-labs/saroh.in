-- When a business's overdue reminders go (DEC-178, #1169): the days after
-- the due date for the first and second reminder, and the hours they may go
-- in. Additive only: one new table. The defaults (days 3 and 10, 9:00 to
-- 20:00) are code (`communications/overdue-timing.ts`), and a row is
-- written only when a business's choice differs from them, so nothing is
-- backfilled and the previous API, which neither reads nor writes it, sends
-- as before.

-- CreateTable
CREATE TABLE "OverdueReminderTiming" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "firstDay" INTEGER NOT NULL,
    "secondDay" INTEGER NOT NULL,
    "fromHour" INTEGER NOT NULL,
    "untilHour" INTEGER NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OverdueReminderTiming_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OverdueReminderTiming_organizationId_key" ON "OverdueReminderTiming"("organizationId");

-- AddForeignKey
ALTER TABLE "OverdueReminderTiming" ADD CONSTRAINT "OverdueReminderTiming_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The same bounds the API checks (`overdueTimingProblem`): days 1 to 30
-- for the first and up to 60 for the second, after the first; hours from
-- 0 to 23 and until 1 to 24, after from.
ALTER TABLE "OverdueReminderTiming" ADD CONSTRAINT "OverdueReminderTiming_days_check"
  CHECK ("firstDay" BETWEEN 1 AND 30 AND "secondDay" > "firstDay" AND "secondDay" <= 60);
ALTER TABLE "OverdueReminderTiming" ADD CONSTRAINT "OverdueReminderTiming_hours_check"
  CHECK ("fromHour" BETWEEN 0 AND 23 AND "untilHour" BETWEEN 1 AND 24 AND "untilHour" > "fromHour");

-- Tenant isolation (the products_v2 pattern).
ALTER TABLE "OverdueReminderTiming" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OverdueReminderTiming" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "OverdueReminderTiming"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
