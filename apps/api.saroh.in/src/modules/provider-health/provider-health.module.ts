import { Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { OrganizationsModule } from "../organizations/organizations.module";
import { ProviderHealthController } from "./provider-health.controller";
import { ProviderHealthService } from "./provider-health.service";

/** Provider & dependency health (#123). */
@Module({
    imports: [OrganizationsModule],
    controllers: [ProviderHealthController],
    providers: [ProviderHealthService, OrganizationGuard],
})
export class ProviderHealthModule {}
