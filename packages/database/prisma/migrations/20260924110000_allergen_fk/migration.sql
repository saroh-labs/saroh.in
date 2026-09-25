-- DropForeignKey
ALTER TABLE "ProductAllergen" DROP CONSTRAINT "ProductAllergen_allergenId_fkey";

-- AddForeignKey
ALTER TABLE "ProductAllergen" ADD CONSTRAINT "ProductAllergen_allergenId_fkey" FOREIGN KEY ("allergenId") REFERENCES "StoreAllergen"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

