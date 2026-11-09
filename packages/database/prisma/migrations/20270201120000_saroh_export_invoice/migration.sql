-- AlterTable
ALTER TABLE "SarohInvoice" ADD COLUMN     "billToCountry" TEXT,
ADD COLUMN     "billToTaxId" TEXT,
ADD COLUMN     "exportNote" TEXT,
ADD COLUMN     "providerBaseAmount" INTEGER,
ADD COLUMN     "providerBaseCurrency" TEXT;


-- An export of services to a business abroad carries no tax (stage 9, KTD6).
ALTER TABLE "SarohInvoice" DROP CONSTRAINT "SarohInvoice_tax_type_known";
ALTER TABLE "SarohInvoice" ADD CONSTRAINT "SarohInvoice_tax_type_known"
  CHECK ("taxType" IN ('INTRA', 'INTER', 'EXPORT'));
ALTER TABLE "SarohInvoice" DROP CONSTRAINT "SarohInvoice_tax_split";
ALTER TABLE "SarohInvoice" ADD CONSTRAINT "SarohInvoice_tax_split"
  CHECK (("taxType" = 'INTRA' AND "igstPaise" = 0)
      OR ("taxType" = 'INTER' AND "cgstPaise" = 0 AND "sgstPaise" = 0)
      OR ("taxType" = 'EXPORT' AND "taxPaise" = 0));
