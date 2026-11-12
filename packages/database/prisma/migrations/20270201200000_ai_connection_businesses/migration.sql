-- MCP (plan 2026-11-10-001, R1): an AI connection reaches several
-- businesses. The set ticked at consent is the grant's `referenceId`; this
-- column is the set it reaches now (a disconnect from one business removes
-- that one). Expand-only: defaults empty, no backfill (nothing released).

-- AlterTable
ALTER TABLE "OauthConsent" ADD COLUMN "organizationIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
