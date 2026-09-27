import { env } from "../../env";

/**
 * The two server secrets site sign-in needs (round-2 plan A, A2), read at
 * use, the way `PAYMENTS_ENC_KEY` is: the API boots without them, and the
 * sign-in routes are what fail when one is missing.
 *
 * - `SITE_RELAY_SECRET` signs the `x-saroh-relay` header saroh.app sends.
 * - `SITE_ACCOUNTS_CODE_SECRET` keys the HMACs of a code's destination and
 *   of the code itself.
 *
 * Development and test fall back to fixed, public values so a fresh clone
 * signs in with nothing set. That is an allowlist of environments
 * (`devops-environments-and-flags.md`): anywhere else a missing secret
 * throws, and the request is a logged 500 rather than a site signing
 * relays with a value anyone can read here.
 */
const DEV_RELAY_SECRET =
    "saroh-dev-insecure-site-relay-secret-not-for-production";
const DEV_CODE_SECRET =
    "saroh-dev-insecure-site-code-secret-not-for-production";

function devFallbackAllowed(): boolean {
    return env.NODE_ENV === "development" || env.NODE_ENV === "test";
}

function resolve(value: string | undefined, name: string, dev: string): string {
    if (value) return value;
    if (devFallbackAllowed()) return dev;
    throw new Error(
        `${name} is not set. Site sign-in cannot run without it; see docs/architecture/ENVIRONMENT.md.`,
    );
}

export function siteRelaySecret(): string {
    return resolve(
        env.SITE_RELAY_SECRET,
        "SITE_RELAY_SECRET",
        DEV_RELAY_SECRET,
    );
}

export function siteCodeSecret(): string {
    return resolve(
        env.SITE_ACCOUNTS_CODE_SECRET,
        "SITE_ACCOUNTS_CODE_SECRET",
        DEV_CODE_SECRET,
    );
}
