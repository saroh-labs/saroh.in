-- WhatsApp sign-in codes for Saroh accounts, made and sent by the server
-- from Saroh's own number (owner, 28 Oct 2026: "widget is for SMS"). Only
-- HMACs of the number and the code. No organization, so no row-level
-- security policy (named in `packages/database/src/rls-coverage.test.ts`).
-- Additive only.
-- CreateEnum
CREATE TYPE "AccountPhoneCodePurpose" AS ENUM ('SIGN_IN', 'ADD');

-- CreateTable
CREATE TABLE "AccountPhoneCode" (
    "id" TEXT NOT NULL,
    "phoneHash" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" "AccountPhoneCodePurpose" NOT NULL,
    "userId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountPhoneCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountPhoneCode_phoneHash_purpose_createdAt_idx" ON "AccountPhoneCode"("phoneHash", "purpose", "createdAt");

