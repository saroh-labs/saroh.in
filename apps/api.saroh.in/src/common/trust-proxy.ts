import type { INestApplication } from "@nestjs/common";

/**
 * Which proxies may tell the API who the client is (#508).
 *
 * - `cloudflare` — Cloudflare's edge and the private network (Traefik on
 *   Coolify, portless locally). Production: client → Cloudflare → Traefik → API.
 * - `private` — the private network only: a proxy in front, no CDN.
 * - `none` — nothing; the socket's address is the client (a bare port, CI).
 */
export const TRUST_PROXY_MODES = ["cloudflare", "private", "none"] as const;
export type TrustProxyMode = (typeof TRUST_PROXY_MODES)[number];

/** Express's names for loopback, 169.254/16 and the RFC 1918 / fc00::/7 ranges. */
const PRIVATE = ["loopback", "linklocal", "uniquelocal"];

/**
 * Cloudflare's edge, from https://www.cloudflare.com/ips-v4 and /ips-v6
 * (checked 2026-09-25). They change rarely; a range missing here makes
 * requests through it read as Cloudflare's address, never a spoofed one.
 */
export const CLOUDFLARE_RANGES = [
    "173.245.48.0/20",
    "103.21.244.0/22",
    "103.22.200.0/22",
    "103.31.4.0/22",
    "141.101.64.0/18",
    "108.162.192.0/18",
    "190.93.240.0/20",
    "188.114.96.0/20",
    "197.234.240.0/22",
    "198.41.128.0/17",
    "162.158.0.0/15",
    "104.16.0.0/13",
    "104.24.0.0/14",
    "172.64.0.0/13",
    "131.0.72.0/22",
    "2400:cb00::/32",
    "2606:4700::/32",
    "2803:f800::/32",
    "2405:b500::/32",
    "2405:8100::/32",
    "2a06:98c0::/29",
    "2c0f:f248::/32",
];

/** What Express's `trust proxy` is set to for each mode. */
export function trustedProxies(mode: TrustProxyMode): string[] | false {
    switch (mode) {
        case "cloudflare":
            return [...PRIVATE, ...CLOUDFLARE_RANGES];
        case "private":
            return PRIVATE;
        case "none":
            return false;
    }
}

/**
 * Trust proxies by address, not by count, on the Express instance under Nest
 * — what `@Ip()` and every rate limiter keyed on it see. Express walks
 * `X-Forwarded-For` back from the socket and stops at the first address it
 * does not trust: the client. So the answer is right whether a request came
 * through Cloudflare or straight to Traefik, and a client who skips
 * Cloudflare cannot name its own address — its entry is never reached past
 * an untrusted hop.
 *
 * Under SKIP_ENV_VALIDATION the value arrives raw, or unset: anything that is
 * not a known mode trusts nothing, which is right for CI's bare port.
 */
export function trustProxy(
    app: INestApplication,
    mode: string | undefined,
): void {
    const known = (TRUST_PROXY_MODES as readonly string[]).includes(mode ?? "");
    const express = app.getHttpAdapter().getInstance() as {
        set(setting: string, value: unknown): unknown;
    };
    express.set(
        "trust proxy",
        trustedProxies(known ? (mode as TrustProxyMode) : "none"),
    );
}
