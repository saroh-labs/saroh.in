import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { PipelinesController } from "./pipelines.controller";
import { PipelinesService } from "./pipelines.service";

/**
 * Org-owned sales Pipelines (S3-005). Imports {@link OrganizationsModule} (via
 * forwardRef) for the `OrganizationContextService` that `OrganizationGuard`
 * needs. Exports {@link PipelinesService} so the leads module can reuse its
 * `ensureDefault` helper when creating a lead without an explicit pipeline.
 */
@Module({
    imports: [forwardRef(() => OrganizationsModule), CapabilitiesModule],
    controllers: [PipelinesController],
    providers: [PipelinesService, OrganizationGuard],
    exports: [PipelinesService],
})
export class PipelinesModule {}
