import { Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { CustomerWorkspaceController } from "./customer-workspace.controller";
import { CustomerWorkspaceService } from "./customer-workspace.service";

/**
 * Unified customer workspace (#120). Depends on CapabilitiesModule for the
 * module-availability projection (to gate the timeline) and OrganizationsModule
 * for the OrganizationGuard's context service.
 */
@Module({
    imports: [CapabilitiesModule, OrganizationsModule],
    controllers: [CustomerWorkspaceController],
    providers: [CustomerWorkspaceService, OrganizationGuard],
})
export class CustomerWorkspaceModule {}
