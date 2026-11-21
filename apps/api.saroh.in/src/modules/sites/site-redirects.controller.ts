import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    UseGuards,
} from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import { CreateSiteRedirectDto } from "./dto";
import type { SiteRedirectView } from "./site-redirects.service";
import { SiteRedirectsService } from "./site-redirects.service";

/**
 * A site's old page links that forward to a page (KTD-3), for Links and
 * sharing. Every change reaches the site with the next publish.
 */
@Controller("organizations/:organizationId/sites/:siteId/redirects")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("WEBSITE")
export class SiteRedirectsController {
    constructor(private readonly redirects: SiteRedirectsService) {}

    /** Every old link that forwards, with the page it opens. `site:read`. */
    @Get()
    list(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
    ): Promise<SiteRedirectView[]> {
        return this.redirects.list(ctx, siteId);
    }

    /** Forward one of the merchant's old links. `site:update`. */
    @Post()
    create(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Body() dto: CreateSiteRedirectDto,
    ): Promise<SiteRedirectView> {
        return this.redirects.create(ctx, siteId, dto);
    }

    /** Stop forwarding one of the merchant's own old links. `site:update`. */
    @Delete(":redirectId")
    remove(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("redirectId") redirectId: string,
    ): Promise<{ removed: true }> {
        return this.redirects.remove(ctx, siteId, redirectId);
    }
}
