import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { FeatureFlagModule } from "../feature-flags/feature-flags.module";
import { OrganizationsModule } from "../organizations/organizations.module";

import { StoresController } from "./stores.controller";
import { StoresService } from "./stores.service";

@Module({
    imports: [FeatureFlagModule, forwardRef(() => OrganizationsModule)],
    controllers: [StoresController],
    providers: [StoresService, OrganizationGuard],
    exports: [StoresService],
})
export class StoresModule {}
