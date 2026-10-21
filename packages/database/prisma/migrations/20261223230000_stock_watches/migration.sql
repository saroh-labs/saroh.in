-- "Tell me when it's back" (automatic notices U23 #1154, DEC-174): someone
-- who found a product, or one option of it, sold out on a business's site
-- leaves their email to hear once when it can be bought again. The opt-in is
-- consent for that one email; the address is not made a contact. One open
-- watch per address per product or option (two partial unique indexes, since
-- a NULL variant never collides). Additive only.

-- CreateTable
CREATE TABLE "StockWatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "siteId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "contactId" TEXT,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "toldAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "StockWatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockWatch_organizationId_productId_idx" ON "StockWatch"("organizationId", "productId");

-- CreateIndex
CREATE INDEX "StockWatch_siteId_idx" ON "StockWatch"("siteId");

-- CreateIndex
CREATE INDEX "StockWatch_variantId_idx" ON "StockWatch"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "StockWatch_open_product_key" ON "StockWatch"("organizationId", "productId", "email") WHERE ("variantId" IS NULL AND "toldAt" IS NULL AND "cancelledAt" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "StockWatch_open_variant_key" ON "StockWatch"("organizationId", "productId", "variantId", "email") WHERE ("variantId" IS NOT NULL AND "toldAt" IS NULL AND "cancelledAt" IS NULL);

-- AddForeignKey
ALTER TABLE "StockWatch" ADD CONSTRAINT "StockWatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockWatch" ADD CONSTRAINT "StockWatch_productId_organizationId_fkey" FOREIGN KEY ("productId", "organizationId") REFERENCES "Product"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockWatch" ADD CONSTRAINT "StockWatch_variantId_productId_fkey" FOREIGN KEY ("variantId", "productId") REFERENCES "ProductVariant"("id", "productId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockWatch" ADD CONSTRAINT "StockWatch_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- An address is never empty, and is stored lower-cased.
ALTER TABLE "StockWatch" ADD CONSTRAINT "StockWatch_email_check"
    CHECK (length(btrim("email")) > 0 AND "email" = lower("email"));

-- Row-level security, as its product's (Product, StockLevel, StockEntry). The
-- public "Tell me" writes it in the site's business's context.
ALTER TABLE "StockWatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockWatch" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "StockWatch";
CREATE POLICY "org_isolation" ON "StockWatch"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
