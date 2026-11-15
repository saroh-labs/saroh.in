-- Ask AI's Request more (DEC-220, plan 2026-11-13-001 U7).

-- CreateEnum
CREATE TYPE "AiRequestStatus" AS ENUM ('OPEN', 'GRANTED', 'DECLINED');

-- CreateTable
CREATE TABLE "AiRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "windowKey" TEXT NOT NULL,
    "status" "AiRequestStatus" NOT NULL DEFAULT 'OPEN',
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "reason" TEXT,
    "packs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiRequest_organizationId_status_idx" ON "AiRequest"("organizationId", "status");

-- CreateIndex
CREATE INDEX "AiRequest_status_createdAt_idx" ON "AiRequest"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "AiRequest" ADD CONSTRAINT "AiRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security (#53): a business's own requests only.
ALTER TABLE "AiRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiRequest" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "AiRequest"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
