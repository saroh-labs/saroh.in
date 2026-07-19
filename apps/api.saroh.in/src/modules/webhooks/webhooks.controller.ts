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

import { WebhooksService } from "./webhooks.service";

/**
 * PUBLIC provider-webhook endpoint (S5-003), mounted at `/public/webhooks` with
 * NO guards — this is the unauthenticated URL a payment provider POSTs to.
 *
 * There is deliberately no `BetterAuthGuard`/`OrganizationGuard` and no
 * `@OrgContext()`: a provider has no session. The org is carried in the URL so
 * the service can load THAT org's webhook secret and HMAC-verify the RAW body
 * BEFORE trusting anything. Trust comes from the signature, never the caller.
 *
 * The handler always answers 200 for a verified (or duplicate) delivery so the
 * provider stops retrying; only signature/verification failures surface as 401
 * and a genuinely unknown provider as 404.
 */
@Controller("public/webhooks")
export class WebhooksController {
    constructor(private readonly webhooks: WebhooksService) {}

    @Post(":provider/:organizationId")
    @HttpCode(200)
    handle(
        @Param("provider") provider: string,
        @Param("organizationId") organizationId: string,
        @Req() req: RawBodyRequest<Request>,
    ) {
        // The RAW bytes are required for HMAC verification. They are captured by
        // the body-parser's `verify` hook (rawBody: true in AppModule); the
        // PARSED JSON is never used for the signature check. No raw body → we
        // cannot verify → reject exactly as a bad signature would.
        const rawBody = req.rawBody;
        if (!rawBody || rawBody.length === 0) {
            throw new UnauthorizedException(
                "Webhook signature verification failed",
            );
        }
        return this.webhooks.handle(
            provider,
            organizationId,
            rawBody,
            req.headers,
        );
    }
}
