-- Ask AI's tables (DEC-220, plan 2026-11-13-001 U3): conversations and
-- their messages, per-turn usage, the AI settings and a business's
-- overrides of them, the business's switch and each person's language.
--
-- New tables only, additive, no backfill. The image still serving during
-- the deploy reads none of it. Text is sealed by the API (AI_TEXT_ENC_KEY);
-- no column holds a question or an answer in the clear.

-- CreateEnum
CREATE TYPE "AiMessageRole" AS ENUM ('USER', 'ASSISTANT', 'TOOL');

-- CreateEnum
CREATE TYPE "AiTurnOutcome" AS ENUM ('RUNNING', 'ANSWERED', 'DRAFT', 'STOPPED_BEFORE', 'STOPPED_AFTER', 'FAILED', 'CUT_OFF', 'DAILY_LIMIT', 'NO_ACCESS');

-- CreateEnum
CREATE TYPE "AiLanguage" AS ENUM ('MATCH', 'ENGLISH', 'HINGLISH', 'HINDI');

-- CreateTable
CREATE TABLE "AiConversation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "agentVersion" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "effort" TEXT NOT NULL,
    "language" "AiLanguage",
    "titleCiphertext" TEXT,
    "titleIv" TEXT,
    "titleAuthTag" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "AiMessageRole" NOT NULL,
    "bodyCiphertext" TEXT NOT NULL,
    "bodyIv" TEXT NOT NULL,
    "bodyAuthTag" TEXT NOT NULL,
    "outcome" "AiTurnOutcome",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "turnId" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "agentVersion" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "effort" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowKey" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWrite5mTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWrite1hTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "thinkingTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicroUsd" INTEGER NOT NULL DEFAULT 0,
    "over100k" BOOLEAN NOT NULL DEFAULT false,
    "outcome" "AiTurnOutcome" NOT NULL DEFAULT 'RUNNING',
    "counted" BOOLEAN NOT NULL DEFAULT false,
    "stopped" BOOLEAN NOT NULL DEFAULT false,
    "failureReason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "setByUserId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSettingOverride" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB,
    "reason" TEXT NOT NULL,
    "setByUserId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSettingOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiBusinessSetting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "askAiOn" BOOLEAN NOT NULL DEFAULT true,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiBusinessSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiPersonSetting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "language" "AiLanguage" NOT NULL DEFAULT 'MATCH',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiPersonSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiConversation_organizationId_userId_lastMessageAt_idx" ON "AiConversation"("organizationId", "userId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "AiConversation_lastMessageAt_idx" ON "AiConversation"("lastMessageAt");

-- CreateIndex
CREATE INDEX "AiMessage_conversationId_createdAt_idx" ON "AiMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "AiMessage_organizationId_idx" ON "AiMessage"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "AiUsage_turnId_key" ON "AiUsage"("turnId");

-- CreateIndex
CREATE INDEX "AiUsage_organizationId_windowStart_idx" ON "AiUsage"("organizationId", "windowStart");

-- CreateIndex
CREATE INDEX "AiUsage_organizationId_userId_windowStart_idx" ON "AiUsage"("organizationId", "userId", "windowStart");

-- CreateIndex
CREATE INDEX "AiUsage_organizationId_startedAt_idx" ON "AiUsage"("organizationId", "startedAt");

-- CreateIndex
CREATE INDEX "AiUsage_conversationId_idx" ON "AiUsage"("conversationId");

-- CreateIndex
CREATE INDEX "AiSetting_key_effectiveFrom_idx" ON "AiSetting"("key", "effectiveFrom");

-- CreateIndex
CREATE INDEX "AiSettingOverride_organizationId_key_effectiveFrom_idx" ON "AiSettingOverride"("organizationId", "key", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "AiBusinessSetting_organizationId_key" ON "AiBusinessSetting"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "AiPersonSetting_organizationId_userId_key" ON "AiPersonSetting"("organizationId", "userId");

-- AddForeignKey
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSettingOverride" ADD CONSTRAINT "AiSettingOverride_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiBusinessSetting" ADD CONSTRAINT "AiBusinessSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiPersonSetting" ADD CONSTRAINT "AiPersonSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- What the API writes, held in the database too: counts and cost never
-- below zero, a reason on every setting, an override that ends after it starts.
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_counts_check"
  CHECK ("inputTokens" >= 0 AND "cacheReadTokens" >= 0
         AND "cacheWrite5mTokens" >= 0 AND "cacheWrite1hTokens" >= 0
         AND "outputTokens" >= 0 AND "thinkingTokens" >= 0
         AND "costMicroUsd" >= 0);
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_finished_check"
  CHECK (("outcome" = 'RUNNING') = ("finishedAt" IS NULL)
         AND ("outcome" <> 'RUNNING' OR NOT "counted"));
ALTER TABLE "AiSetting" ADD CONSTRAINT "AiSetting_reason_check"
  CHECK (length(btrim("reason")) > 0);
ALTER TABLE "AiSettingOverride" ADD CONSTRAINT "AiSettingOverride_reason_check"
  CHECK (length(btrim("reason")) > 0);
ALTER TABLE "AiSettingOverride" ADD CONSTRAINT "AiSettingOverride_window_check"
  CHECK ("expiresAt" IS NULL OR "expiresAt" > "effectiveFrom");

-- A setting and an override are written once: a change is a new row, so
-- the history is the table.
CREATE OR REPLACE FUNCTION "ai_setting_written_once"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION '% % is written once and cannot change', TG_TABLE_NAME, OLD."id"
        USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "AiSetting_written_once" ON "AiSetting";
CREATE TRIGGER "AiSetting_written_once"
    BEFORE UPDATE ON "AiSetting"
    FOR EACH ROW EXECUTE FUNCTION "ai_setting_written_once"();

DROP TRIGGER IF EXISTS "AiSettingOverride_written_once" ON "AiSettingOverride";
CREATE TRIGGER "AiSettingOverride_written_once"
    BEFORE UPDATE ON "AiSettingOverride"
    FOR EACH ROW EXECUTE FUNCTION "ai_setting_written_once"();

-- Row-level security (#53) on every table a business owns. AiSetting is
-- Saroh-wide and has none (NOT_TENANT_OWNED in rls-coverage.test.ts).
ALTER TABLE "AiConversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiConversation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "AiConversation"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "AiMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiMessage" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "AiMessage"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "AiUsage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiUsage" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "AiUsage"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "AiSettingOverride" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiSettingOverride" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "AiSettingOverride"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "AiBusinessSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiBusinessSetting" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "AiBusinessSetting"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "AiPersonSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiPersonSetting" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "AiPersonSetting"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

