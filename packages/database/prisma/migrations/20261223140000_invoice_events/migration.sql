-- An invoice's history (automatic notices U9 #1140, DEC-174): who issued,
-- sent, reminded, voided or credited it, and when, including what Saroh did
-- on the business's behalf (an automatic send has no person, so
-- `AuditEvent`, whose actor is required, can't hold it). Written in each
-- change's own transaction. Payments stay the ledger's audit rows and hand
-- shares stay `InvoiceShare`; the read merges them. No backfill: older
-- invoices read their history from their own dates. Additive only.

-- CreateTable
CREATE TABLE "InvoiceEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "actorKind" TEXT NOT NULL,
    "actorUserId" TEXT,
    "channel" TEXT,
    "messageId" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceEvent_invoiceId_createdAt_idx" ON "InvoiceEvent"("invoiceId", "createdAt");

-- A failed send is written once per email, however often its job retries.
-- CreateIndex
CREATE UNIQUE INDEX "InvoiceEvent_message_kind_key" ON "InvoiceEvent"("messageId", "kind") WHERE ("messageId" IS NOT NULL);

-- AddForeignKey
ALTER TABLE "InvoiceEvent" ADD CONSTRAINT "InvoiceEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceEvent" ADD CONSTRAINT "InvoiceEvent_invoiceId_organizationId_fkey" FOREIGN KEY ("invoiceId", "organizationId") REFERENCES "Invoice"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Only the kinds and actors Saroh words; a person's line names them.
ALTER TABLE "InvoiceEvent" ADD CONSTRAINT "InvoiceEvent_kind_check"
    CHECK ("kind" IN ('ISSUED', 'SENT', 'REMINDED', 'AUTO_SENT', 'AUTO_REMINDED',
                      'SEND_FAILED', 'VOIDED', 'CREDITED', 'REISSUED',
                      'PAY_ATTEMPT_FAILED', 'LINK_MADE'));
ALTER TABLE "InvoiceEvent" ADD CONSTRAINT "InvoiceEvent_actorKind_check"
    CHECK ("actorKind" IN ('USER', 'JOB', 'CUSTOMER'));
ALTER TABLE "InvoiceEvent" ADD CONSTRAINT "InvoiceEvent_actor_check"
    CHECK (("actorKind" = 'USER') = ("actorUserId" IS NOT NULL));
ALTER TABLE "InvoiceEvent" ADD CONSTRAINT "InvoiceEvent_channel_check"
    CHECK ("channel" IS NULL OR "channel" IN ('EMAIL', 'THREAD'));

-- Row-level security, as its invoice (Invoice, InvoicePayment, InvoiceShare).
ALTER TABLE "InvoiceEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceEvent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "InvoiceEvent";
CREATE POLICY "org_isolation" ON "InvoiceEvent"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
