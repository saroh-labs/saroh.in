import {
    Body,
    Controller,
    Get,
    Header,
    Headers,
    HttpCode,
    HttpException,
    Ip,
    NotFoundException,
    Param,
    Post,
} from "@nestjs/common";

import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { SITE_RELAY_HEADER, visitorKey } from "../site-accounts/site-relay";
import { CheckoutCancelDto } from "./checkout-return.dto";
import type { CheckoutSessionView } from "./checkout-session.service";
import { CheckoutSessionService } from "./checkout-session.service";

/**
 * Limits. The return page polls the read while a payment settles, and
 * each read may ask Stripe (at most every 10 s per session), so a caller
 * is held to about one a second and a session to fewer. A cancel costs a
 * Stripe call and may release a booking, so it is held tighter.
 */
const READS_PER_CALLER = 60;
const READS_PER_SESSION = 30;
const CANCELS_PER_CALLER = 20;
const CANCELS_PER_INTENT = 6;
const WINDOW_MS = 60_000;

/** A Stripe Checkout Session id (`cs_test_…`, `cs_live_…`). */
const SESSION_ID = /^cs_[A-Za-z0-9_]{1,250}$/;

function tooManyRequests(): HttpException {
    return new HttpException(
        "Too many requests for this payment. Try again shortly.",
        429,
    );
}

/**
 * PUBLIC return from Stripe's hosted Checkout (plan 2026-11-07-002, U7),
 * beside the checkout return at `/public/payments`, with NO guards: the
 * business's `/paid` page reads where its payment stands and, on Stripe's
 * Back link, cancels it. No session and no organization from the caller;
 * the business is the intent's (`CheckoutSessionService`). Limits count
 * the visitor saroh.app's server relays, else the caller.
 *
 * The session id and the cancel token are credentials, so nothing here is
 * cached, indexed or passed on in a Referer header.
 */
@Controller("public/payments/checkout")
export class CheckoutSessionController {
    private readonly readsPerCaller = new FixedWindowRateLimiter(
        READS_PER_CALLER,
        WINDOW_MS,
    );
    private readonly readsPerSession = new FixedWindowRateLimiter(
        READS_PER_SESSION,
        WINDOW_MS,
    );
    private readonly cancelsPerCaller = new FixedWindowRateLimiter(
        CANCELS_PER_CALLER,
        WINDOW_MS,
    );
    private readonly cancelsPerIntent = new FixedWindowRateLimiter(
        CANCELS_PER_INTENT,
        WINDOW_MS,
    );

    constructor(private readonly sessions: CheckoutSessionService) {}

    /** Where the payment of Stripe session `:sessionId` stands. 404 if unknown. */
    @Get(":sessionId")
    @Header("Referrer-Policy", "no-referrer")
    @Header("X-Robots-Tag", "noindex, nofollow")
    @Header("Cache-Control", "no-store")
    async read(
        @Param("sessionId") sessionId: string,
        @Ip() ip?: string,
        @Headers(SITE_RELAY_HEADER) relay?: string,
    ): Promise<CheckoutSessionView> {
        if (
            !this.readsPerCaller.take(visitorKey(ip, relay) ?? "unknown") ||
            !this.readsPerSession.take(sessionId)
        ) {
            throw tooManyRequests();
        }
        if (!SESSION_ID.test(sessionId)) {
            throw new NotFoundException("This payment wasn't found.");
        }
        return this.sessions.read(sessionId);
    }

    /**
     * Stripe's Back link: `{ intent, token }` from the cancel URL. Expires
     * the session, releases a booking hold, and answers as the read does.
     * A wrong token is the same 404 as an unknown intent.
     */
    @Post("cancel")
    @HttpCode(200)
    @Header("Referrer-Policy", "no-referrer")
    @Header("Cache-Control", "no-store")
    async cancel(
        @Body() dto: CheckoutCancelDto,
        @Ip() ip?: string,
        @Headers(SITE_RELAY_HEADER) relay?: string,
    ): Promise<CheckoutSessionView> {
        if (
            !this.cancelsPerCaller.take(visitorKey(ip, relay) ?? "unknown") ||
            !this.cancelsPerIntent.take(dto.intent)
        ) {
            throw tooManyRequests();
        }
        return this.sessions.cancel(dto.intent, dto.token);
    }
}
