-- Saroh-sent verification codes (DEC-191, epic #1235, W1 #1238 #1240): one
-- row per verification session, one per message sent, a prepaid balance per
-- business in paise, and its append-only ledger. Additive only.

CREATE TYPE "MessagingChannel" AS ENUM ('WHATSAPP', 'SMS', 'EMAIL');

CREATE TYPE "VerificationModule" AS ENUM ('BOOKING', 'ORDER', 'ACCOUNT');

CREATE TYPE "PhoneVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'EXPIRED', 'FAILED');

CREATE TYPE "MessagingSendStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED');

CREATE TYPE "MessagingLedgerKind" AS ENUM ('TOPUP', 'DEBIT', 'RELEASE', 'EXPIRE', 'ADJUST');

CREATE TABLE "PhoneVerification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "module" "VerificationModule" NOT NULL,
    "subjectRef" TEXT,
    "phoneE164" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "status" "PhoneVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhoneVerification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MessagingSend" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "verificationId" TEXT NOT NULL,
    "channel" "MessagingChannel" NOT NULL,
    "pricePaise" INTEGER NOT NULL,
    "providerMessageId" TEXT,
    "status" "MessagingSendStatus" NOT NULL DEFAULT 'QUEUED',
    "failureReason" TEXT,
    "chargedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessagingSend_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MessagingWallet" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "balancePaise" INTEGER NOT NULL DEFAULT 0,
    "heldPaise" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessagingWallet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MessagingLedgerEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "MessagingLedgerKind" NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "sendId" TEXT,
    "topupId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessagingLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PhoneVerification_phoneE164_createdAt_idx" ON "PhoneVerification"("phoneE164", "createdAt");

CREATE INDEX "PhoneVerification_organizationId_createdAt_idx" ON "PhoneVerification"("organizationId", "createdAt");

CREATE INDEX "PhoneVerification_ipHash_createdAt_idx" ON "PhoneVerification"("ipHash", "createdAt");

CREATE INDEX "MessagingSend_providerMessageId_idx" ON "MessagingSend"("providerMessageId");

CREATE INDEX "MessagingSend_organizationId_createdAt_idx" ON "MessagingSend"("organizationId", "createdAt");

CREATE INDEX "MessagingSend_verificationId_idx" ON "MessagingSend"("verificationId");

CREATE UNIQUE INDEX "MessagingWallet_organizationId_key" ON "MessagingWallet"("organizationId");

CREATE INDEX "MessagingLedgerEntry_organizationId_createdAt_idx" ON "MessagingLedgerEntry"("organizationId", "createdAt");

CREATE UNIQUE INDEX "MessagingLedgerEntry_sendId_kind_key" ON "MessagingLedgerEntry"("sendId", "kind");

ALTER TABLE "PhoneVerification" ADD CONSTRAINT "PhoneVerification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessagingSend" ADD CONSTRAINT "MessagingSend_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessagingSend" ADD CONSTRAINT "MessagingSend_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "PhoneVerification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessagingWallet" ADD CONSTRAINT "MessagingWallet_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessagingLedgerEntry" ADD CONSTRAINT "MessagingLedgerEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessagingLedgerEntry" ADD CONSTRAINT "MessagingLedgerEntry_sendId_fkey" FOREIGN KEY ("sendId") REFERENCES "MessagingSend"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Money never goes below zero, and no more is held than there is.
ALTER TABLE "MessagingWallet" ADD CONSTRAINT "MessagingWallet_amounts_check"
    CHECK ("balancePaise" >= 0 AND "heldPaise" >= 0 AND "heldPaise" <= "balancePaise");
ALTER TABLE "MessagingSend" ADD CONSTRAINT "MessagingSend_pricePaise_check"
    CHECK ("pricePaise" >= 0);

ALTER TABLE "PhoneVerification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PhoneVerification" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "PhoneVerification";
CREATE POLICY "org_isolation" ON "PhoneVerification"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "MessagingSend" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MessagingSend" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "MessagingSend";
CREATE POLICY "org_isolation" ON "MessagingSend"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "MessagingWallet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MessagingWallet" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "MessagingWallet";
CREATE POLICY "org_isolation" ON "MessagingWallet"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "MessagingLedgerEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MessagingLedgerEntry" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "MessagingLedgerEntry";
CREATE POLICY "org_isolation" ON "MessagingLedgerEntry"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

