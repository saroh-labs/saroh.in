import { headers } from "next/headers";

/**
 * The one `Origin` check every state-changing action on a merchant's site
 * makes before it calls the API (ADR-011; round-2 plan A, A3).
 *
 * Until `saroh.app` is on the Public Suffix List, a browser treats every
 * `*.saroh.app` site as the same site, so `SameSite=Lax` alone does not stop
 * one merchant's page posting to another's. So each action compares the
 * request's `Origin` with the host it is served on and refuses anything
 * else — a missing `Origin` too: a browser always sends one with a server
 * action. `lib/origin.test.ts` lists the actions and fails when one skips it.
 */

/** The host a request is served on: lower-cased, no port. */
export function servedHost(requestHeaders: Headers): string | null {
    const host = requestHeaders.get("host")?.trim().toLowerCase();
    if (!host) return null;
    return host.split(":")[0] || null;
}

/** True for a hostname that only ever means this machine. */
function isLocal(hostname: string): boolean {
    return hostname === "localhost" || hostname.endsWith(".localhost");
}

/**
 * The served host when `Origin` names exactly it, or null. HTTPS only,
 * except on a `.localhost` address in development.
 */
export function sameOriginHost(requestHeaders: Headers): string | null {
    const host = servedHost(requestHeaders);
    const origin = requestHeaders.get("origin");
    if (!host || !origin || origin === "null") return null;
    let parsed: URL;
    try {
        parsed = new URL(origin);
    } catch {
        return null;
    }
    const secure =
        parsed.protocol === "https:" ||
        (parsed.protocol === "http:" && isLocal(parsed.hostname));
    if (!secure || parsed.hostname.toLowerCase() !== host) return null;
    return host;
}

/**
 * Call first in every state-changing action: the host the visitor is on,
 * or null when the request came from anywhere else (then nothing is sent).
 */
export async function siteOrigin(): Promise<string | null> {
    return sameOriginHost(await headers());
}
