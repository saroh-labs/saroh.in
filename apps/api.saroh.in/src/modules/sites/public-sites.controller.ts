import {
    Controller,
    Get,
    Header,
    Headers,
    HttpException,
    HttpStatus,
    Ip,
    Param,
    Query,
    UseGuards,
} from "@nestjs/common";

import { hashClientIp } from "../../common/client-ip";
import { PublicSiteOnlineGuard } from "../../common/guards/public-site-online.guard";
import { FixedWindowRateLimiter } from "../enquiry/rate-limiter";
import { SITE_RELAY_HEADER, visitorKey } from "../site-accounts/site-relay";
import type { PublicFooter } from "./public-footer.service";
import { PublicFooterService } from "./public-footer.service";
import type { PublicHead } from "./public-head.service";
import { PublicHeadService } from "./public-head.service";
import type { PublicVisit } from "./public-visit.service";
import { PublicVisitService } from "./public-visit.service";
import type { SiteMoved } from "./site-moved";
import { siteMovedTo } from "./site-moved";
import { SitePreviewLinksService } from "./site-preview-links.service";
import { SitesService } from "./sites.service";
import type { CatalogueTemplate } from "./template-catalogue";
import { templateCatalogue } from "./template-catalogue";
import type { TestReleaseView } from "./test-release-lookup";
import { resolveTestRelease, TEST_TOKEN_HEADER } from "./test-release-lookup";

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
@UseGuards(PublicSiteOnlineGuard)
export class PublicSitesController {
    /**
     * A speed bump on the test-host lookup, per visitor when the renderer
     * relays one (ADR-011), else per caller. A token is 32 random bytes, so
     * this is not what stops guessing; it keeps the route cheap. Generous,
     * because every page a tester opens reads it.
     */
    private readonly testReleaseLimiter = new FixedWindowRateLimiter(
        300,
        60_000,
    );

    constructor(
        private readonly sites: SitesService,
        private readonly previewLinks: SitePreviewLinksService,
        private readonly visits: PublicVisitService,
        private readonly footers: PublicFooterService,
        private readonly heads: PublicHeadService,
    ) {}

    /**
     * The template catalogue, for the public showcase on templates.saroh.in
     * (#107). Unauthenticated on purpose: this is what a site can be built
     * from, which is a claim about the product rather than about any tenant.
     *
     * The org-scoped `GET .../sites/templates` returns the same catalogue to a
     * signed-in merchant choosing one (`template-catalogue.ts`). It carries no
     * Organization, Site, or Publication data of any kind.
     */
    @Get("templates")
    templates(): CatalogueTemplate[] {
        return templateCatalogue();
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
     * A TEST release on its test host (DEC-071, T3): the frozen snapshot a
     * link opens on `test--<address>.saroh.app` or `test.<custom domain>`.
     *
     * The host rides in the query and the token in `x-saroh-test-token`,
     * never in the path, so access logs do not carry it (the header is
     * redacted). 404 for a live host, an unknown token, a token for another
     * site, or a business with test releases off; 410 naming why for a link
     * that has stopped working. Declared before `:siteId/...`, which it
     * cannot match anyway (one segment).
     */
    @Get("test-release")
    @Header("Cache-Control", "no-store")
    async testRelease(
        @Query("host") host: string | undefined,
        @Headers(TEST_TOKEN_HEADER) token: string | undefined,
        @Ip() ip: string,
        @Headers(SITE_RELAY_HEADER) relay: string | undefined,
    ): Promise<TestReleaseView> {
        const key = visitorKey(ip, relay);
        if (key && !this.testReleaseLimiter.take(key)) {
            throw new HttpException(
                "Too many requests. Try again in a minute.",
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }
        return resolveTestRelease(host ?? "", token);
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
     * What the site's footer shows beside the snapshot (DEC-101, DEC-102):
     * the business's contact email when it has one, and "Made with Saroh"
     * with its referral code on Free. Read live, never cached, so a plan
     * change or a new email shows at once. The visitor is relayed as for
     * `/visit`.
     */
    @Get(":siteId/footer")
    @Header("Cache-Control", "no-store")
    footer(
        @Param("siteId") siteId: string,
        @Ip() ip: string,
        @Headers(SITE_RELAY_HEADER) relay: string | undefined,
    ): Promise<PublicFooter> {
        return this.footers.read(siteId, visitorKey(ip, relay));
    }

    /**
     * What every page's head carries beside the snapshot (DEC-108): the
     * site's verification codes, and the merchant's own trackers while the
     * plan includes them. Public values only, read live, never cached, so a
     * saved code is on the site at once. The visitor is relayed as for
     * `/visit`.
     */
    @Get(":siteId/head")
    @Header("Cache-Control", "no-store")
    head(
        @Param("siteId") siteId: string,
        @Ip() ip: string,
        @Headers(SITE_RELAY_HEADER) relay: string | undefined,
    ): Promise<PublicHead> {
        return this.heads.read(siteId, visitorKey(ip, relay));
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
