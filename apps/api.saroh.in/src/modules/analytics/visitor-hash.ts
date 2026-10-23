import { Logger } from "@nestjs/common";
import { createHash, createHmac, randomBytes } from "node:crypto";

import { declaredNodeEnv, env } from "../../env";

/**
 * The visitor hash a public page view is stored with (S7-002), and the key
 * the beacon's rate limit is counted under: never the visitor's address.
 *
 * Since the U15 privacy review it is
 * `sha256(dailySalt + ":" + siteId + ":" + ip)`, where the daily salt is
 * `HMAC-SHA256(ANALYTICS_IP_SALT, "analytics-visitor:" + the UTC day)`:
 *
 * - **It changes every day.** The same visitor has a new hash tomorrow, so
 *   no row can follow one person from day to day, and an old salt can't be
 *   asked for: it is derived on the server from the secret and the date,
 *   never stored. "Unique visitors per day" still works: within one UTC
 *   day (the day the daily rollup buckets by) the same visitor on the same
 *   site has one hash.
 * - **It is per site.** The same visitor on two of a business's sites, or
 *   on two businesses' sites, has two unrelated hashes, so one business's
 *   rows can never be matched with another's. (The org-wide total of
 *   unique visitors therefore counts a person once per site.)
 *
 * The secret is `ANALYTICS_IP_SALT` (`src/env.ts`). Development and test
 * fall back to a fixed, public value when it is unset, as the site
 * secrets do (`site-accounts/site-secrets.ts`). Anywhere else an unset
 * secret is never replaced by that public value, which would let anyone
 * with a database copy try every address: a random secret is made for
 * this process instead, with a warning, so counting goes on (a restart
 * then splits one day's unique visitors) until the variable is set.
 */

/** The public development fallback; never used outside development and test. */
const DEV_SECRET = "saroh-dev-analytics-ip-salt";

/** What the daily salt is derived for, so it can't be another HMAC's. */
const SALT_PURPOSE = "analytics-visitor";

const logger = new Logger("AnalyticsVisitorHash");

let processSecret: string | null = null;

/** Whether the public fallback may stand in, for `NODE_ENV` as declared. */
function devFallbackAllowed(nodeEnv: string | undefined): boolean {
    return nodeEnv === "development" || nodeEnv === "test";
}

/**
 * The secret the daily salt is derived from. Exported for tests, which
 * pass the environment in.
 */
export function visitorHashSecret(
    configured: string | undefined = env.ANALYTICS_IP_SALT,
    nodeEnv: string | undefined = declaredNodeEnv,
): string {
    if (configured) return configured;
    if (devFallbackAllowed(nodeEnv)) return DEV_SECRET;
    if (processSecret === null) {
        processSecret = randomBytes(32).toString("hex");
        logger.warn(
            "ANALYTICS_IP_SALT is not set: visitor hashes use a secret made for this process, so a restart splits a day's unique visitors. Set it (docs/architecture/ENVIRONMENT.md).",
        );
    }
    return processSecret;
}

/** The UTC day `at` falls on, as `YYYY-MM-DD`. */
function utcDay(at: Date): string {
    return at.toISOString().slice(0, 10);
}

/** The salt for the UTC day `at` falls on: derived, never stored. */
export function dailySalt(secret: string, at: Date): string {
    return createHmac("sha256", secret)
        .update(`${SALT_PURPOSE}:${utcDay(at)}`)
        .digest("hex");
}

/**
 * The visitor hash for one address on one site on the UTC day `at` falls
 * on. The address is used only here and never kept.
 */
export function visitorHashOf(
    siteId: string,
    ip: string,
    at: Date,
    secret: string = visitorHashSecret(),
): string {
    return createHash("sha256")
        .update(`${dailySalt(secret, at)}:${siteId}:${ip}`)
        .digest("hex");
}

/** Tests only: forget the per-process secret. */
export function forgetProcessSecretForTests(): void {
    processSecret = null;
}
