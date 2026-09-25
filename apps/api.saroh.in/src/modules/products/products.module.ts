import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { AnalyticsCoreModule } from "../analytics/analytics-core.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { MediaModule } from "../media/media.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { StoresModule } from "../stores/stores.module";
import { InventoryService } from "./inventory.service";
import { OrganizationListingsController } from "./listings.controller";
import { ListingsService } from "./listings.service";
import { OrganizationProductsController } from "./organization-products.controller";
import { ProductAccess } from "./product-access";
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
        forwardRef(() => OrganizationsModule),
    ],
    controllers: [
        OrganizationProductsController,
        OrganizationListingsController,
        ProductsController,
        ProductDetailsController,
    ],
    providers: [
        ProductAccess,
        ProductsService,
        VariantsService,
        InventoryService,
        ProductImagesService,
        ProductOverviewService,
        ListingsService,
        OrganizationGuard,
    ],
    exports: [ProductsService],
})
export class ProductsModule {}
