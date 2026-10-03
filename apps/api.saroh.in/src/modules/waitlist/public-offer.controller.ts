import { Controller, Get, NotFoundException, Res } from "@nestjs/common";
import type { Response } from "express";

import { env } from "../../env";
import type { PublicLaunchOffer } from "./launch-offer";
import { publicLaunchOffer } from "./launch-offer";

/**
 * Five minutes, the window saroh.in's waitlist page revalidates on. Set on
 * the 404 too, so a page asking while there is no offer is cached alike.
 */
export const PUBLIC_OFFER_CACHE = "public, max-age=300";

/**
 * The launch offer, for saroh.in's waitlist page. No guards: anyone may
 * read what the opening-day offer will be. Read-only and no database, so no
 * rate limit.
 *
 * The contract:
 * - 200 `{ planId, planName, days }` while `LAUNCH_OFFER_DAYS` is set.
 * - 404 otherwise. The page then says the offer is announced at launch.
 *
 * Its own controller, not a GET on `WaitlistController`: that one stays
 * write-only, and the list of people waiting is never read here.
 */
@Controller("public/waitlist/offer")
export class PublicLaunchOfferController {
    @Get()
    get(@Res({ passthrough: true }) res: Response): PublicLaunchOffer {
        res.setHeader("Cache-Control", PUBLIC_OFFER_CACHE);
        const offer = publicLaunchOffer(env.LAUNCH_OFFER_DAYS);
        if (!offer) throw new NotFoundException("No launch offer is set");
        return offer;
    }
}
