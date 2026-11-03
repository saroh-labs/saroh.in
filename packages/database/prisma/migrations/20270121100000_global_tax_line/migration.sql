-- A Global business's named tax line and numbering year (DEC-204). All null for
-- every business until now: India's numbers stay April to March, with GST.
ALTER TABLE "BusinessProfile" ADD COLUMN "taxName" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN "taxRate" DECIMAL(5,2);
ALTER TABLE "BusinessProfile" ADD COLUMN "yearStartMonth" INTEGER;
ALTER TABLE "Invoice" ADD COLUMN "taxLabel" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "sellerTaxId" TEXT;
