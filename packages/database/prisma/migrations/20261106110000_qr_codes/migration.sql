-- QR codes for a business's site, and how often each is scanned.
--
-- Two new tables and two nullable columns, additive only, no backfill. The
-- image still serving during the deploy reads none of it.
--
-- A code is a short link on the site's Saroh address, `/q/<code>`, which the
-- renderer now answers before any page. `/q` is reserved in the API
-- (`RESERVED_PAGE_PATHS`) from this release on. A page a merchant already
-- has under `/q/` would stop being reached, so check before this ships:
--
--   SELECT "siteId", "path" FROM "Page"
--    WHERE lower("path") = '/q' OR lower("path") LIKE '/q/%';
--
-- The block below says so in the deploy log if any exist. It changes and
-- refuses nothing: a page at exactly `/q` still opens, and one under it
-- needs a new address from its owner.
DO $$
DECLARE
    taken integer;
BEGIN
    SELECT count(*) INTO taken FROM "Page"
     WHERE lower("path") = '/q' OR lower("path") LIKE '/q/%';
    IF taken > 0 THEN
        RAISE WARNING 'qr_codes: % page(s) sit at or under /q, which the QR short link now owns', taken;
    END IF;
END $$;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "sourceCode" TEXT;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "sourceCode" TEXT;

-- CreateTable
CREATE TABLE "QrCode" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "targetKind" TEXT NOT NULL,
    "targetRef" TEXT,
    "place" TEXT NOT NULL,
    "placeNote" TEXT,
    "label" TEXT,
    "style" TEXT NOT NULL DEFAULT 'PLAIN',
    "color" TEXT NOT NULL,
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QrCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QrScanDay" (
    "qrCodeId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QrScanDay_pkey" PRIMARY KEY ("qrCodeId","day")
);

-- CreateIndex
CREATE INDEX "QrCode_organizationId_idx" ON "QrCode"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "QrCode_siteId_code_key" ON "QrCode"("siteId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "QrCode_id_organizationId_key" ON "QrCode"("id", "organizationId");

-- CreateIndex
CREATE INDEX "QrScanDay_organizationId_idx" ON "QrScanDay"("organizationId");

-- AddForeignKey
ALTER TABLE "QrCode" ADD CONSTRAINT "QrCode_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "Site"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QrCode" ADD CONSTRAINT "QrCode_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QrScanDay" ADD CONSTRAINT "QrScanDay_qrCodeId_organizationId_fkey" FOREIGN KEY ("qrCodeId", "organizationId") REFERENCES "QrCode"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QrScanDay" ADD CONSTRAINT "QrScanDay_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- The lists the API writes (`sites/qr-target.ts`), held in the database
-- too: a short lower-case id, a fixed set of targets, places and styles, a
-- reference exactly when the target needs one, and a colour that is only
-- ever "#rrggbb".
ALTER TABLE "QrCode" ADD CONSTRAINT "QrCode_code_check"
  CHECK ("code" ~ '^[0-9a-z]{3,6}$');
ALTER TABLE "QrCode" ADD CONSTRAINT "QrCode_targetKind_check"
  CHECK ("targetKind" IN ('SITE', 'SHOP', 'BOOK', 'PRODUCT', 'PAGE'));
ALTER TABLE "QrCode" ADD CONSTRAINT "QrCode_targetRef_check"
  CHECK (("targetKind" IN ('PRODUCT', 'PAGE')) = ("targetRef" IS NOT NULL));
ALTER TABLE "QrCode" ADD CONSTRAINT "QrCode_place_check"
  CHECK ("place" IN ('COUNTER', 'MIRROR', 'CARD', 'FLYER', 'OTHER'));
ALTER TABLE "QrCode" ADD CONSTRAINT "QrCode_style_check"
  CHECK ("style" IN ('PLAIN', 'BRANDED'));
ALTER TABLE "QrCode" ADD CONSTRAINT "QrCode_color_check"
  CHECK ("color" ~ '^#[0-9a-f]{6}$');
ALTER TABLE "QrScanDay" ADD CONSTRAINT "QrScanDay_count_check"
  CHECK ("count" >= 0);

-- Row-level security (#53).
ALTER TABLE "QrCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QrCode" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "QrCode"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "QrScanDay" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QrScanDay" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "QrScanDay"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
