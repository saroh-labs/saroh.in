-- When an invoice's current pay link was made (#870). Additive: the API
-- image before this one never reads it, and it is null on every existing
-- invoice, which the workspace reads as "date not known".

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "payLinkCreatedAt" TIMESTAMP(3);
