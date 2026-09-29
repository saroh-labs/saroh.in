-- L1 (DEC-069, DEC-071): a web address a business used to have is held for
-- it after a change, and forwards to its site while the redirect lasts.
--
-- Additive only: a new table nothing before L1 reads, so the API already out
-- keeps working while this runs.

-- CreateTable
CREATE TABLE "AddressReservation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "siteId" TEXT,
    "redirectUntil" TIMESTAMP(3),
    "reservedUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AddressReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AddressReservation_address_key" ON "AddressReservation"("address");

-- CreateIndex
CREATE INDEX "AddressReservation_organizationId_idx" ON "AddressReservation"("organizationId");

-- CreateIndex
CREATE INDEX "AddressReservation_siteId_idx" ON "AddressReservation"("siteId");

-- AddForeignKey
ALTER TABLE "AddressReservation" ADD CONSTRAINT "AddressReservation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddressReservation" ADD CONSTRAINT "AddressReservation_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-level security (defence in depth, as every business-owned table).
-- "Is this address free" deliberately reads it outside any organization's
-- context (sites/site-address.ts), the way the renderer reads Site and Domain.
ALTER TABLE "AddressReservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AddressReservation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "AddressReservation"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
