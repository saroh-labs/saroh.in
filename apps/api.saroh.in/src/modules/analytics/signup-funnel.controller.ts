import {
    Body,
    Controller,
    Headers,
    HttpCode,
    HttpStatus,
    Ip,
    Post,
} from "@nestjs/common";

import { hashClientIp } from "../../common/client-ip";
import { telemetryOn } from "../../common/observability/posthog";
import { FixedWindowRateLimiter } from "../enquiry/rate-limiter";
import { countsAsPerson } from "../sites/public-qr.service";
import { signupPageViewed, signupViewProperties } from "./product-milestones";

/**
 * Views one caller may count in a minute. Accounts' server is the caller, so
 * this caps all its views from one address: generous, a brake on a loop.
 * shortcut: counts accounts' address, not the visitor's; sign the visitor's
 * address (`x-saroh-relay`) if one address ever needs a limit of its own.
 */
export const SIGNUP_VIEWS_PER_MINUTE = 120;

type HeaderMap = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

/** A browser fetching the page ahead of a click is not a person on it. */
function isPrefetch(headers: HeaderMap): boolean {
    return [headers["sec-purpose"], headers.purpose].some((value) =>
        first(value)?.toLowerCase().includes("prefetch"),
    );
}

/**
 * PUBLIC, no guards: accounts' server says someone opened the sign-up page
 * (DEC-187, amended 24 Oct), and one anonymous `signup_page_viewed` is sent.
 * Always 204, whatever happened: a view is never worth an error, and the
 * caller doesn't wait on it.
 */
@Controller("public/funnel")
export class SignupFunnelController {
    private readonly limiter = new FixedWindowRateLimiter(
        SIGNUP_VIEWS_PER_MINUTE,
        60_000,
    );

    @Post("signup-viewed")
    @HttpCode(HttpStatus.NO_CONTENT)
    signupViewed(
        @Body() body: unknown,
        @Ip() ip: string | undefined,
        @Headers() headers: HeaderMap,
    ): void {
        try {
            if (!telemetryOn()) return;
            if (!countsAsPerson(first(headers["user-agent"]))) return;
            if (isPrefetch(headers)) return;
            const key = hashClientIp(ip);
            if (key && !this.limiter.take(key)) return;
            signupPageViewed(signupViewProperties(body));
        } catch {
            // Never in the way: a lost view is only a count one short.
        }
    }
}
