import { Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { HomeController } from "./home.controller";
import { HomeService } from "./home.service";

/**
 * Home module (#119). Depends on CapabilitiesModule for the module-availability
 * projection and OrganizationsModule for the OrganizationGuard's context service.
 */
@Module({
    imports: [CapabilitiesModule, OrganizationsModule],
    controllers: [HomeController],
    providers: [HomeService, OrganizationGuard],
})
export class HomeModule {}
