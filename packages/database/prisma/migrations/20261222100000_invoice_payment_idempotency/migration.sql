-- Record payment's idempotency key (code review #6, 20 Oct): the sheet
-- sends one key per opening, and a retry with it answers with the payment
-- already written instead of a second one. It replaces the ten-minute
-- "same method, reference and amount" match, which swallowed a genuine
-- second payment of the same amount. Null for every other writer; NULLs
-- never collide, so the unique index holds only keyed rows. The table's
-- RLS policy already covers the new column.
--
-- A cheque in the bank can bounce later (code review #7): banks return
-- cheques days after they went in. The cheque CHECK is rewritten so a
-- BOUNCED cheque may keep the `clearedAt` it had, and the history and the
-- pay page can say it was returned after it was banked. Every row the old
-- CHECK allowed still passes; a CLEARED cheque still needs its date, and a
-- WAITING one has none.

-- AlterTable
ALTER TABLE "InvoicePayment" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "InvoicePayment_invoiceId_idempotencyKey_key" ON "InvoicePayment"("invoiceId", "idempotencyKey");

-- The cheque's shape, with a banked date allowed on a bounced cheque.
ALTER TABLE "InvoicePayment" DROP CONSTRAINT "InvoicePayment_cheque_check";
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_cheque_check"
    CHECK ((("method" = 'CHEQUE') = ("bankStatus" IS NOT NULL))
           AND ("bankStatus" IS NULL OR "bankStatus" IN ('WAITING', 'CLEARED', 'BOUNCED'))
           AND ("bankStatus" IS DISTINCT FROM 'CLEARED' OR "clearedAt" IS NOT NULL)
           AND ("clearedAt" IS NULL OR "bankStatus" IN ('CLEARED', 'BOUNCED'))
           AND (("bankStatus" IS NOT DISTINCT FROM 'BOUNCED') = ("bouncedAt" IS NOT NULL))
           AND ("bounceReason" IS NULL OR "bankStatus" IS NOT DISTINCT FROM 'BOUNCED')
           AND (("chequeNumber" IS NULL AND "chequeBank" IS NULL) OR "method" = 'CHEQUE'));
