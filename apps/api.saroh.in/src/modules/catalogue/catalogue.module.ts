import { Module } from "@nestjs/common";

import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { StoresModule } from "../stores/stores.module";
import { CatalogueController } from "./catalogue.controller";
import { CatalogueService } from "./catalogue.service";
import { OptionsService } from "./options.service";
import { SkuService } from "./sku.service";

@Module({
    imports: [StoresModule, CapabilitiesModule],
    controllers: [CatalogueController],
    providers: [CatalogueService, OptionsService, SkuService],
    exports: [CatalogueService],
})
export class CatalogueModule {}
