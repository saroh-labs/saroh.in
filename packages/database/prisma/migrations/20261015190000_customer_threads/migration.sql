-- A customer's message thread with the business (round-2 A13, R14, default
-- 77): the customer writes from their account on the business's site, and
-- the team answers in the workspace. Additive only: two new tables and one
-- enum. The API reads them only while SITE_ACCOUNT_AREA is on, and Saroh
-- posts into them only while the ACCOUNT_THREAD flag is on (both off), so
-- the previous API ignores them safely.

-- CreateEnum
CREATE TYPE "CustomerThreadAuthor" AS ENUM ('CUSTOMER', 'STAFF', 'SYSTEM');

-- CreateTable
CREATE TABLE "CustomerThread" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerReadAt" TIMESTAMP(3),
    "staffReadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerThreadMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "author" "CustomerThreadAuthor" NOT NULL,
    "body" TEXT NOT NULL,
    "customerAccountId" TEXT,
    "authorUserId" TEXT,
    "event" TEXT,
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerThreadMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerThread_contactId_organizationId_key" ON "CustomerThread"("contactId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerThread_id_organizationId_key" ON "CustomerThread"("id", "organizationId");

-- CreateIndex
CREATE INDEX "CustomerThread_organizationId_lastMessageAt_idx" ON "CustomerThread"("organizationId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "CustomerThreadMessage_organizationId_idx" ON "CustomerThreadMessage"("organizationId");

-- CreateIndex
CREATE INDEX "CustomerThreadMessage_threadId_createdAt_idx" ON "CustomerThreadMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerThreadMessage_customerAccountId_createdAt_idx" ON "CustomerThreadMessage"("customerAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerThreadMessage_invoiceId_createdAt_idx" ON "CustomerThreadMessage"("invoiceId", "createdAt");

-- AddForeignKey
ALTER TABLE "CustomerThread" ADD CONSTRAINT "CustomerThread_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerThread" ADD CONSTRAINT "CustomerThread_contactId_organizationId_fkey" FOREIGN KEY ("contactId", "organizationId") REFERENCES "Contact"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerThreadMessage" ADD CONSTRAINT "CustomerThreadMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerThreadMessage" ADD CONSTRAINT "CustomerThreadMessage_threadId_organizationId_fkey" FOREIGN KEY ("threadId", "organizationId") REFERENCES "CustomerThread"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerThreadMessage" ADD CONSTRAINT "CustomerThreadMessage_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerThreadMessage" ADD CONSTRAINT "CustomerThreadMessage_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Organization-owned: row-level security, as every tenant table
-- (20260923150000_products_v2).
ALTER TABLE "CustomerThread" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerThread" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "CustomerThread"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "CustomerThreadMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerThreadMessage" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "CustomerThreadMessage"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
