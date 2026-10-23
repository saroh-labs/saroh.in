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
import { SITE_RELAY_HEADER, visitorKey } from "./site-relay";
import type { PublicWaitlistClaim } from "./waitlist-claim.service";
import { WaitlistClaimService } from "./waitlist-claim.service";

/**
 * A waitlist offer's claim link (automatic notices U18, #1149), read by
 * saroh.app's `/book/claim/‹token›` page on the site it is opened on:
 * `GET public/sites/:siteId/waitlist-claim/:token`. No guards but the
 * site's own: no sign-in is needed to see the offer, and booking it goes
 * through the booking page.
 *
 * The token is a credential, so the answer is never cached, indexed or
 * passed on in a Referer, and the path is logged with it replaced
 * (`common/logging/redact.ts`). saroh.app relays the visitor's address
 * (ADR-011), so the limit counts the visitor, not the renderer.
 */
@Controller("public/sites")
@UseGuards(PublicSiteOnlineGuard)
export class WaitlistClaimController {
    constructor(private readonly claims: WaitlistClaimService) {}

    @Get(":siteId/waitlist-claim/:token")
    @Header("Cache-Control", "no-store")
    @Header("Referrer-Policy", "no-referrer")
    @Header("X-Robots-Tag", "noindex, nofollow")
    read(
        @Param("siteId") siteId: string,
        @Param("token") token: string,
        @Ip() ip: string,
        @Headers(SITE_RELAY_HEADER) relay: string | undefined,
    ): Promise<PublicWaitlistClaim> {
        return this.claims.read(siteId, token, visitorKey(ip, relay));
    }
}
