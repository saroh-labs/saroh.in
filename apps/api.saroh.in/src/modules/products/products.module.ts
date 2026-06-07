import { Module } from "@nestjs/common";

import { StoresModule } from "../stores/stores.module";
import { InventoryService } from "./inventory.service";
import { ProductDetailsController } from "./product-details.controller";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";
import { VariantsService } from "./variants.service";

@Module({
    imports: [StoresModule],
    controllers: [ProductsController, ProductDetailsController],
    providers: [ProductsService, VariantsService, InventoryService],
    exports: [ProductsService],
})
export class ProductsModule {}
