import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { OrganizationsModule } from "../organizations/organizations.module";
import { PipelinesModule } from "../pipelines/pipelines.module";
import { LeadsController, TasksController } from "./leads.controller";
import { LeadsService } from "./leads.service";

/**
 * Org-owned CRM Leads (S3-005). Imports {@link OrganizationsModule} (via
 * forwardRef) for the `OrganizationContextService` behind `OrganizationGuard`,
 * and {@link PipelinesModule} for the `PipelinesService.ensureDefault` helper
 * used when a manual lead omits its pipeline.
 */
@Module({
    imports: [forwardRef(() => OrganizationsModule), PipelinesModule],
    controllers: [LeadsController, TasksController],
    providers: [LeadsService, OrganizationGuard],
    exports: [LeadsService],
})
export class LeadsModule {}
