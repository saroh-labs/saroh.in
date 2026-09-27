import { Injectable } from "@nestjs/common";

import { env } from "../../env";

/**
 * The bot challenge a sign-in code needs past a shared ceiling (ADR-011;
 * round-2 plan A, A2): Cloudflare Turnstile, checked server-side.
 *
 * With no keys set, no challenge is ever asked. A customer must never be
 * stuck on a widget the site cannot show, so the degraded path lets the
 * code go and `SiteCodeAlerts.challengeUnconfigured` says so at ERROR.
 */
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_TOKEN_LENGTH = 2_048;

@Injectable()
export class ChallengeVerifier {
    protected readonly siteKeyValue = env.TURNSTILE_SITE_KEY;
    protected readonly secretKey = env.TURNSTILE_SECRET_KEY;

    get configured(): boolean {
        return Boolean(this.siteKeyValue && this.secretKey);
    }

    /** The public key the site's widget renders with, or null. */
    get siteKey(): string | null {
        return this.configured ? (this.siteKeyValue ?? null) : null;
    }

    /** Whether Turnstile accepts the token. Any failure to ask is a no. */
    async verify(token: string | undefined, address: string): Promise<boolean> {
        if (!this.secretKey || !token || token.length > MAX_TOKEN_LENGTH) {
            return false;
        }
        try {
            const response = await fetch(SITEVERIFY, {
                method: "POST",
                body: new URLSearchParams({
                    secret: this.secretKey,
                    response: token,
                    remoteip: address,
                }),
                signal: AbortSignal.timeout(5_000),
            });
            if (!response.ok) return false;
            const body = (await response.json()) as { success?: unknown };
            return body.success === true;
        } catch {
            return false;
        }
    }
}
