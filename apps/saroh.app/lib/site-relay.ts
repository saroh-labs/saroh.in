import { createHmac } from "node:crypto";
import { isIP } from "node:net";

import { env } from "@/env";

/**
 * The signed relay this server sends on every call to the API's
 * `public/site-accounts/*` routes (ADR-011; round-2 plan A, A3).
 *
 * The API sees this server's address, not the visitor's, and cannot tell
 * which site the visitor was on. So each call carries, in `x-saroh-relay`,
 * the visitor's address, the host this server served and the time, signed
 * with the secret the two apps share (`SITE_RELAY_SECRET`):
 *
 *     v1.<unix seconds>.<base64url(address)>.<base64url(host)>.<base64url(sig)>
 *
 * where `sig` is HMAC-SHA256 over `v1\n<seconds>\n<address>\n<host>`. This
 * is exactly the API's `signSiteRelay`
 * (`apps/api.saroh.in/src/modules/site-accounts/site-relay.ts`); both test
 * files pin the same vector, so a change to one side fails there. The API
 * refuses anything unsigned, stale (60 s) or forged with a 401.
 *
 * Server-only: the secret never reaches a browser.
 */
export const SITE_RELAY_HEADER = "x-saroh-relay";
const VERSION = "v1";

/**
 * The API's development fallback (`site-secrets.ts`), so a fresh clone signs
 * in with nothing set. Allowed only in development and test, as there.
 */
const DEV_RELAY_SECRET =
    "saroh-dev-insecure-site-relay-secret-not-for-production";

export function siteRelaySecret(): string {
    if (env.SITE_RELAY_SECRET) return env.SITE_RELAY_SECRET;
    if (env.NODE_ENV === "development" || env.NODE_ENV === "test") {
        return DEV_RELAY_SECRET;
    }
    throw new Error(
        "SITE_RELAY_SECRET is not set. Customer sign-in on merchant sites cannot run without it; see docs/architecture/ENVIRONMENT.md.",
    );
}

/** A host as it is signed: lower-cased, no port, no final dot. */
export function normaliseHost(host: string): string {
    const bare = host.trim().toLowerCase().split(":")[0] ?? "";
    return bare.endsWith(".") ? bare.slice(0, -1) : bare;
}

const b64 = (value: string | Buffer) =>
    Buffer.from(value).toString("base64url");

/** The header value for one call. */
export function signSiteRelay(
    input: { address: string; host: string; now?: number },
    secret: string,
): string {
    const seconds = String(Math.floor((input.now ?? Date.now()) / 1000));
    const host = normaliseHost(input.host);
    const sig = createHmac("sha256", secret)
        .update(`${VERSION}\n${seconds}\n${input.address}\n${host}`)
        .digest();
    return [VERSION, seconds, b64(input.address), b64(host), b64(sig)].join(
        ".",
    );
}

/** An address as a header may carry it: bare, bracketed or with a port. */
function bareAddress(raw: string | undefined): string | null {
    if (!raw) return null;
    let value = raw.trim();
    const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(value);
    if (bracketed?.[1]) value = bracketed[1];
    else if (/^[\d.]+:\d+$/.test(value)) value = value.split(":")[0] ?? "";
    return isIP(value) === 0 ? null : value;
}

/**
 * The visitor's address, as this app's platform reports it:
 * `cf-connecting-ip` first, then `x-real-ip`, then the first
 * `x-forwarded-for` entry.
 *
 * Cloudflare writes `cf-connecting-ip` and overwrites any a visitor sent, on
 * a Worker and in front of any origin it proxies to. Behind that proxy (Vercel,
 * until 9 Oct 2026) `x-real-ip` and `x-forwarded-for` name Cloudflare's edge,
 * not the visitor, so every visitor would share a handful of addresses (and
 * the API's per-visitor limits with them). On a Worker `x-forwarded-for` keeps what the
 * visitor sent, so it is never read before Cloudflare's header.
 *
 * Off the platform (local development behind portless, CI) a request can
 * arrive with neither; the loopback address stands in there, and only there.
 */
export function visitorAddress(headers: Headers): string | null {
    const found =
        bareAddress(headers.get("cf-connecting-ip") ?? undefined) ??
        bareAddress(headers.get("x-real-ip") ?? undefined) ??
        bareAddress(headers.get("x-forwarded-for")?.split(",")[0]);
    if (found) return found;
    return env.NEXT_PUBLIC_VERCEL_ENV ? null : "127.0.0.1";
}

/**
 * The relay header for this request, or null when the visitor's address is
 * unknown (then the call is not made: the API would refuse it anyway).
 */
export function relayFor(headers: Headers, host: string): string | null {
    const address = visitorAddress(headers);
    if (!address) return null;
    return signSiteRelay({ address, host }, siteRelaySecret());
}
