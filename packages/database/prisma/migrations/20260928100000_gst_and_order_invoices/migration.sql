-- GST, and an invoice for every order (ADR-008, plan 2026-09-23-003 U5).
--
-- No new tables: every column lands on a table that already has its
-- org_isolation policy (Invoice, InvoiceLine, InvoiceSequence) or is scoped
-- through its owner (Product, Service, BusinessProfile).

-- AlterTable
ALTER TABLE "BusinessProfile" ADD COLUMN     "deliveryGstRate" DECIMAL(5,2) NOT NULL DEFAULT 18,
ADD COLUMN     "deliverySacCode" TEXT,
ADD COLUMN     "gstRegistered" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gstState" TEXT,
ADD COLUMN     "invoicePrefix" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "gstRate" DECIMAL(5,2),
ADD COLUMN     "hsnCode" TEXT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "gstRate" DECIMAL(5,2),
ADD COLUMN     "sacCode" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "billToAddress" TEXT,
ADD COLUMN     "billToGstin" TEXT,
ADD COLUMN     "billToState" TEXT,
ADD COLUMN     "bookingId" TEXT,
ADD COLUMN     "cgst" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "igst" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'INVOICE',
ADD COLUMN     "orderId" TEXT,
ADD COLUMN     "paymentRefundId" TEXT,
ADD COLUMN     "placeOfSupply" TEXT,
ADD COLUMN     "relatedInvoiceId" TEXT,
ADD COLUMN     "sellerGstin" TEXT,
ADD COLUMN     "sellerState" TEXT,
ADD COLUMN     "sgst" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxType" TEXT;

-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "cgst" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "gstRate" DECIMAL(5,2),
ADD COLUMN     "hsnSac" TEXT,
ADD COLUMN     "igst" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "orderItemId" TEXT,
ADD COLUMN     "sgst" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxableValue" DECIMAL(12,2);

-- AlterTable: one counter per business AND series. Every existing row lands
-- in the legacy INV series through the column default, so its count carries
-- on: existing invoices keep their numbers (INV-0001…), and a business that
-- never sets a prefix keeps numbering where it was.
ALTER TABLE "InvoiceSequence" DROP CONSTRAINT "InvoiceSequence_pkey",
ADD COLUMN     "series" TEXT NOT NULL DEFAULT 'INV',
ADD CONSTRAINT "InvoiceSequence_pkey" PRIMARY KEY ("organizationId", "series");

-- Said again so the data move is on the page, not only in a default.
UPDATE "InvoiceSequence" SET "series" = 'INV' WHERE "series" <> 'INV';

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_paymentRefundId_key" ON "Invoice"("paymentRefundId");

-- CreateIndex
CREATE INDEX "Invoice_orderId_idx" ON "Invoice"("orderId");

-- CreateIndex
CREATE INDEX "Invoice_bookingId_idx" ON "Invoice"("bookingId");

-- CreateIndex
CREATE INDEX "Invoice_relatedInvoiceId_idx" ON "Invoice"("relatedInvoiceId");

-- CreateIndex: one invoice per order and per booking — the payment
-- reconciliation's idempotency key. Corrections are other kinds.
CREATE UNIQUE INDEX "Invoice_one_per_order" ON "Invoice"("orderId") WHERE (kind = 'INVOICE');

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_one_per_booking" ON "Invoice"("bookingId") WHERE (kind = 'INVOICE');

-- CreateIndex
CREATE INDEX "InvoiceLine_orderItemId_idx" ON "InvoiceLine"("orderItemId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_relatedInvoiceId_fkey" FOREIGN KEY ("relatedInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paymentRefundId_fkey" FOREIGN KEY ("paymentRefundId") REFERENCES "PaymentRefund"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- What an invoice is. Checked here as well as in code: a stray value would
-- fall out of every sum that filters on kind. (Prisma does not model CHECK
-- constraints, so this is not drift.)
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_kind_check"
    CHECK ("kind" IN ('INVOICE', 'CREDIT_NOTE', 'SUPPLEMENTARY'));
