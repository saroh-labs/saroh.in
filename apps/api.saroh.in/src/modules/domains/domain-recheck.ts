import type { Domain } from "@saroh/database";

/**
 * When the background re-check looks at a domain again (#860). Pure, so
 * the ladder is pinned by a unit test rather than read off a log.
 *
 * - Verified and live: once a day, so a domain that stops pointing here
 *   (the CNAME removed, the certificate lapsed) is noticed within a day.
 * - Verified, not live yet (or with a problem): every 5 minutes for the
 *   first hour after it verified, while the merchant is likely at their
 *   registrar; hourly until a day has passed; every 6 hours after.
 * - Not verified yet: the same ladder from the claim, for its TXT record,
 *   and never past 7 days: a claim left that long is abandoned, and "Check
 *   now" still checks it.
 *
 * "Check now" stamps the same columns, so a domain the merchant just
 * checked is not asked again until its next turn.
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** How often the sweep runs: the shortest step of the ladder. */
export const DOMAIN_RECHECK_EVERY_MS = 5 * MINUTE_MS;

/** Not-live steps, by time since it verified (or was claimed). */
export const RECHECK_FAST_MS = 5 * MINUTE_MS;
export const RECHECK_FAST_FOR_MS = HOUR_MS;
export const RECHECK_HOURLY_MS = HOUR_MS;
export const RECHECK_HOURLY_FOR_MS = DAY_MS;
export const RECHECK_SLOW_MS = 6 * HOUR_MS;

/** A live domain is asked again daily. */
export const RECHECK_LIVE_MS = DAY_MS;

/** An unverified claim stops being re-checked in the background after this. */
export const RECHECK_PENDING_FOR_MS = 7 * DAY_MS;

/**
 * At most this many domains per run. Each costs one or two calls to
 * Cloudflare's custom-hostnames API (a status read; a register and a
 * look-up when it must register again), so a run stays near a hundred
 * calls in five minutes, well under the API's per-token limit (1,200 in
 * five minutes) that "Check now" and removals share. The oldest-checked go
 * first, so a backlog drains over a few runs and none is starved.
 */
export const DOMAIN_RECHECK_BATCH = 50;

/**
 * A run stops after this many host calls in a row fail (a 429, an outage):
 * asking again at once only spends the rate limit. The rest wait for the
 * next run.
 */
export const DOMAIN_RECHECK_MAX_HOST_FAILURES = 3;

export type RecheckRow = Pick<
    Domain,
    | "status"
    | "createdAt"
    | "verifiedAt"
    | "lastCheckedAt"
    | "hostingStatus"
    | "hostingCheckedAt"
>;

/** The not-live step for something `age` old. */
function ladder(age: number): number {
    if (age < RECHECK_FAST_FOR_MS) return RECHECK_FAST_MS;
    if (age < RECHECK_HOURLY_FOR_MS) return RECHECK_HOURLY_MS;
    return RECHECK_SLOW_MS;
}

/**
 * When `domain` is next due, or null when the background check leaves it
 * alone (an unverified claim past {@link RECHECK_PENDING_FOR_MS}, or a
 * status it doesn't know).
 */
export function nextRecheckAt(domain: RecheckRow, now: Date): Date | null {
    if (domain.status === "VERIFIED") {
        const last = domain.hostingCheckedAt;
        if (!last) return now;
        if (domain.hostingStatus === "ACTIVE") {
            return new Date(last.getTime() + RECHECK_LIVE_MS);
        }
        const since = domain.verifiedAt ?? domain.createdAt;
        const age = now.getTime() - since.getTime();
        return new Date(last.getTime() + ladder(age));
    }
    if (domain.status === "PENDING") {
        const age = now.getTime() - domain.createdAt.getTime();
        if (age >= RECHECK_PENDING_FOR_MS) return null;
        const last = domain.lastCheckedAt;
        if (!last) return now;
        return new Date(last.getTime() + ladder(age));
    }
    return null;
}

/** Whether `domain` is due a background re-check at `now`. */
export function recheckDue(domain: RecheckRow, now: Date): boolean {
    const at = nextRecheckAt(domain, now);
    return at !== null && at.getTime() <= now.getTime();
}

/** When it was last checked, for ordering a run oldest-first (never = 0). */
export function lastCheckedOf(domain: RecheckRow): number {
    const last =
        domain.status === "VERIFIED"
            ? domain.hostingCheckedAt
            : domain.lastCheckedAt;
    return last?.getTime() ?? 0;
}
