import { Module } from "@nestjs/common";

import { AnalyticsCoreModule } from "../analytics/analytics-core.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { MediaModule } from "../media/media.module";
import { StoresModule } from "../stores/stores.module";
import { InventoryService } from "./inventory.service";
import { ProductDetailsController } from "./product-details.controller";
import { ProductImagesService } from "./product-images.service";
import { ProductOverviewService } from "./product-overview.service";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";
import { VariantsService } from "./variants.service";

@Module({
    imports: [
        StoresModule,
        CapabilitiesModule,
        AnalyticsCoreModule,
        MediaModule,
    ],
    controllers: [ProductsController, ProductDetailsController],
    providers: [
        ProductsService,
        VariantsService,
        InventoryService,
        ProductImagesService,
        ProductOverviewService,
    ],
    exports: [ProductsService],
})
export class ProductsModule {}
