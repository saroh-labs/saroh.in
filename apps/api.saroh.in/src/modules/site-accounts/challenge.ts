import {
    Injectable,
    Logger,
    ServiceUnavailableException,
} from "@nestjs/common";

import { env } from "../../env";

/**
 * The bot challenge a sign-in code needs past a shared ceiling (ADR-011;
 * round-2 plan A, A2): Cloudflare Turnstile, checked server-side.
 *
 * With no keys set, no challenge is ever asked. Outside production a
 * customer must never be stuck on a widget the site cannot show, so the
 * degraded path lets the code go and says so at ERROR. In production it
 * fails CLOSED (03-H2): what the challenge guards is refused with a 503
 * ({@link challengeUnavailable}), and boot logs an ERROR naming the keys, so
 * an unset key can't quietly turn every bot check off.
 */
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_TOKEN_LENGTH = 2_048;

let bootWarned = false;

@Injectable()
export class ChallengeVerifier {
    protected readonly siteKeyValue = env.TURNSTILE_SITE_KEY;
    protected readonly secretKey = env.TURNSTILE_SECRET_KEY;
    protected readonly production = env.NODE_ENV === "production";

    constructor() {
        if (this.failsClosed && !bootWarned) {
            bootWarned = true;
            new Logger(ChallengeVerifier.name).error(
                "turnstile_not_configured: TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY must both be set in production; until they are, every code that needs the bot check is refused (503)",
            );
        }
    }

    get configured(): boolean {
        return Boolean(this.siteKeyValue && this.secretKey);
    }

    /** Production with a key missing: refuse what the challenge guards (03-H2). */
    get failsClosed(): boolean {
        return this.production && !this.configured;
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

/** The 503 a send gets while the bot check is down in production (03-H2). */
export function challengeUnavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({
        message:
            "Codes can't be sent right now. Use another way to sign in, or try again later.",
        details: { code: "UNAVAILABLE", reason: "unavailable" },
    });
}
