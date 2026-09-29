-- Indexes for the calendar's and Home's date-range reads (round 2, E19,
-- E20). Additive only: the API image before this one reads nothing
-- differently, and each index is dropped as easily as it is made.
--
-- Built without CONCURRENTLY, as every migration here is: each takes a
-- SHARE lock on its table for the build (reads go on, writes wait). The
-- tables are a few weeks of production rows; see
-- docs/architecture/ROUND_2_PHASE_2_ROLLOUT.md for the row-count check
-- before running it.

-- CreateIndex
CREATE INDEX "Order_organizationId_createdAt_idx" ON "Order"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_status_paidAt_idx" ON "Invoice"("organizationId", "status", "paidAt");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_paidAt_idx" ON "Invoice"("organizationId", "paidAt");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_issuedAt_idx" ON "Invoice"("organizationId", "issuedAt");

-- CreateIndex
CREATE INDEX "StaffTimeOff_organizationId_startAt_idx" ON "StaffTimeOff"("organizationId", "startAt");
