-- The ₹1 autopay check (round-2 D12B, DEC-064): turning autopay on with
-- nothing owed by UPI or card takes the provider's minimum to authorise and
-- refunds it. The check is a PaymentIntent on no order or invoice, marked
-- `purpose` = 'AUTHORISATION' and tied to the mandate set-up it authorised.
--
-- Expand only: two nullable columns on a table that already carries
-- row-level security (20260719190006_payments), and the one-target
-- CHECK loosened to let an AUTHORISATION intent name neither. Every intent
-- the previous API writes still has exactly one target; it never writes or
-- reads the new columns.

-- AlterTable
ALTER TABLE "PaymentIntent" ADD COLUMN     "checkForMandateId" TEXT,
ADD COLUMN     "purpose" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_checkForMandateId_key" ON "PaymentIntent"("checkForMandateId");

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_checkForMandateId_fkey" FOREIGN KEY ("checkForMandateId") REFERENCES "PaymentMandate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Exactly one of orderId / invoiceId, or neither on an autopay check.
-- Prisma cannot declare a CHECK, so it lives here only (schema.prisma says so).
-- `purpose IS NOT NULL` keeps the OR from being NULL on a sale — a CHECK
-- that comes out NULL passes, which would let a sale name no target.
ALTER TABLE "PaymentIntent" DROP CONSTRAINT "PaymentIntent_one_target";
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_one_target"
    CHECK (
        (("orderId" IS NULL) <> ("invoiceId" IS NULL))
        OR ("purpose" IS NOT NULL AND "purpose" = 'AUTHORISATION' AND "orderId" IS NULL AND "invoiceId" IS NULL)
    );
