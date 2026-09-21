import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { FeatureFlagModule } from "../feature-flags/feature-flags.module";
import { OrganizationsModule } from "../organizations/organizations.module";

import { StorefrontsController } from "./storefronts.controller";
import { StorefrontsService } from "./storefronts.service";
import { StoresController } from "./stores.controller";
import { StoresService } from "./stores.service";

@Module({
    imports: [
        FeatureFlagModule,
        CapabilitiesModule,
        forwardRef(() => OrganizationsModule),
    ],
    controllers: [StoresController, StorefrontsController],
    providers: [StoresService, StorefrontsService, OrganizationGuard],
    exports: [StoresService],
})
export class StoresModule {}
