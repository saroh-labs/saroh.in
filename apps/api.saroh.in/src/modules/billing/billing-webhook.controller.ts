import {
    Controller,
    HttpCode,
    Param,
    Post,
    RawBodyRequest,
    Req,
    UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";

import { BillingWebhookService } from "./billing-webhook.service";

/**
 * PUBLIC Saroh billing-webhook endpoint (S7-005), mounted at
 * `/public/billing/webhooks/:provider` with NO guards — the unauthenticated URL
 * Saroh's OWN Razorpay/Cashfree account POSTs subscription events to.
 *
 * There is deliberately no auth guard and no `@OrgContext()`: the provider has
 * no session. Trust comes ENTIRELY from the platform HMAC signature over the RAW
 * body, verified in the service BEFORE anything is parsed or written. A verified
 * (or duplicate) delivery answers 200 so the provider stops retrying; a
 * signature failure is a 401 and an unknown provider a 404.
 */
@Controller("public/billing/webhooks")
export class BillingWebhookController {
    constructor(private readonly webhooks: BillingWebhookService) {}

    @Post(":provider")
    @HttpCode(200)
    handle(
        @Param("provider") provider: string,
        @Req() req: RawBodyRequest<Request>,
    ) {
        // The RAW bytes are required for HMAC verification (captured by the
        // body-parser's `verify` hook — rawBody: true in AppModule). No raw body
        // → we cannot verify → reject exactly as a bad signature would.
        const rawBody = req.rawBody;
        if (!rawBody || rawBody.length === 0) {
            throw new UnauthorizedException(
                "Webhook signature verification failed",
            );
        }
        return this.webhooks.handle(provider, rawBody, req.headers);
    }
}
