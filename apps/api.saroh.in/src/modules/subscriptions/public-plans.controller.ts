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
import type { PublicPlans } from "./public-plans.service";
import { PublicPlansService } from "./public-plans.service";

/**
 * The Plans block's read (round-2 G9), `GET public/sites/:siteId/plans`, with
 * NO guards: anonymous visitors, and saroh.app's server rendering a page with
 * a Plans block, call it. No session and no organization context — the
 * service derives the business from the site, serves only plans on sale with
 * their published values, and 404s while Payments is off for the business.
 *
 * The limit counts the visitor: the signed `x-saroh-relay` address when
 * saroh.app relays the call (ADR-011), otherwise the caller's own.
 *
 * `SubscriptionsModule` registers after `SitesModule`, so
 * `by-subdomain/plans` still reaches the publication read, not this one.
 */
@Controller("public/sites")
@UseGuards(PublicSiteOnlineGuard)
export class PublicPlansController {
    constructor(private readonly plans: PublicPlansService) {}

    @Get(":siteId/plans")
    // A price change or a newly published plan shows on the next view.
    @Header("Cache-Control", "no-store")
    list(
        @Param("siteId") siteId: string,
        @Ip() ip: string,
        @Headers(SITE_RELAY_HEADER) relay: string | undefined,
    ): Promise<PublicPlans> {
        return this.plans.list(siteId, visitorKey(ip, relay));
    }
}
