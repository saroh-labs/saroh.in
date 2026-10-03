import { Controller, Get, NotFoundException, Res } from "@nestjs/common";
import type { Response } from "express";

import type { PublicLaunchOffer } from "./invite-token";
import { LaunchOfferService } from "./launch-offer.service";

/**
 * Five minutes, the window saroh.in's waitlist page revalidates on. Set on
 * the 404 too, so a page asking while there is no offer is not a database
 * read per visit either.
 */
export const PUBLIC_OFFER_CACHE = "public, max-age=300";

/**
 * The launch offer, for saroh.in's waitlist page (marketing plan U31,
 * OQ-1). No guards: anyone may read what the opening-day invites will give.
 * Read-only, so no rate limit, as `GET /public/pricing`.
 *
 * The contract:
 * - 200 `{ planId, planName, days }` when `LAUNCH_OFFER_DAYS` is set and the
 *   live catalogue has the offer plan; `planName` is the live catalogue's.
 * - 404 otherwise (no offer set, no live catalogue, or no such plan in it).
 *   The page then says the offer is announced at launch.
 *
 * Its own controller, not a GET on `WaitlistController`: that one stays
 * write-only, and the list of people waiting is never read here.
 */
@Controller("public/waitlist/offer")
export class PublicLaunchOfferController {
    constructor(private readonly offers: LaunchOfferService) {}

    @Get()
    async get(
        @Res({ passthrough: true }) res: Response,
    ): Promise<PublicLaunchOffer> {
        res.setHeader("Cache-Control", PUBLIC_OFFER_CACHE);
        const offer = await this.offers.publicOffer(new Date());
        if (!offer) throw new NotFoundException("No launch offer is set");
        return offer;
    }
}
