-- Round-2 D17: sending an invoice. A Message remembers the invoice it sent
-- or reminded about, and which transactional template wrote it. Additive
-- and nullable: the previous API never reads or writes them. "Message"
-- already has row-level security (20260719210000).
ALTER TABLE "Message" ADD COLUMN "invoiceId" TEXT;
ALTER TABLE "Message" ADD COLUMN "template" TEXT;

CREATE INDEX "Message_invoiceId_createdAt_idx" ON "Message"("invoiceId", "createdAt");

ALTER TABLE "Message" ADD CONSTRAINT "Message_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
