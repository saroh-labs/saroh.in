import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    Post,
    UseGuards,
} from "@nestjs/common";
import { listTemplates } from "@saroh/templates";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { CreateSiteFromTemplateDto } from "./dto";
import { SitesService } from "./sites.service";

/**
 * Site endpoints for an Organization (S2-003), scoped to
 * `/organizations/:organizationId/sites`.
 *
 * Double-guarded: `BetterAuthGuard` authenticates the session user and
 * `OrganizationGuard` resolves an authorized {@link OrganizationContext} from
 * the `:organizationId` param. Handlers receive only that proven context via
 * `@OrgContext()` — never a raw client-supplied org — and the service enforces
 * the `site:*` policy on top.
 */
@Controller("organizations/:organizationId/sites")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class SitesController {
    constructor(private readonly sites: SitesService) {}

    /** Create a draft Site (pages + DRAFT versions + sections) from a template. */
    @Post()
    @HttpCode(201)
    create(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: CreateSiteFromTemplateDto,
    ) {
        return this.sites.createFromTemplate(ctx, dto);
    }

    /**
     * List the templates available to build a site from. Auth + org membership
     * only (no `site:*` capability needed to browse the catalog). Declared
     * before the `:siteId` route so "templates" is never captured as an id.
     */
    @Get("templates")
    templates() {
        return listTemplates().map((template) => ({
            id: template.id,
            version: template.version,
            name: template.name,
            description: template.description,
        }));
    }

    /** List the org's non-deleted sites. */
    @Get()
    list(@OrgContext() ctx: OrganizationContext) {
        return this.sites.listSites(ctx);
    }

    /** Fetch one of the org's sites with its pages. */
    @Get(":siteId")
    get(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
    ) {
        return this.sites.getSite(ctx, siteId);
    }
}
