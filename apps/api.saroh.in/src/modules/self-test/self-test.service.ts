import {
    ForbiddenException,
    HttpException,
    Injectable,
    Optional,
} from "@nestjs/common";

import { sendSelfTestEmail } from "../../common/email";
import type { AuthUser } from "../../common/types/store-context";
import { FixedWindowRateLimiter } from "../enquiry/rate-limiter";
import type { SelfTestTemplate } from "./self-test.templates";
import { renderSelfTestTemplate } from "./self-test.templates";

/**
 * Redact an email for the response so we don't echo the full address back over
 * the wire: `ada@example.com` -> `a***@example.com`.
 */
function redactEmail(email: string): string {
    const at = email.indexOf("@");
    if (at <= 0) {
        return "***";
    }
    const local = email.slice(0, at);
    const domain = email.slice(at);
    return `${local[0]}***${domain}`;
}

/**
 * Self-test / template-preview emails (S6-004).
 *
 * The whole point of this service is that a signed-in user can preview a
 * built-in email template by sending a Saroh self-test to THEIR OWN verified
 * account address — and nothing else:
 *
 *  - The recipient is taken ONLY from the authenticated session {@link AuthUser}
 *    (`user.email`); it is never read from, or influenceable by, the request
 *    body. There is no recipient parameter anywhere in the call path.
 *  - The account email must be verified (`user.emailVerified`) or the send is
 *    refused with 403 — a test can't be used to probe an unverified address.
 *  - Sends are rate-limited per userId (a few per hour) -> 429 on exceed.
 *  - Delivery goes through Saroh's OWN transactional transporter (not any org's
 *    connected provider) and is loudly labeled `[Saroh test]` so it can never be
 *    mistaken for production Organization delivery.
 */
@Injectable()
export class SelfTestService {
    /**
     * Per-userId fixed-window limiter. Default: 5 self-tests per hour, per API
     * instance (see {@link FixedWindowRateLimiter} — a per-process abuse
     * speed-bump). Injectable so tests can drive the boundary deterministically.
     */
    constructor(
        // Neither param is a DI provider — both are per-instance defaults;
        // @Optional() stops Nest trying to inject them so the defaults (and
        // test overrides) apply.
        @Optional()
        private readonly rateLimiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            5,
            60 * 60_000,
        ),
        @Optional()
        private readonly sendEmail: typeof sendSelfTestEmail = sendSelfTestEmail,
    ) {}

    /**
     * Send the chosen preview template to the authenticated user's own verified
     * account email.
     *
     * @param user     the Better Auth session user (from BetterAuthGuard) — the
     *                 SOLE source of the recipient address.
     * @param template one of the fixed built-in preview keys.
     */
    async sendSelfTest(
        user: AuthUser,
        template: SelfTestTemplate,
    ): Promise<{ sentTo: string; template: SelfTestTemplate }> {
        // 1. The recipient can ONLY ever be the session user's own address, and
        //    it must be a verified account email.
        if (!user.emailVerified) {
            throw new ForbiddenException(
                "Verify your email address before sending a Saroh test email",
            );
        }

        // 2. Per-user rate limit -> 429 on exceed.
        const allowed = this.rateLimiter.take(user.id);
        if (!allowed) {
            throw new HttpException(
                "Too many test emails — please try again later",
                429,
            );
        }

        // 3. Render a server-owned built-in template and send it, hard-bound to
        //    the user's own email, via Saroh's transporter with the test label.
        const { label, html } = renderSelfTestTemplate(template);
        await this.sendEmail(user.email, { templateLabel: label, html });

        return { sentTo: redactEmail(user.email), template };
    }
}
