-- Organization lifecycle and short-lived, read-only staff access sessions.

ALTER TABLE "Organization"
    ADD COLUMN "lifecycleStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN "lifecycleVersion" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "suspendedAt" TIMESTAMP(3),
    ADD COLUMN "suspendedByUserId" TEXT,
    ADD COLUMN "suspensionReason" TEXT,
    ADD COLUMN "deletionScheduledAt" TIMESTAMP(3),
    ADD COLUMN "deletionScheduledBy" TEXT,
    ADD COLUMN "deletionReason" TEXT,
    ADD COLUMN "deletedRetainedAt" TIMESTAMP(3);

ALTER TABLE "Organization"
    ADD CONSTRAINT "Organization_lifecycleStatus_check" CHECK (
        "lifecycleStatus" IN (
            'ACTIVE',
            'SUSPENDED',
            'PENDING_DELETION',
            'DELETED_RETAINED'
        )
    );

CREATE TABLE "AdminAccessSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "platformAdminId" TEXT,
    "actorUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'READ_ONLY',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "revocationReason" TEXT,

    CONSTRAINT "AdminAccessSession_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AdminAccessSession_scope_check" CHECK (
        "scope" = 'READ_ONLY'
    )
);

CREATE UNIQUE INDEX "AdminAccessSession_idempotencyKey_key"
    ON "AdminAccessSession"("idempotencyKey");

CREATE INDEX "AdminAccessSession_organizationId_expiresAt_revokedAt_idx"
    ON "AdminAccessSession"("organizationId", "expiresAt", "revokedAt");

CREATE INDEX "AdminAccessSession_actorUserId_expiresAt_revokedAt_idx"
    ON "AdminAccessSession"("actorUserId", "expiresAt", "revokedAt");

CREATE INDEX "AdminAccessSession_platformAdminId_revokedAt_idx"
    ON "AdminAccessSession"("platformAdminId", "revokedAt");

ALTER TABLE "AdminAccessSession"
    ADD CONSTRAINT "AdminAccessSession_organizationId_fkey"
    FOREIGN KEY ("organizationId")
    REFERENCES "Organization"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

ALTER TABLE "AdminAccessSession"
    ADD CONSTRAINT "AdminAccessSession_platformAdminId_fkey"
    FOREIGN KEY ("platformAdminId")
    REFERENCES "PlatformAdmin"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
