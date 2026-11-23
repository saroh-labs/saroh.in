import { Controller, Get, Header, Param, UseGuards } from "@nestjs/common";

import { hashClientIp } from "../../common/client-ip";
import { ClientAddress } from "../../common/decorators/client-address.decorator";
import { PublicSiteOnlineGuard } from "../../common/guards/public-site-online.guard";
import { PublicShareService } from "./public-share.service";

/**
 * A live offer's words for a post's Offer card (W2), with the site's other
 * public reads and not behind SHARE_POSTS: a post's card is the site's
 * page, not a share picture, so it shows on every site. Scoped to the
 * site's business (`offerWords` reads the discount by the live site's
 * organization); an ended, used-up or another business's offer is a 404.
 *
 * Three segments, so it collides with none of `PublicSitesController`'s
 * routes (see `PublicCatalogueController`).
 */
@Controller("public/sites")
@UseGuards(PublicSiteOnlineGuard)
export class PublicSiteOfferController {
    constructor(private readonly share: PublicShareService) {}

    @Get(":siteId/offers/:id")
    @Header("Cache-Control", "no-store")
    offer(
        @Param("siteId") siteId: string,
        @Param("id") id: string,
        @ClientAddress() ip: string,
    ) {
        return this.share.offerWords(
            siteId,
            id,
            `offer:${hashClientIp(ip) ?? "unknown"}`,
        );
    }
}
