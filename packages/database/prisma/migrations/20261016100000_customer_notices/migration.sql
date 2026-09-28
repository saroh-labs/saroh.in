-- Notices about a customer's own bookings and orders (round-2 A14, R15):
-- the ledger that makes `booking.notify` and `customer.notify` idempotent
-- per event, and records what each notice became (a thread message, an
-- email, a notice to the team). Additive only: one new table. The previous
-- API neither reads nor writes it.

-- CreateTable
CREATE TABLE "CustomerNotice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "contactId" TEXT,
    "bookingId" TEXT,
    "orderId" TEXT,
    "threadMessageId" TEXT,
    "messageId" TEXT,
    "notificationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerNotice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerNotice_organizationId_eventKey_key" ON "CustomerNotice"("organizationId", "eventKey");

-- CreateIndex
CREATE INDEX "CustomerNotice_organizationId_idx" ON "CustomerNotice"("organizationId");

-- CreateIndex
CREATE INDEX "CustomerNotice_messageId_idx" ON "CustomerNotice"("messageId");

-- AddForeignKey
ALTER TABLE "CustomerNotice" ADD CONSTRAINT "CustomerNotice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Organization-owned: row-level security, as every tenant table
-- (20260923150000_products_v2).
ALTER TABLE "CustomerNotice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerNotice" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "CustomerNotice"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
