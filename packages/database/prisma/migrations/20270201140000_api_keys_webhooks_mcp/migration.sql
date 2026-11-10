-- Public API and MCP (plan 2026-11-10-001, U3): API keys, storefront tokens,
-- webhooks, MCP activity and site restore points. Expand-only.
-- The keys table is "OrganizationApiKey": the legacy StoreApiKey holds "ApiKey".
-- CreateEnum
CREATE TYPE "ApiKeyKind" AS ENUM ('PUBLISHABLE', 'SECRET');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "OrganizationApiKey" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "kind" "ApiKeyKind" NOT NULL,
    "edition" "Edition" NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "tokenDigest" TEXT NOT NULL,
    "scope" TEXT[],
    "allowedOrigins" TEXT[],
    "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "rolledFromId" TEXT,
    "graceUntil" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorefrontToken" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "apiKeyId" TEXT NOT NULL,
    "tokenDigest" TEXT NOT NULL,
    "allowedOrigins" TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorefrontToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT[],
    "secretCiphertext" TEXT NOT NULL,
    "secretIv" TEXT NOT NULL,
    "secretAuthTag" TEXT NOT NULL,
    "disabledAt" TIMESTAMP(3),
    "failureStreak" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastStatusCode" INTEGER,
    "lastError" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpActivity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "apiKeyId" TEXT,
    "clientName" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "target" TEXT,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteRestorePoint" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "sessionStartedAt" TIMESTAMP(3) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteRestorePoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationApiKey_tokenDigest_key" ON "OrganizationApiKey"("tokenDigest");

-- CreateIndex
CREATE INDEX "OrganizationApiKey_organizationId_idx" ON "OrganizationApiKey"("organizationId");

-- CreateIndex
CREATE INDEX "OrganizationApiKey_rolledFromId_idx" ON "OrganizationApiKey"("rolledFromId");

-- CreateIndex
CREATE UNIQUE INDEX "StorefrontToken_tokenDigest_key" ON "StorefrontToken"("tokenDigest");

-- CreateIndex
CREATE INDEX "StorefrontToken_organizationId_idx" ON "StorefrontToken"("organizationId");

-- CreateIndex
CREATE INDEX "StorefrontToken_apiKeyId_idx" ON "StorefrontToken"("apiKeyId");

-- CreateIndex
CREATE INDEX "StorefrontToken_expiresAt_idx" ON "StorefrontToken"("expiresAt");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_organizationId_idx" ON "WebhookEndpoint"("organizationId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_organizationId_idx" ON "WebhookDelivery"("organizationId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_endpointId_createdAt_idx" ON "WebhookDelivery"("endpointId", "createdAt");

-- CreateIndex
CREATE INDEX "McpActivity_organizationId_idx" ON "McpActivity"("organizationId");

-- CreateIndex
CREATE INDEX "McpActivity_organizationId_createdAt_idx" ON "McpActivity"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "McpActivity_apiKeyId_idx" ON "McpActivity"("apiKeyId");

-- CreateIndex
CREATE INDEX "SiteRestorePoint_organizationId_idx" ON "SiteRestorePoint"("organizationId");

-- CreateIndex
CREATE INDEX "SiteRestorePoint_organizationId_siteId_createdAt_idx" ON "SiteRestorePoint"("organizationId", "siteId", "createdAt");

-- CreateIndex
CREATE INDEX "SiteRestorePoint_siteId_idx" ON "SiteRestorePoint"("siteId");

-- AddForeignKey
ALTER TABLE "OrganizationApiKey" ADD CONSTRAINT "OrganizationApiKey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationApiKey" ADD CONSTRAINT "OrganizationApiKey_rolledFromId_fkey" FOREIGN KEY ("rolledFromId") REFERENCES "OrganizationApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontToken" ADD CONSTRAINT "StorefrontToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorefrontToken" ADD CONSTRAINT "StorefrontToken_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "OrganizationApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpActivity" ADD CONSTRAINT "McpActivity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpActivity" ADD CONSTRAINT "McpActivity_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "OrganizationApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteRestorePoint" ADD CONSTRAINT "SiteRestorePoint_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteRestorePoint" ADD CONSTRAINT "SiteRestorePoint_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "OrganizationApiKey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrganizationApiKey" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "OrganizationApiKey";
CREATE POLICY "org_isolation" ON "OrganizationApiKey"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "StorefrontToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StorefrontToken" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "StorefrontToken";
CREATE POLICY "org_isolation" ON "StorefrontToken"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "WebhookEndpoint" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebhookEndpoint" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "WebhookEndpoint";
CREATE POLICY "org_isolation" ON "WebhookEndpoint"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "WebhookDelivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebhookDelivery" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "WebhookDelivery";
CREATE POLICY "org_isolation" ON "WebhookDelivery"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "McpActivity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "McpActivity" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "McpActivity";
CREATE POLICY "org_isolation" ON "McpActivity"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "SiteRestorePoint" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SiteRestorePoint" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "SiteRestorePoint";
CREATE POLICY "org_isolation" ON "SiteRestorePoint"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
