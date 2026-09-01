import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    Patch,
    Post,
    Put,
    UseGuards,
} from "@nestjs/common";
import { listTemplates } from "@saroh/templates";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import {
    CreateSiteFromTemplateDto,
    UpdateDraftSectionsDto,
    UpdateSiteSettingsDto,
} from "./dto";
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

    /**
     * Get a page's editable DRAFT version + ordered sections (the editor's load
     * path). Creates an empty DRAFT if the page has none. Requires
     * `section:write`.
     */
    @Get(":siteId/pages/:pageId/draft")
    getDraft(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("pageId") pageId: string,
    ) {
        return this.sites.getPageDraft(ctx, siteId, pageId);
    }

    /**
     * Replace a page's DRAFT sections with an ordered list. Each section is
     * contract-validated before any write; the whole request is rejected if any
     * is invalid. Requires `section:write`.
     */
    @Put(":siteId/pages/:pageId/draft/sections")
    replaceDraftSections(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("pageId") pageId: string,
        @Body() dto: UpdateDraftSectionsDto,
    ) {
        return this.sites.replaceDraftSections(ctx, siteId, pageId, dto);
    }

    /**
     * Publish the site: snapshot its pages' current drafts into a new immutable
     * Publication (sanitizing rich fields) and repoint the live pointer.
     * Requires `site:publish`.
     */
    /**
     * Update a site's search and social settings (#188).
     *
     * PATCH, not PUT: a settings form sends what changed. An omitted field is
     * left alone and an explicit null clears it — see UpdateSiteSettingsDto.
     */
    @Patch(":siteId/settings")
    updateSettings(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Body() dto: UpdateSiteSettingsDto,
    ) {
        return this.sites.updateSettings(ctx, siteId, dto);
    }

    /**
     * Set the site's look (#189). Replaces rather than merges — the Style panel
     * always sends a whole look, and merging would let two tabs produce a
     * palette neither person chose.
     */
    @Put(":siteId/style")
    updateStyle(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Body() body: unknown,
    ) {
        return this.sites.updateStyle(ctx, siteId, body);
    }

    // ---------------------------------------------------------------------
    // Version history (#194)
    // ---------------------------------------------------------------------

    /** Every publish of this site, newest first. */
    @Get(":siteId/publications")
    listPublications(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
    ) {
        return this.sites.listPublications(ctx, siteId);
    }

    /** One past publish, with its snapshot, for previewing what was served. */
    @Get(":siteId/publications/:publicationId")
    getPublication(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("publicationId") publicationId: string,
    ) {
        return this.sites.getPublication(ctx, siteId, publicationId);
    }

    /**
     * Put a past version back. Appends a new publication rather than deleting
     * the ones after it, so the restore can itself be undone.
     */
    @Post(":siteId/publications/:publicationId/restore")
    @HttpCode(200)
    restorePublication(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
        @Param("publicationId") publicationId: string,
    ) {
        return this.sites.restorePublication(ctx, siteId, publicationId);
    }

    @Post(":siteId/publish")
    @HttpCode(200)
    publish(
        @OrgContext() ctx: OrganizationContext,
        @Param("siteId") siteId: string,
    ) {
        return this.sites.publishSite(ctx, siteId);
    }
}
