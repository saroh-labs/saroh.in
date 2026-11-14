-- Ask AI's reports, alarms and one-period grants (DEC-220, plan 2026-11-13-001 U8).

-- AlterTable: a granted Request more ends with its period.
ALTER TABLE "AiRequest" ADD COLUMN "packsEndAt" TIMESTAMP(3),
ADD COLUMN "packsRemovedAt" TIMESTAMP(3);

-- CreateEnum
CREATE TYPE "AiReportReason" AS ENUM ('WRONG_NUMBER', 'DIDNT_UNDERSTAND', 'SOMETHING_ELSE');

-- CreateEnum
CREATE TYPE "AiReportStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "AiReport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "reason" "AiReportReason" NOT NULL,
    "bodyCiphertext" TEXT NOT NULL,
    "bodyIv" TEXT NOT NULL,
    "bodyAuthTag" TEXT NOT NULL,
    "status" "AiReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAlert" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "windowKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiReport_messageId_key" ON "AiReport"("messageId");

-- CreateIndex
CREATE INDEX "AiReport_status_createdAt_idx" ON "AiReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AiReport_createdAt_idx" ON "AiReport"("createdAt");

-- CreateIndex
CREATE INDEX "AiReport_organizationId_idx" ON "AiReport"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "AiAlert_kind_windowKey_key" ON "AiAlert"("kind", "windowKey");

-- AddForeignKey
ALTER TABLE "AiReport" ADD CONSTRAINT "AiReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security (#53): a business's own reports only.
ALTER TABLE "AiReport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiReport" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "AiReport"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
