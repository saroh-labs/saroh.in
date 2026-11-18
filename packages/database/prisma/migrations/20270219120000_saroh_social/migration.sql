-- Saroh Social (plan saroh-social 2026-11-18-001, U2): a business's
-- connected Instagram, Facebook Page and Threads accounts, the posts Saroh
-- publishes for it and one delivery per post and channel, the Facebook
-- Page choice while someone picks, Request more at the monthly limit, and
-- what Meta's data deletion callback deleted.
--
-- New tables only, additive, no backfill. The image still serving during
-- the deploy reads none of it. Tokens are sealed by the API
-- (SOCIAL_ENC_KEY); no column holds one in the clear.

-- CreateEnum
CREATE TYPE "SocialChannelKind" AS ENUM ('INSTAGRAM', 'FACEBOOK', 'THREADS');

-- CreateEnum
CREATE TYPE "SocialChannelStatus" AS ENUM ('CONNECTED', 'NEEDS_ATTENTION');

-- CreateEnum
CREATE TYPE "SocialPostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHING', 'DONE', 'PARTLY_DONE', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SocialDeliveryStatus" AS ENUM ('WAITING', 'POSTING', 'POSTED', 'FAILED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "SocialChannel" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "SocialChannelKind" NOT NULL,
    "accountId" TEXT NOT NULL,
    "platformUserId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "tokenCiphertext" TEXT,
    "tokenIv" TEXT,
    "tokenAuthTag" TEXT,
    "tokenIssuedAt" TIMESTAMP(3),
    "tokenExpiresAt" TIMESTAMP(3),
    "grantExpiresAt" TIMESTAMP(3),
    "status" "SocialChannelStatus" NOT NULL DEFAULT 'CONNECTED',
    "attentionReason" TEXT,
    "attentionAt" TIMESTAMP(3),
    "refreshJobId" TEXT,
    "connectedByUserId" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialConnectChoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "SocialChannelKind" NOT NULL,
    "platformUserId" TEXT NOT NULL,
    "choicesCiphertext" TEXT NOT NULL,
    "choicesIv" TEXT NOT NULL,
    "choicesAuthTag" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialConnectChoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialPost" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "sourceKind" TEXT NOT NULL,
    "sourceRef" TEXT,
    "title" TEXT NOT NULL DEFAULT '',
    "picture" TEXT NOT NULL DEFAULT 'card',
    "cardStyle" TEXT NOT NULL DEFAULT 'photo',
    "size" TEXT NOT NULL DEFAULT 'post',
    "headline" TEXT,
    "mediaId" TEXT,
    "imageKey" TEXT,
    "imageUrl" TEXT,
    "caption" TEXT NOT NULL DEFAULT '',
    "captions" JSONB,
    "linkPath" TEXT NOT NULL DEFAULT '/',
    "ref" TEXT NOT NULL,
    "status" "SocialPostStatus" NOT NULL DEFAULT 'DRAFT',
    "publishAt" TIMESTAMP(3),
    "zone" TEXT,
    "publishJobId" TEXT,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialDelivery" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "kind" "SocialChannelKind" NOT NULL,
    "channelId" TEXT,
    "status" "SocialDeliveryStatus" NOT NULL DEFAULT 'WAITING',
    "containerId" TEXT,
    "checks" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "platformPostId" TEXT,
    "permalink" TEXT,
    "reason" TEXT,
    "retryAfter" TIMESTAMP(3),
    "lastTriedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "windowKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialDeletion" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "SocialChannelKind" NOT NULL,
    "channels" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialDeletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialChannel_kind_platformUserId_idx" ON "SocialChannel"("kind", "platformUserId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialChannel_organizationId_kind_key" ON "SocialChannel"("organizationId", "kind");

-- CreateIndex
CREATE INDEX "SocialConnectChoice_organizationId_userId_idx" ON "SocialConnectChoice"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "SocialPost_organizationId_publishAt_idx" ON "SocialPost"("organizationId", "publishAt");

-- CreateIndex
CREATE INDEX "SocialPost_organizationId_status_idx" ON "SocialPost"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SocialPost_organizationId_ref_key" ON "SocialPost"("organizationId", "ref");

-- CreateIndex
CREATE INDEX "SocialDelivery_channelId_status_idx" ON "SocialDelivery"("channelId", "status");

-- CreateIndex
CREATE INDEX "SocialDelivery_organizationId_status_idx" ON "SocialDelivery"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SocialDelivery_postId_kind_key" ON "SocialDelivery"("postId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "SocialRequest_organizationId_windowKey_key" ON "SocialRequest"("organizationId", "windowKey");

-- CreateIndex
CREATE UNIQUE INDEX "SocialDeletion_code_key" ON "SocialDeletion"("code");

-- AddForeignKey
ALTER TABLE "SocialChannel" ADD CONSTRAINT "SocialChannel_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialConnectChoice" ADD CONSTRAINT "SocialConnectChoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialDelivery" ADD CONSTRAINT "SocialDelivery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialDelivery" ADD CONSTRAINT "SocialDelivery_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialDelivery" ADD CONSTRAINT "SocialDelivery_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "SocialChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialRequest" ADD CONSTRAINT "SocialRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security: each business sees only its own rows. SocialDeletion
-- names no business: the public status page reads it by its code.
ALTER TABLE "SocialChannel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SocialChannel" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "SocialChannel"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
ALTER TABLE "SocialConnectChoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SocialConnectChoice" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "SocialConnectChoice"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
ALTER TABLE "SocialPost" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SocialPost" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "SocialPost"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
ALTER TABLE "SocialDelivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SocialDelivery" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "SocialDelivery"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
ALTER TABLE "SocialRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SocialRequest" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "SocialRequest"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
