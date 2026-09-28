-- Class packs, round-2 E13 (defaults 45, 46): a pack's kind and "first pack
-- only", how each sale was paid, extensions to a holder's use-by date, and
-- the pack's history.
--
-- Additive (expand only): two columns with defaults and one nullable column
-- the previous API image never reads or writes, two new tables it never
-- touches, and two unique indexes on (id, organizationId) that cannot fail
-- because `id` is already unique. Every existing pack reads as open to
-- anyone, and every existing sale as "not recorded".
--
-- Rollback: the previous image ignores all of it. An extension has already
-- moved `PackPurchase.expiresAt`, which it reads as the use-by date, so a
-- holder keeps their extra days.

-- AlterTable
ALTER TABLE "ClassPack" ADD COLUMN     "firstPackOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'CLASSES';

-- AlterTable
ALTER TABLE "PackPurchase" ADD COLUMN     "paidBy" TEXT;

-- CreateTable
CREATE TABLE "PackExtension" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresBefore" TIMESTAMP(3) NOT NULL,
    "expiresAfter" TIMESTAMP(3) NOT NULL,
    "byUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackExtension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "kind" TEXT NOT NULL,
    "actorKind" TEXT NOT NULL,
    "actorUserId" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PackExtension_organizationId_purchaseId_idx" ON "PackExtension"("organizationId", "purchaseId");

-- CreateIndex
CREATE INDEX "PackEvent_organizationId_packId_createdAt_idx" ON "PackEvent"("organizationId", "packId", "createdAt");

-- CreateIndex
CREATE INDEX "PackEvent_purchaseId_idx" ON "PackEvent"("purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassPack_id_organizationId_key" ON "ClassPack"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PackPurchase_id_organizationId_key" ON "PackPurchase"("id", "organizationId");

-- AddForeignKey
ALTER TABLE "PackExtension" ADD CONSTRAINT "PackExtension_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackExtension" ADD CONSTRAINT "PackExtension_purchaseId_organizationId_fkey" FOREIGN KEY ("purchaseId", "organizationId") REFERENCES "PackPurchase"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackEvent" ADD CONSTRAINT "PackEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackEvent" ADD CONSTRAINT "PackEvent_packId_organizationId_fkey" FOREIGN KEY ("packId", "organizationId") REFERENCES "ClassPack"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackEvent" ADD CONSTRAINT "PackEvent_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "PackPurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- An extension adds 1 to 30 days (default 46); the API checks it first.
ALTER TABLE "PackExtension" ADD CONSTRAINT "PackExtension_days_range" CHECK ("days" BETWEEN 1 AND 30);

-- A pack that already pays only for one-to-one sessions (every service it
-- covers takes one person) becomes a One-to-one pack, so its holders keep
-- using it now that the kind decides what a pack pays for. Everything else
-- stays Classes. Runs once, at migrate time; the previous image never reads
-- the column.
UPDATE "ClassPack" p SET "kind" = 'ONE_TO_ONE'
WHERE EXISTS (SELECT 1 FROM "ClassPackService" cps WHERE cps."packId" = p.id)
  AND NOT EXISTS (
    SELECT 1 FROM "ClassPackService" cps
    JOIN "Service" s ON s.id = cps."serviceId"
    WHERE cps."packId" = p.id AND s.capacity > 1
  );

-- Row-level security, as every business-owned table (PRODUCT_STRATEGY §25).
ALTER TABLE "PackExtension" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PackExtension" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "PackExtension"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "PackEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PackEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "PackEvent"
  USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
         OR "organizationId" = current_setting('app.current_organization_id', true));
