-- S1-012 admin control plane.
--
-- PlatformAdmin: Saroh STAFF grants. Separate from Membership on purpose — every
-- Organization role is scoped to one tenant, while this is the right to act
-- across all of them, so a tenant OWNER can never escalate into staff by editing
-- their own org. Revocation is a `revokedAt` stamp rather than a DELETE, because
-- who held control-plane access and when is what an incident review needs.

-- CreateTable
CREATE TABLE "PlatformAdmin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedByUserId" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAdmin_userId_key" ON "PlatformAdmin"("userId");

-- CreateIndex
CREATE INDEX "PlatformAdmin_revokedAt_idx" ON "PlatformAdmin"("revokedAt");

-- AddForeignKey
ALTER TABLE "PlatformAdmin" ADD CONSTRAINT "PlatformAdmin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Granter kept as SET NULL: if the person who issued a grant is deleted, the
-- grant itself must survive (revoking it is a decision, not a side effect).
-- AddForeignKey
ALTER TABLE "PlatformAdmin" ADD CONSTRAINT "PlatformAdmin_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Flag changes must record WHY (DEC feature-flags: operator + reason). Nullable
-- because rows written before the admin surface existed have none; the admin API
-- requires it going forward.
-- AlterTable
ALTER TABLE "FeatureFlagAudit" ADD COLUMN "reason" TEXT;
