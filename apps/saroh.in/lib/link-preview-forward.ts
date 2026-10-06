import {
    RELAY_HEADER,
    signRelay,
    visitorAddress,
} from "@/lib/waitlist-forward";

/**
 * How `/api/link-preview` and `/api/link-preview/report` reach api.saroh.in
 * (resources plan U2). Server only: it signs with a secret.
 *
 * The API refuses both routes without a valid signed `x-saroh-relay`
 * (401), so nobody can call it directly and skip this site. The relay is
 * therefore ALWAYS sent: the visitor's address from the platform's header
 * (`x-real-ip`, which Vercel's edge always writes), or, where there is
 * none — a local or browser-test stack with no edge in front — a fixed
 * stand-in, so those visitors share one limit. Without a secret the
 * routes can't sign anything, and answer `unavailable` (503) with a logged
 * error rather than send a call the API will refuse.
 */

/** Who the limits count when no platform header names the visitor. */
const NO_EDGE_ADDRESS = "0.0.0.0";

/** The API call's headers, or null when there is no secret to sign with. */
export function linkPreviewHeaders(input: {
    headers: Headers;
    host: string;
    secret: string | null;
    now?: number;
}): Record<string, string> | null {
    if (!input.secret) return null;
    const address = visitorAddress(input.headers) ?? NO_EDGE_ADDRESS;
    return {
        "Content-Type": "application/json",
        [RELAY_HEADER]: signRelay(
            { address, host: input.host, now: input.now },
            input.secret,
        ),
    };
}
