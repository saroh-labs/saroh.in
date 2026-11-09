import {
    Body,
    Controller,
    ForbiddenException,
    Headers,
    HttpCode,
    HttpException,
    HttpStatus,
    Ip,
    Logger,
    Post,
} from "@nestjs/common";

import { editionOfFormHost } from "../../common/edition-address";
import { FixedWindowRateLimiter } from "../enquiry/rate-limiter";
import { ChallengeVerifier } from "../site-accounts/challenge";
import { SITE_RELAY_HEADER, visitorKey } from "../site-accounts/site-relay";
import { JoinWaitlistDto } from "./dto";
import { cleanSource, PAID_PLANS_SOURCE } from "./waitlist-keys";
import { WaitlistService } from "./waitlist.service";

/**
 * What a join answers. A repeat (`created: false`) carries no place or link.
 * A "Tell me when" (`paid-plans`) answers `{ ok: true }` alone, new or not.
 */
export type JoinWaitlistResponse =
    | { ok: true; created: true; position: number; ref: string | null }
    | { ok: true; created: false }
    | { ok: true };

let challengeWarnedAt = 0;

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

    private readonly logger = new Logger(WaitlistController.name);

    constructor(
        private readonly waitlist: WaitlistService,
        private readonly challenge: ChallengeVerifier,
    ) {}

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
        @Headers("host") host?: string,
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

        // "Tell me when" (KTD8): saroh.tech posts it straight from the
        // browser, so it carries Turnstile, and its reply is the same for a
        // new and a repeat address.
        if (cleanSource(dto.source) === PAID_PLANS_SOURCE) {
            if (!(await this.challenged(dto.turnstileToken, ip))) {
                throw new ForbiddenException({
                    message: "The check didn't pass. Try again.",
                    details: { reason: "challenge" },
                });
            }
            await this.waitlist.tellMeWhen({
                email: dto.email,
                edition: editionOfFormHost(host),
                ipHash,
            });
            return { ok: true };
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
            edition: editionOfFormHost(host),
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

    /** Turnstile when it is set up; without it the list stays open and says so, once an hour (as the downloads' gate). */
    private async challenged(
        token: string | undefined,
        address: string,
    ): Promise<boolean> {
        if (this.challenge.configured) {
            return this.challenge.verify(token, address);
        }
        if (Date.now() - challengeWarnedAt > 3_600_000) {
            challengeWarnedAt = Date.now();
            this.logger.error(
                "paid_plans_challenge_not_configured: Tell me when takes posts with no bot check; set TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY",
            );
        }
        return true;
    }
}
