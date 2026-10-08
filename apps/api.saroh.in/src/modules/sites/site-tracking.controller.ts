import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import { SiteTrackingService } from "./site-tracking.service";

/**
 * A site's "Search and tracking" section (DEC-108, #892): its verification
 * codes, the merchant's own trackers, and the privacy page the cookie
 * banner links to. Saved values reach the live site at once.
 */
@Controller("organizations/:organizationId/sites/:siteId/search-and-tracking")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("WEBSITE")
export class SiteTrackingController {
    constructor(private readonly tracking: SiteTrackingService) {}

    /** The section as it stands. `site:read`. */
    @Get()
    read(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
    ) {
        return this.tracking.read(ctx, siteId);
    }

    /**
     * Save what changed: an omitted field is left alone, null removes it.
     * `site:update`.
     */
    @Patch()
    save(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Body() body: unknown,
    ) {
        return this.tracking.save(ctx, siteId, body);
    }
}
