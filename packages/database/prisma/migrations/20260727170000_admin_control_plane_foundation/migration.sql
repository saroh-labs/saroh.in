-- Internal control-plane RBAC and global audit foundation.
--
-- Existing PlatformAdmin grants predate roles. Preserve their effective access
-- by backfilling PLATFORM_OWNER with the same grant/revocation timestamps.

CREATE TABLE "PlatformAdminRoleAssignment" (
    "id" TEXT NOT NULL,
    "platformAdminId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "assignedByUserId" TEXT,
    "reason" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "PlatformAdminRoleAssignment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PlatformAdminRoleAssignment_role_check" CHECK (
        "role" IN (
            'PLATFORM_OWNER',
            'SUPPORT',
            'OPERATIONS',
            'BILLING',
            'RELEASE_MANAGER',
            'AUDITOR'
        )
    )
);

CREATE TABLE "AdminAuditEvent" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "organizationId" TEXT,
    "reason" TEXT,
    "outcome" TEXT NOT NULL,
    "correlationId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AdminAuditEvent_outcome_check" CHECK (
        "outcome" IN ('SUCCESS', 'FAILURE', 'DENIED')
    )
);

CREATE INDEX "PlatformAdminRoleAssignment_platformAdminId_revokedAt_expiresAt_idx"
    ON "PlatformAdminRoleAssignment"("platformAdminId", "revokedAt", "expiresAt");

CREATE INDEX "PlatformAdminRoleAssignment_role_revokedAt_idx"
    ON "PlatformAdminRoleAssignment"("role", "revokedAt");

CREATE INDEX "AdminAuditEvent_createdAt_idx"
    ON "AdminAuditEvent"("createdAt");

CREATE INDEX "AdminAuditEvent_actorUserId_createdAt_idx"
    ON "AdminAuditEvent"("actorUserId", "createdAt");

CREATE INDEX "AdminAuditEvent_organizationId_createdAt_idx"
    ON "AdminAuditEvent"("organizationId", "createdAt");

CREATE INDEX "AdminAuditEvent_targetType_targetId_createdAt_idx"
    ON "AdminAuditEvent"("targetType", "targetId", "createdAt");

ALTER TABLE "PlatformAdminRoleAssignment"
    ADD CONSTRAINT "PlatformAdminRoleAssignment_platformAdminId_fkey"
    FOREIGN KEY ("platformAdminId")
    REFERENCES "PlatformAdmin"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

INSERT INTO "PlatformAdminRoleAssignment" (
    "id",
    "platformAdminId",
    "role",
    "assignedByUserId",
    "reason",
    "assignedAt",
    "revokedAt"
)
SELECT
    "id" || '_platform_owner',
    "id",
    'PLATFORM_OWNER',
    "grantedByUserId",
    'Backfilled from pre-RBAC PlatformAdmin grant',
    "grantedAt",
    "revokedAt"
FROM "PlatformAdmin";
