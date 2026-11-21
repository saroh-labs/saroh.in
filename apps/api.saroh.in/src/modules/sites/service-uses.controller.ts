import { Controller, Get, Param, UseGuards } from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import type { ServiceUses } from "./service-uses";
import { ServiceUsesService } from "./service-uses";

/**
 * Where a service shows on a site, for the price sheet (website editor plan
 * U47a, U48). `service:read` and `site:read`.
 */
@Controller(
    "organizations/:organizationId/sites/:siteId/services/:serviceId/uses",
)
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("WEBSITE")
export class ServiceUsesController {
    constructor(private readonly uses: ServiceUsesService) {}

    @Get()
    read(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("serviceId") serviceId: string,
    ): Promise<ServiceUses> {
        return this.uses.read(ctx, siteId, serviceId);
    }
}
