-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "organizationId" TEXT,
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");
-- CreateIndex
CREATE INDEX "IdempotencyRecord_organizationId_idx" ON "IdempotencyRecord"("organizationId");
-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_scope_key_actorUserId_key" ON "IdempotencyRecord"("scope", "key", "actorUserId");
-- AddForeignKey
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- RenameIndex
ALTER INDEX "PlatformAdminRoleAssignment_platformAdminId_revokedAt_expiresAt" RENAME TO "PlatformAdminRoleAssignment_platformAdminId_revokedAt_expir_idx";
