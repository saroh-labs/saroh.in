-- A treatment is one order whose line bills a Service (round 2, E9;
-- DEC-050). An order line bills a product or a service, never both and never
-- neither; a booking can be one visit of such an order. Additive: every
-- existing line has a product, so the line CHECK holds on day one, and every
-- existing booking has neither an order nor a visit number. Both tables
-- already carry their org_isolation policies, so no RLS change is needed.

-- AlterEnum: a store customer linked to a contact because they booked a
-- treatment (the order's customer is found or made by the booking's email).
ALTER TYPE "CustomerLinkReason" ADD VALUE 'BOOKING';

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "serviceId" TEXT,
ALTER COLUMN "productId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "orderId" TEXT,
ADD COLUMN     "visitNumber" INTEGER;

-- CreateIndex
CREATE INDEX "OrderItem_serviceId_idx" ON "OrderItem"("serviceId");

-- CreateIndex: one live booking per visit. A cancelled visit leaves it, so
-- the visit can be booked again; the many bookings with no order coexist.
CREATE UNIQUE INDEX "Booking_one_live_visit" ON "Booking"("orderId", "visitNumber") WHERE (status <> 'CANCELLED');

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prisma cannot declare a CHECK, and does not read one as drift. The API
-- writes these shapes only; the database refuses anything else.

-- A line bills exactly one thing: a product or a service.
ALTER TABLE "OrderItem"
    ADD CONSTRAINT "OrderItem_bills_one_thing"
    CHECK (num_nonnulls("productId", "serviceId") = 1);

-- A visit of an order always says which visit it is, and only a positive
-- one. The reverse is left open on purpose: the order key is SET NULL when
-- an order is deleted (its storefront removed), and PostgreSQL 14 cannot
-- null the visit number with it, so such a booking keeps the number it had.
ALTER TABLE "Booking"
    ADD CONSTRAINT "Booking_visit_of_order"
    CHECK (
        ("orderId" IS NULL OR "visitNumber" IS NOT NULL)
        AND ("visitNumber" IS NULL OR "visitNumber" >= 1)
    );
