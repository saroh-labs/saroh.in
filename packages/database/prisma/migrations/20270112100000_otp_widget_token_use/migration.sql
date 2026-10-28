-- SMS widget access tokens already used (DEC-198, 28 Oct 2026): sha256 of
-- the token, unique, so a token is taken once only on Saroh's side. No
-- organization, so no row-level security policy (named in
-- `packages/database/src/rls-coverage.test.ts`). Additive only.
-- CreateTable
CREATE TABLE "OtpWidgetTokenUse" (
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpWidgetTokenUse_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateIndex
CREATE INDEX "OtpWidgetTokenUse_expiresAt_idx" ON "OtpWidgetTokenUse"("expiresAt");
