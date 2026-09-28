-- Walk-in orders (plan B, B13), deploy 1 of 2: additive only.
-- An order taken at the counter for someone who leaves no email has no
-- storefront customer. The column becomes nullable and the walk-in's name
-- and phone get columns of their own. Nothing writes a null customer until
-- deploy 2; rolling this back is safe while no walk-in order exists.
ALTER TABLE "Order" ALTER COLUMN "customerId" DROP NOT NULL;
ALTER TABLE "Order" ADD COLUMN "walkInName" TEXT;
ALTER TABLE "Order" ADD COLUMN "walkInPhone" TEXT;
