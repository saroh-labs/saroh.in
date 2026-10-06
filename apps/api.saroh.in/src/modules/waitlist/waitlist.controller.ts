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
import { JoinWaitlistDto } from "./dto";
import { WaitlistService } from "./waitlist.service";

/** What a join answers. A repeat (`created: false`) carries no place or link. */
export type JoinWaitlistResponse =
    | { ok: true; created: true; position: number; ref: string | null }
    | { ok: true; created: false };

/**
 * PUBLIC waitlist API, mounted at `/public/waitlist` with NO guards — this is
 * what the marketing site's `/api/waitlist` route forwards to. Mirrors the
 * guardless enquiry (S3-002) and public-payments surfaces.
 *
 * Write-only by design: there is no GET here. The list of people waiting is an
 * operator concern and does not belong on an unauthenticated controller.
 */
@Controller("public/waitlist")
export class WaitlistController {
    /**
     * Per-visitor speed bump. Same in-process, non-durable limiter the enquiry
     * surface uses — a cheap abuse brake, not a guarantee (see its docstring:
     * behind N replicas a client gets N× the limit). A waitlist is a low-value
     * target, so this is proportionate.
     */
    private readonly limiter = new FixedWindowRateLimiter(5, 60_000);

    constructor(private readonly waitlist: WaitlistService) {}

    /**
     * The limit counts the visitor: the address saroh.in's server signs into
     * `x-saroh-relay` (from its platform's own header, never a client-sent
     * `X-Forwarded-For`), else the caller's own. A relay that does not check
     * counts the caller, so forging one buys nothing.
     */
    @Post()
    @HttpCode(HttpStatus.OK)
    async join(
        @Body() dto: JoinWaitlistDto,
        @Ip() ip: string,
        @Headers(SITE_RELAY_HEADER) relay: string | undefined,
    ): Promise<JoinWaitlistResponse> {
        // The raw IP is hashed immediately and never leaves this handler — it
        // is used as the rate-limit key and stored only as a digest.
        const ipHash = visitorKey(ip, relay);

        if (ipHash && !this.limiter.take(ipHash)) {
            throw new HttpException(
                "Too many signups from this address. Try again shortly.",
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }

        const result = await this.waitlist.join({
            email: dto.email,
            business: dto.business,
            kind: dto.kind,
            city: dto.city,
            country: dto.country,
            plan: dto.plan,
            source: dto.source,
            ref: dto.ref,
            template: dto.template,
            ipHash,
        });

        return result.created
            ? {
                  ok: true,
                  created: true,
                  position: result.position,
                  ref: result.refCode,
              }
            : { ok: true, created: false };
    }
}
