-- How a business's prices carry GST (12 Oct 2026, amending ADR-008): the
-- business chooses "My prices include GST" (INCLUDED) or "GST is added to
-- my prices" (ADDED), and a service or product may say otherwise. Additive:
-- the business column defaults to INCLUDED, which is what every price meant
-- before the choice existed, and the item columns are null ("same as the
-- business"), so no total moves and the previous API image, which never
-- reads them, is unaffected. An order line and an invoice line record what
-- they were charged under; null on every row from before, which included
-- GST. Row-level security on the five tables is unchanged.

-- AlterTable
ALTER TABLE "BusinessProfile" ADD COLUMN     "gstPriceMode" TEXT NOT NULL DEFAULT 'INCLUDED';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "gstPriceMode" TEXT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "gstPriceMode" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "gstPriceMode" TEXT,
ADD COLUMN     "listPrice" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "gstPriceMode" TEXT;
