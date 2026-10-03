import { Controller, Get, Headers, Query, Res } from "@nestjs/common";
import type { Response } from "express";

import { CatalogueService } from "./catalogue.service";
import type { PublicPricing } from "./public-catalog";
import { etagMatches, pricingEtag } from "./public-catalog";

/**
 * Cached for five minutes — the same window saroh.in's pages revalidate on
 * (KTD-10). A version scheduled to go live is served on the first read after
 * its `goLiveAt`; saroh.in's on-demand revalidation (publish and go-live) is
 * what makes the pages change at once.
 */
export const PUBLIC_PRICING_CACHE =
    "public, max-age=300, stale-while-revalidate=60";

/**
 * Saroh's own published pricing, for saroh.in (plans catalogue U3). No
 * guards: anyone may read the price list. `?preview=<token>` serves the
 * shared draft instead, for a token minted by staff (`POST
 * /admin/pricing/preview-token`); that answer is never cached, never
 * indexed and sends no referrer — and is a 404 for any token that doesn't
 * hold, whatever the reason.
 */
@Controller("public/pricing")
export class PublicPricingController {
    constructor(private readonly catalogue: CatalogueService) {}

    @Get()
    async get(
        @Query("preview") preview: string | undefined,
        @Headers("if-none-match") ifNoneMatch: string | undefined,
        @Res({ passthrough: true }) res: Response,
    ): Promise<PublicPricing | undefined> {
        const now = new Date();
        if (preview !== undefined) {
            // Set before the read, so a refusal is not cacheable either.
            res.setHeader("Cache-Control", "no-store");
            res.setHeader("X-Robots-Tag", "noindex, nofollow");
            res.setHeader("Referrer-Policy", "no-referrer");
            return this.catalogue.previewPricing(preview, now);
        }
        const body = await this.catalogue.publicPricing(now);
        const etag = pricingEtag(body);
        res.setHeader("Cache-Control", PUBLIC_PRICING_CACHE);
        res.setHeader("ETag", etag);
        if (etagMatches(ifNoneMatch, etag)) {
            res.status(304);
            return undefined;
        }
        return body;
    }
}
