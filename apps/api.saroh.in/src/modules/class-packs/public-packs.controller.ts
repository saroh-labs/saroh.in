import {
    Controller,
    Get,
    Header,
    Headers,
    Ip,
    Param,
    UseGuards,
} from "@nestjs/common";

import { PublicSiteOnlineGuard } from "../../common/guards/public-site-online.guard";
import { SITE_RELAY_HEADER, visitorKey } from "../site-accounts/site-relay";
import type { PublicPacks } from "./public-packs.service";
import { PublicPacksService } from "./public-packs.service";

/**
 * The Prices page's Class packs read (round-2 G20),
 * `GET public/sites/:siteId/packs`, with NO guards: anonymous visitors, and
 * saroh.app's server rendering a page with a Class packs section, call it.
 * No session and no organization context — the service derives the
 * business from the site, serves only packs on sale with their published
 * values, and 404s while Class packs is off for the business.
 *
 * The limit counts the visitor: the signed `x-saroh-relay` address when
 * saroh.app relays the call (ADR-011), otherwise the caller's own.
 *
 * `ClassPacksModule` registers after `SitesModule`, so
 * `by-subdomain/packs` still reaches the publication read, not this one.
 */
@Controller("public/sites")
@UseGuards(PublicSiteOnlineGuard)
export class PublicPacksController {
    constructor(private readonly packs: PublicPacksService) {}

    @Get(":siteId/packs")
    // A price change or a newly published pack shows on the next view.
    @Header("Cache-Control", "no-store")
    list(
        @Param("siteId") siteId: string,
        @Ip() ip: string,
        @Headers(SITE_RELAY_HEADER) relay: string | undefined,
    ): Promise<PublicPacks> {
        return this.packs.list(siteId, visitorKey(ip, relay));
    }
}
