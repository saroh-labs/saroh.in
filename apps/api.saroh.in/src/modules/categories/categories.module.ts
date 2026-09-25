import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { CatalogueModule } from "../catalogue/catalogue.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import {
    CategoriesController,
    OrganizationCategoriesController,
} from "./categories.controller";
import { CategoriesService } from "./categories.service";

@Module({
    imports: [
        CatalogueModule,
        CapabilitiesModule,
        forwardRef(() => OrganizationsModule),
    ],
    controllers: [OrganizationCategoriesController, CategoriesController],
    providers: [CategoriesService, OrganizationGuard],
    exports: [CategoriesService],
})
export class CategoriesModule {}
