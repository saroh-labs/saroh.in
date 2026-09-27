-- Orders placed at a site's checkout (plan B, B1; G13 writes them). The
-- Orders list leaves out a `placedOnline` order that is still UNPAID: an
-- abandoned checkout, not an order. Additive: a defaulted boolean and a
-- nullable timestamp, so the image still serving during the deploy (which
-- names neither column) keeps reading and writing orders unchanged. Every
-- existing order was taken by staff, so false is its true value.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "placedOnline" BOOLEAN NOT NULL DEFAULT false;
