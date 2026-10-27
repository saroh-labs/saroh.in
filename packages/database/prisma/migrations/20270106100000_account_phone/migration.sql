-- Phone sign-in for Saroh accounts (DEC-196, messaging brief unit 2, 27 Oct):
-- a verified phone on User, unique, as a second way to sign in, and the
-- platform-level AccountPhoneEvent rows the abuse limits count. No
-- organization, so no row-level security policy (named in
-- `packages/database/src/rls-coverage.test.ts`). Additive only.
-- CreateEnum
CREATE TYPE "AccountPhoneEventKind" AS ENUM ('START', 'VERIFY_FAILED', 'SIGNED_IN', 'PHONE_ADDED', 'PHONE_REMOVED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phoneE164" TEXT,
ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AccountPhoneEvent" (
    "id" TEXT NOT NULL,
    "kind" "AccountPhoneEventKind" NOT NULL,
    "phoneHash" TEXT,
    "ipHash" TEXT,
    "userId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountPhoneEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountPhoneEvent_phoneHash_kind_createdAt_idx" ON "AccountPhoneEvent"("phoneHash", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "AccountPhoneEvent_ipHash_kind_createdAt_idx" ON "AccountPhoneEvent"("ipHash", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "AccountPhoneEvent_userId_createdAt_idx" ON "AccountPhoneEvent"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneE164_key" ON "User"("phoneE164");

