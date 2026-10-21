import {
    Body,
    Controller,
    Get,
    Header,
    Headers,
    HttpCode,
    Ip,
    Param,
    Post,
    Query,
    UseGuards,
} from "@nestjs/common";

import { PublicSiteOnlineGuard } from "../../common/guards/public-site-online.guard";
import { SITE_RELAY_HEADER, visitorKey } from "../site-accounts/site-relay";
import { WatchOfferQueryDto, WatchStockDto } from "./stock-watch.dto";
import type { WatchOffer, WatchTaken, WatchView } from "./stock-watch.service";
import { StockWatchService } from "./stock-watch.service";

/**
 * "Tell me when it's back" on a business's site (DEC-174 U23, #1154), for
 * saroh.app's product page and stop page (U24). No session: the site names
 * the business, and `StockWatchService` checks the rest.
 *
 * - `GET  :siteId/products/:productId/watch[?variantId=]`: whether "Tell
 *   me" is offered, and why not.
 * - `POST :siteId/products/:productId/watch`: `{ email, variantId?,
 *   consent: true }`; 201 `{ state: "waiting", stopToken }`, 409 with the
 *   `reason` when it isn't offered, 429 past a limit.
 * - `GET  :siteId/stock-watch/:token`: the stop page's read.
 * - `POST :siteId/stock-watch/:token/stop`: "Stop waiting".
 *
 * saroh.app relays the visitor's address (ADR-011), so the limits count the
 * visitor, not the renderer. The token is a credential: never cached,
 * indexed or passed on, and logged replaced (`common/logging/redact.ts`).
 */
@Controller("public/sites")
@UseGuards(PublicSiteOnlineGuard)
export class StockWatchController {
    constructor(private readonly watches: StockWatchService) {}

    @Get(":siteId/products/:productId/watch")
    @Header("Cache-Control", "no-store")
    offer(
        @Param("siteId") siteId: string,
        @Param("productId") productId: string,
        @Query() query: WatchOfferQueryDto,
        @Ip() ip: string,
        @Headers(SITE_RELAY_HEADER) relay: string | undefined,
    ): Promise<WatchOffer> {
        return this.watches.offer(
            siteId,
            productId,
            query.variantId ?? null,
            visitorKey(ip, relay),
        );
    }

    @Post(":siteId/products/:productId/watch")
    @HttpCode(201)
    @Header("Cache-Control", "no-store")
    watch(
        @Param("siteId") siteId: string,
        @Param("productId") productId: string,
        @Body() dto: WatchStockDto,
        @Ip() ip: string,
        @Headers(SITE_RELAY_HEADER) relay: string | undefined,
    ): Promise<WatchTaken> {
        return this.watches.watch(
            siteId,
            productId,
            dto,
            visitorKey(ip, relay),
        );
    }

    @Get(":siteId/stock-watch/:token")
    @Header("Cache-Control", "no-store")
    @Header("Referrer-Policy", "no-referrer")
    @Header("X-Robots-Tag", "noindex, nofollow")
    read(
        @Param("siteId") siteId: string,
        @Param("token") token: string,
        @Ip() ip: string,
        @Headers(SITE_RELAY_HEADER) relay: string | undefined,
    ): Promise<WatchView> {
        return this.watches.read(siteId, token, visitorKey(ip, relay));
    }

    @Post(":siteId/stock-watch/:token/stop")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    @Header("Referrer-Policy", "no-referrer")
    stop(
        @Param("siteId") siteId: string,
        @Param("token") token: string,
        @Ip() ip: string,
        @Headers(SITE_RELAY_HEADER) relay: string | undefined,
    ): Promise<WatchView> {
        return this.watches.stop(siteId, token, visitorKey(ip, relay));
    }
}
