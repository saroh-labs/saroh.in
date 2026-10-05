-- The link preview tool's email gate (resources plan U2, KTD-5; security
-- review 5 Oct 2026): its caps are counted in the database, not in one
-- process's memory. How many report emails an address was sent on one UTC
-- day, and that day, which the gate also sums for its daily ceiling.
ALTER TABLE "WaitlistSignup" ADD COLUMN "reportEmailDay" DATE;
ALTER TABLE "WaitlistSignup" ADD COLUMN "reportEmailCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "WaitlistSignup_reportEmailDay_idx" ON "WaitlistSignup"("reportEmailDay");
