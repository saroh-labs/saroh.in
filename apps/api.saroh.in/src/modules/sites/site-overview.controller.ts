import { Controller, Get, Param, UseGuards } from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import type { SiteOverview } from "./site-overview";
import { SiteOverviewService } from "./site-overview";
import { WebsiteAreaSwitchGuard } from "./website-area-switch";

/** A site's Overview (plan 2026-11-18-001 U4). `site:read`. */
@Controller("organizations/:organizationId/sites/:siteId/overview")
// Only with the Website area on (DEC-240): off, a 404.
@UseGuards(
    BetterAuthGuard,
    OrganizationGuard,
    ModuleEnforcementGuard,
    WebsiteAreaSwitchGuard,
)
@RequireModule("WEBSITE")
export class SiteOverviewController {
    constructor(private readonly overview: SiteOverviewService) {}

    @Get()
    read(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
    ): Promise<SiteOverview> {
        return this.overview.read(ctx, siteId);
    }
}
