-- The per-address cap on sign-in codes for Saroh accounts (security fix,
-- 30 Oct): one row per code or link asked for an address, by its HMAC. No
-- organization, so no row-level security policy (named in
-- `packages/database/src/rls-coverage.test.ts`). Additive only.
-- CreateTable
CREATE TABLE "AccountEmailCodeSend" (
    "id" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountEmailCodeSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountEmailCodeSend_emailHash_createdAt_idx" ON "AccountEmailCodeSend"("emailHash", "createdAt");
