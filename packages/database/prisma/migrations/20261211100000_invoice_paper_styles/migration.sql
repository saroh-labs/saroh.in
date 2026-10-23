-- Invoice styles (DEC-173, U6 #1118): the business's default style and
-- colour (`BusinessProfile.invoiceStyle`, `.invoiceColour`), and the ones
-- an invoice was issued in (`Invoice.paperStyle`, `.paperColour`), frozen
-- at issue. Null style is Classic and null colour is ink, so every invoice
-- already issued reads as it does today and needs no backfill.
-- Additive only.

-- AlterTable
ALTER TABLE "BusinessProfile" ADD COLUMN     "invoiceColour" TEXT,
ADD COLUMN     "invoiceStyle" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "paperColour" TEXT,
ADD COLUMN     "paperStyle" TEXT;
