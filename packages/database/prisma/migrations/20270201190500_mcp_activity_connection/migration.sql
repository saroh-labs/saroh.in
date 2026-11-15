-- MCP (plan 2026-11-10-001, U10): the connection an activity row came
-- through (the OAuth grant's id or the API key's), so a restore point's
-- session is measured per connection. Expand-only: nullable, no backfill.

-- AlterTable
ALTER TABLE "McpActivity" ADD COLUMN "connectionId" TEXT;

-- CreateIndex
CREATE INDEX "McpActivity_organizationId_connectionId_createdAt_idx" ON "McpActivity"("organizationId", "connectionId", "createdAt");
