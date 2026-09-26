-- Collections (#516, U7 of the Products and Stock plan).
--
-- A collection is hand-picked (CollectionProduct rows, in order) or automatic
-- by category (Collection.categoryId; its products are read from the category
-- when asked, never stored) — never both. Both tables carry a required
-- organizationId, and composite keys tie a collection's category, and a
-- membership's collection and product, to the same business.
-- Additive and forward-only: nothing existing changes except a new unique
-- index on Category (id, organizationId) for the composite key.

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionProduct" (
    "collectionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionProduct_pkey" PRIMARY KEY ("collectionId","productId")
);

-- CreateIndex
CREATE INDEX "Collection_categoryId_idx" ON "Collection"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_organizationId_slug_key" ON "Collection"("organizationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_id_organizationId_key" ON "Collection"("id", "organizationId");

-- CreateIndex
CREATE INDEX "CollectionProduct_productId_idx" ON "CollectionProduct"("productId");

-- CreateIndex
CREATE INDEX "CollectionProduct_organizationId_idx" ON "CollectionProduct"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_id_organizationId_key" ON "Category"("id", "organizationId");

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_categoryId_organizationId_fkey" FOREIGN KEY ("categoryId", "organizationId") REFERENCES "Category"("id", "organizationId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionProduct" ADD CONSTRAINT "CollectionProduct_collectionId_organizationId_fkey" FOREIGN KEY ("collectionId", "organizationId") REFERENCES "Collection"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionProduct" ADD CONSTRAINT "CollectionProduct_productId_organizationId_fkey" FOREIGN KEY ("productId", "organizationId") REFERENCES "Product"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionProduct" ADD CONSTRAINT "CollectionProduct_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security: each isolated on its own organizationId.
ALTER TABLE "Collection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Collection" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "Collection";
CREATE POLICY "org_isolation" ON "Collection"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "CollectionProduct" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CollectionProduct" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON "CollectionProduct";
CREATE POLICY "org_isolation" ON "CollectionProduct"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
