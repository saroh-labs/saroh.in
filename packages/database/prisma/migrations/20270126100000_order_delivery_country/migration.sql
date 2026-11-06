-- A Global delivery's country gets its own column, ISO 3166-1 alpha-2
-- (DEC-207). Nullable: existing rows stay as they are, and India's stays null.
ALTER TABLE "Order" ADD COLUMN     "deliveryCountry" TEXT;
