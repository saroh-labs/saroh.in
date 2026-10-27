-- Messaging core (27 Oct): Saroh's own sender's outbound
-- messages that aren't verification codes, each provider webhook event once,
-- the last time a number wrote to Saroh's WhatsApp (the 24-hour window), and
-- monthly usage counts. Platform-level, no organization, so no row-level
-- security policy (all four are named in
-- `packages/database/src/rls-coverage.test.ts`). Additive only.

-- CreateEnum
CREATE TYPE "MessagingUsageChannel" AS ENUM ('OTP', 'WHATSAPP', 'SMS');

-- CreateTable
CREATE TABLE "MessagingMessage" (
    "id" TEXT NOT NULL,
    "channel" "MessagingChannel" NOT NULL,
    "templateName" TEXT,
    "templateCategory" TEXT,
    "numberHash" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "status" "MessagingSendStatus" NOT NULL DEFAULT 'QUEUED',
    "failureReason" TEXT,
    "sealedRequest" JSONB,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessagingMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessagingWebhookEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessagingWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessagingContactWindow" (
    "numberHash" TEXT NOT NULL,
    "lastInboundAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessagingContactWindow_pkey" PRIMARY KEY ("numberHash")
);

-- CreateTable
CREATE TABLE "MessagingUsage" (
    "month" TEXT NOT NULL,
    "channel" "MessagingUsageChannel" NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessagingUsage_pkey" PRIMARY KEY ("month","channel")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessagingMessage_providerMessageId_key" ON "MessagingMessage"("providerMessageId");

-- CreateIndex
CREATE INDEX "MessagingMessage_numberHash_createdAt_idx" ON "MessagingMessage"("numberHash", "createdAt");

-- CreateIndex
CREATE INDEX "MessagingWebhookEvent_createdAt_idx" ON "MessagingWebhookEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessagingWebhookEvent_eventId_status_key" ON "MessagingWebhookEvent"("eventId", "status");


ALTER TABLE "MessagingUsage" ADD CONSTRAINT "MessagingUsage_count_check" CHECK ("count" >= 0);
