import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { MergeReportService } from "../products/merge-report.service";
import { StoresModule } from "../stores/stores.module";
import { AllergensService } from "./allergens.service";
import { CatalogueAccess } from "./catalogue-access";
import { OrganizationCatalogueController } from "./catalogue.controller";
import { CatalogueService } from "./catalogue.service";
import { FieldsService } from "./fields.service";
import { OptionsService } from "./options.service";
import { SkuService } from "./sku.service";
import { CatalogueController } from "./store-catalogue.controller";

@Module({
    imports: [
        StoresModule,
        CapabilitiesModule,
        forwardRef(() => OrganizationsModule),
    ],
    controllers: [OrganizationCatalogueController, CatalogueController],
    providers: [
        CatalogueAccess,
        CatalogueService,
        OptionsService,
        SkuService,
        FieldsService,
        AllergensService,
        MergeReportService,
        OrganizationGuard,
    ],
    exports: [CatalogueService, CatalogueAccess],
})
export class CatalogueModule {}
