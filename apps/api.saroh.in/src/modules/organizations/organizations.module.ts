import { Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { OrganizationContextService } from "./organization-context.service";
import { OrganizationsController } from "./organizations.controller";

/**
 * Organization authorization layer (S1-003). Exports the context service so
 * other modules can resolve an `OrganizationContext`; provides the guard so
 * Nest DI can inject the service into it.
 */
@Module({
    controllers: [OrganizationsController],
    providers: [OrganizationContextService, OrganizationGuard],
    exports: [OrganizationContextService],
})
export class OrganizationsModule {}
