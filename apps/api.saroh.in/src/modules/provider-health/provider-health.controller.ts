import { Controller, Get, UseGuards } from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ProviderHealthService } from "./provider-health.service";

/**
 * Provider & dependency health (#123). OWNER/ADMIN-only; the service enforces
 * MEMBER denial and never returns credentials.
 */
@Controller("organizations/:organizationId/provider-health")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class ProviderHealthController {
    constructor(private readonly health: ProviderHealthService) {}

    @Get()
    list(@OrgContext() ctx: OrganizationContext) {
        return this.health.list(ctx);
    }
}
