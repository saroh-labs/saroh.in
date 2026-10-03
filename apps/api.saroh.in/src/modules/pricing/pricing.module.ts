import { Module } from "@nestjs/common";

import { CatalogueService } from "./catalogue.service";
import { ImpactService } from "./impact.service";
import { PublicPricingController } from "./public-pricing.controller";

/**
 * Saroh's own plans catalogue (plans catalogue U3): the public price list
 * here, and the services the admin module's `AdminPricingController` uses.
 * The admin controller is registered there, not here, so it runs behind the
 * control plane's guards and is covered by its permission contract.
 */
@Module({
    controllers: [PublicPricingController],
    providers: [CatalogueService, ImpactService],
    exports: [CatalogueService, ImpactService],
})
export class PricingModule {}
