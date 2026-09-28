-- Product fulfilment types (B12, DEC-045; plan B, default 15).
--
-- The ways a product can be fulfilled. Empty (every existing row) means
-- every way its storefronts offer, so no order changes what it offers.
-- Only the new names are ever stored here (PICKUP, LOCAL_DELIVERY, SHIPPING,
-- DIGITAL): release 3 (B2d) casts this column with the others when it drops
-- COLLECT and DELIVERY, and finds nothing to convert.
--
-- Needs release 1 (B2a): the enum values it names. A catalogue change under
-- a brief ACCESS EXCLUSIVE lock on "Product" with a constant default: no
-- rewrite, constant time. The image before it never selects the column.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "fulfilmentTypes" "OrderFulfilment"[] DEFAULT ARRAY[]::"OrderFulfilment"[];
