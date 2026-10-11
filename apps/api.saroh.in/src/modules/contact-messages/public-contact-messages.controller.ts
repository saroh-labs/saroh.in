import {
    Body,
    Controller,
    Headers,
    HttpCode,
    HttpException,
    HttpStatus,
    Ip,
    Post,
} from "@nestjs/common";

import { FixedWindowRateLimiter } from "../enquiry/rate-limiter";
import { SITE_RELAY_HEADER, visitorKey } from "../site-accounts/site-relay";
import { ContactMessagesService } from "./contact-messages.service";
import { SendContactMessageDto } from "./dto";

/**
 * PUBLIC contact messages, mounted at `/public/contact-messages` with NO
 * guards — what saroh.in's `/api/contact` forwards to from the Contact page
 * (DEC-137), as `/api/business-reports` forwards a report. Write-only: there
 * is no GET here. Refused on a test release (`test-host-routes.spec.ts`).
 */
@Controller("public/contact-messages")
export class PublicContactMessagesController {
    /**
     * Per-visitor speed bumps, the business reports' in-process limiter: a
     * cheap brake on someone flooding the staff's list, not a guarantee.
     */
    private readonly perMinute = new FixedWindowRateLimiter(3, 60_000);
    private readonly perDay = new FixedWindowRateLimiter(20, 24 * 60 * 60_000);

    constructor(private readonly messages: ContactMessagesService) {}

    /**
     * The limit counts the visitor saroh.in's server signs into
     * `x-saroh-relay`, else the caller; the raw IP is hashed here and only
     * the digest goes on.
     */
    @Post()
    @HttpCode(HttpStatus.OK)
    async send(
        @Body() dto: SendContactMessageDto,
        @Ip() ip: string,
        @Headers(SITE_RELAY_HEADER) relay: string | undefined,
    ): Promise<{ ok: true }> {
        const ipHash = visitorKey(ip, relay);
        if (
            ipHash &&
            !(this.perMinute.take(ipHash) && this.perDay.take(ipHash))
        ) {
            throw new HttpException(
                "Too many messages from this address. Try again later.",
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }
        return this.messages.send({
            topic: dto.topic,
            name: dto.name,
            email: dto.email,
            kind: dto.kind,
            message: dto.message,
            ipHash,
        });
    }
}
