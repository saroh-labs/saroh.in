import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import {
    OrganizationCollectionsController,
    ProductCollectionsController,
} from "./collections.controller";
import { CollectionsService } from "./collections.service";

@Module({
    imports: [CapabilitiesModule, forwardRef(() => OrganizationsModule)],
    controllers: [
        OrganizationCollectionsController,
        ProductCollectionsController,
    ],
    providers: [CollectionsService, OrganizationGuard],
    exports: [CollectionsService],
})
export class CollectionsModule {}
