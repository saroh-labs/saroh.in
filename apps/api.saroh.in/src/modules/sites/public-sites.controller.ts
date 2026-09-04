import { Controller, Get, Param } from "@nestjs/common";

import { SitePreviewLinksService } from "./site-preview-links.service";
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
    constructor(
        private readonly sites: SitesService,
        private readonly previewLinks: SitePreviewLinksService,
    ) {}

    /** Current publication snapshot for the site on `<subdomain>.saroh.app`. */
    @Get("by-subdomain/:subdomain")
    bySubdomain(@Param("subdomain") subdomain: string) {
        return this.sites.getPublicationBySubdomain(subdomain);
    }

    /**
     * A site's DRAFT, behind a preview token (#198). The one exception to
     * "only the current Publication is reachable here", and a narrow one: the
     * token is 32 random bytes minted by an owner, it expires, and it can be
     * taken back. 410 with a reason once it has; 404 for a token that never
     * existed.
     */
    @Get("preview/:token")
    preview(@Param("token") token: string) {
        return this.previewLinks.resolve(token);
    }

    /**
     * Current publication snapshot for a VERIFIED custom hostname (#200), e.g.
     * `shop.acme.com`. A hostname that is unknown, still PENDING, or not bound
     * to a site is a 404.
     */
    @Get("by-hostname/:hostname")
    byHostname(@Param("hostname") hostname: string) {
        return this.sites.getPublicationByHostname(hostname);
    }

    /** Current publication snapshot for a site by id. */
    @Get(":siteId/publication")
    bySiteId(@Param("siteId") siteId: string) {
        return this.sites.getPublicationBySiteId(siteId);
    }
}
