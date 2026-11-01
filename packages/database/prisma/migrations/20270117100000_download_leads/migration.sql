-- Free downloads' leads on saroh.in (plan 2026-10-31-002 U9): an email or a
-- WhatsApp number, exactly one, per contact and download. No organization,
-- so no row-level security policy (named in
-- `packages/database/src/rls-coverage.test.ts`). Additive only.
-- CreateTable
CREATE TABLE "DownloadLead" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "contactKey" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'download',
    "consentVersion" TEXT NOT NULL,
    "ipHash" TEXT,
    "emailDay" DATE,
    "emailCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRequestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DownloadLead_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DownloadLead_one_contact" CHECK (("email" IS NULL) <> ("phone" IS NULL))
);

-- CreateIndex
CREATE INDEX "DownloadLead_lastRequestedAt_idx" ON "DownloadLead"("lastRequestedAt");

-- CreateIndex
CREATE INDEX "DownloadLead_emailDay_idx" ON "DownloadLead"("emailDay");

-- CreateIndex
CREATE UNIQUE INDEX "DownloadLead_contactKey_slug_key" ON "DownloadLead"("contactKey", "slug");
