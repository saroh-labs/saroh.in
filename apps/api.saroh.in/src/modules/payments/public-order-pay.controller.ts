import {
    Body,
    Controller,
    Get,
    Header,
    Headers,
    HttpCode,
    Param,
    Post,
} from "@nestjs/common";

import { ClientAddress } from "../../common/decorators/client-address.decorator";
import { SITE_RELAY_HEADER, visitorKey } from "../site-accounts/site-relay";
import type { CreateIntentResult } from "./payments.service";
import type { PublicOrderPayView } from "./public-order-pay.service";
import { PublicOrderPayService } from "./public-order-pay.service";

/**
 * An order's pay link (plan B, B11), mounted at `/public/order-pay` with no
 * guards — what the customer's pay page on saroh.app reads and posts to.
 * The token alone names the order; the path is logged with it replaced
 * (`common/logging/redact.ts`).
 *
 * The link is a credential, so neither answer may be cached, indexed or
 * leak the URL onward in a Referer header.
 */
@Controller("public/order-pay")
export class PublicOrderPayController {
    constructor(private readonly orders: PublicOrderPayService) {}

    @Get(":token")
    @Header("Referrer-Policy", "no-referrer")
    @Header("X-Robots-Tag", "noindex, nofollow")
    @Header("Cache-Control", "no-store")
    read(
        @Param("token") token: string,
        @ClientAddress() ip: string,
        @Headers(SITE_RELAY_HEADER) relay: string | undefined,
    ): Promise<PublicOrderPayView> {
        // saroh.app reads from its server, so count the relayed visitor.
        return this.orders.read(token, visitorKey(ip, relay));
    }

    /**
     * Start paying what is due on the order. The body may carry an
     * idempotency key; it is deliberately untyped so the global validation
     * pipe passes it through and anything else in it — an amount above all —
     * is ignored. The amount is always worked out from the stored order.
     */
    @Post(":token/payment-intent")
    @HttpCode(201)
    @Header("Referrer-Policy", "no-referrer")
    @Header("X-Robots-Tag", "noindex, nofollow")
    @Header("Cache-Control", "no-store")
    createIntent(
        @Param("token") token: string,
        @Body() body: unknown,
        @ClientAddress() ip: string,
        @Headers(SITE_RELAY_HEADER) relay: string | undefined,
    ): Promise<CreateIntentResult> {
        return this.orders.createIntent(token, body, visitorKey(ip, relay));
    }
}
