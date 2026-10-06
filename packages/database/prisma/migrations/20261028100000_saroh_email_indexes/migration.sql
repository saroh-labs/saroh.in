-- Indexes for the emails Saroh sends for a business (DEC-086). Before them
-- every count below scanned Delivery or CustomerNotice through the
-- organization (or message) index alone.
--
-- - The platform's daily ceiling counts every business's SAROH deliveries
--   of the last 24 hours: a partial index on createdAt, SAROH rows only.
-- - A business's monthly allowance counts its own SAROH deliveries in its
--   month: (organizationId, provider, createdAt).
-- - The cap per booking reads one booking's notices of the last day:
--   (organizationId, bookingId, createdAt) on CustomerNotice.
--
-- Additive (expand only): the previous API image reads nothing new. All
-- three are declared in schema.prisma (the partial one with `where: raw`).
--
-- Rollback: the previous image ignores the indexes; drop them if wanted.

-- CreateIndex
CREATE INDEX "Delivery_organizationId_provider_createdAt_idx" ON "Delivery"("organizationId", "provider", "createdAt");

-- CreateIndex
CREATE INDEX "Delivery_saroh_createdAt_idx" ON "Delivery"("createdAt") WHERE (provider = 'SAROH');

-- CreateIndex
CREATE INDEX "CustomerNotice_organizationId_bookingId_createdAt_idx" ON "CustomerNotice"("organizationId", "bookingId", "createdAt");
