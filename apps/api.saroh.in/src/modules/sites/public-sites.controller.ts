import { Controller, Get, Header, Headers, Ip, Param } from "@nestjs/common";
import { listTemplates } from "@saroh/templates";

import { hashClientIp } from "../../common/client-ip";
import { SITE_RELAY_HEADER, visitorKey } from "../site-accounts/site-relay";
import type { PublicVisit } from "./public-visit.service";
import { PublicVisitService } from "./public-visit.service";
import type { SiteMoved } from "./site-moved";
import { siteMovedTo } from "./site-moved";
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
        private readonly visits: PublicVisitService,
    ) {}

    /**
     * The template catalogue, for the public showcase on templates.saroh.in
     * (#107). Unauthenticated on purpose: this is what a site can be built
     * from, which is a claim about the product rather than about any tenant.
     *
     * The org-scoped `GET .../sites/templates` returns the same registry to a
     * signed-in merchant choosing one. This adds page titles, which a showcase
     * needs to describe a template and a picker does not, and it carries no
     * Organization, Site, or Publication data of any kind.
     */
    @Get("templates")
    templates() {
        return listTemplates().map((template) => ({
            id: template.id,
            version: template.version,
            name: template.name,
            description: template.description,
            pages: template.pages.map((page) => page.title),
        }));
    }

    /** Current publication snapshot for the site on `<subdomain>.saroh.app`. */
    @Get("by-subdomain/:subdomain")
    bySubdomain(@Param("subdomain") subdomain: string) {
        return this.sites.getPublicationBySubdomain(subdomain);
    }

    /**
     * Where an old web address forwards to (DEC-069, plan L2): `{ to }`, the
     * site's origin now, while the address's 90 days last; else a 404. The
     * renderer asks only when a host has no live site. Declared before the
     * `:siteId/…` reads, so an address such as `posts` is never taken for a
     * site id. Rate-limited per visitor, like the Visit us read.
     */
    @Get("moved/:address")
    @Header("Cache-Control", "no-store")
    moved(
        @Param("address") address: string,
        @Ip() ip: string,
        @Headers(SITE_RELAY_HEADER) relay: string | undefined,
    ): Promise<SiteMoved> {
        return siteMovedTo(address, visitorKey(ip, relay));
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
     * The site's writing behind a preview token (#236), newest first, from the
     * DRAFT. Declared before `preview/:token` is irrelevant to matching — the
     * paths differ in length — but it shares that route's token rules exactly,
     * including the 410 and the "taken back" reason.
     */
    @Get("preview/:token/posts")
    previewPosts(@Param("token") token: string) {
        return this.previewLinks.posts(token);
    }

    /** One post from the draft, behind a preview token (#236). */
    @Get("preview/:token/posts/:slug")
    previewPost(@Param("token") token: string, @Param("slug") slug: string) {
        return this.previewLinks.post(token, slug);
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

    /**
     * A site's live posts, newest first (#232). The renderer resolves a host to
     * a site once, then asks here by id.
     */
    @Get(":siteId/posts")
    posts(@Param("siteId") siteId: string) {
        return this.sites.getPublicPosts(siteId);
    }

    /** One live post by slug (#232). 404 when it is not live. */
    @Get(":siteId/posts/:slug")
    post(@Param("siteId") siteId: string, @Param("slug") slug: string) {
        return this.sites.getPublicPost(siteId, slug);
    }

    /**
     * The business's place for this site, with no store named (G8): its first
     * open shop, else the business profile's registered address and hours.
     * What the booking page's header shows (E6). Not a snapshot: read live,
     * so it is never cached.
     *
     * saroh.app's server reads it for the booking page, so it relays the
     * visitor's address in the signed `x-saroh-relay` (ADR-011) and the limit
     * counts the visitor, not the renderer. Anything unsigned counts the
     * caller, as before.
     */
    @Get(":siteId/visit")
    @Header("Cache-Control", "no-store")
    visit(
        @Param("siteId") siteId: string,
        @Ip() ip: string,
        @Headers(SITE_RELAY_HEADER) relay: string | undefined,
    ): Promise<PublicVisit> {
        return this.visits.read(siteId, undefined, visitorKey(ip, relay));
    }

    /**
     * One shop's address, hours and phone for the site's Visit us block
     * (G8). A 404 unless the store is this site's business's, a SHOP, and
     * not closed.
     */
    @Get(":siteId/visit/:storeId")
    @Header("Cache-Control", "no-store")
    visitStore(
        @Param("siteId") siteId: string,
        @Param("storeId") storeId: string,
        @Ip() ip: string,
    ): Promise<PublicVisit> {
        return this.visits.read(siteId, storeId, hashClientIp(ip));
    }

    /** Current publication snapshot for a site by id. */
    @Get(":siteId/publication")
    bySiteId(@Param("siteId") siteId: string) {
        return this.sites.getPublicationBySiteId(siteId);
    }
}
