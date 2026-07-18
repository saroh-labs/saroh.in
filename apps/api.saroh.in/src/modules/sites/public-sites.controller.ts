import { Controller, Get, Param } from "@nestjs/common";

import { SitesService } from "./sites.service";

/**
 * PUBLIC site read API (S2-005), mounted at `/public/sites` with NO guards —
 * this is what anonymous visitors (and the S2-006 renderer) hit. There is
 * deliberately no `BetterAuthGuard`/`OrganizationGuard` and no
 * `@OrgContext()`: no session, no org scoping.
 *
 * The ONLY thing these routes can return is a site's CURRENT immutable
 * {@link Publication} snapshot (`Site.currentPublicationId`). The service reads
 * nothing but `currentPublication.snapshot`, so drafts, unpublished sites, and
 * other orgs' working content are structurally unreachable here — an
 * unpublished or unknown site is a 404.
 */
@Controller("public/sites")
export class PublicSitesController {
    constructor(private readonly sites: SitesService) {}

    /** Current publication snapshot for the site on `<subdomain>.saroh.in`. */
    @Get("by-subdomain/:subdomain")
    bySubdomain(@Param("subdomain") subdomain: string) {
        return this.sites.getPublicationBySubdomain(subdomain);
    }

    /** Current publication snapshot for a site by id. */
    @Get(":siteId/publication")
    bySiteId(@Param("siteId") siteId: string) {
        return this.sites.getPublicationBySiteId(siteId);
    }
}
