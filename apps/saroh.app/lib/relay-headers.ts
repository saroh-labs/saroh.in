import { headers } from "next/headers";

import { servedHost } from "./origin";
import { relayFor, SITE_RELAY_HEADER } from "./site-relay";

/**
 * `base` plus the signed visitor relay (ADR-011), so the API limits each
 * visitor rather than this server, which every visitor's call comes from.
 * Without a relay (no visitor address, no SITE_RELAY_SECRET) the call goes
 * unsigned, as `getBookingVisit` does: the limit then counts this server,
 * never the call failing.
 */
export function withRelayFrom(
    requestHeaders: Headers,
    base: Record<string, string>,
): Record<string, string> {
    const sent = { ...base };
    const host = servedHost(requestHeaders);
    try {
        const relay = host ? relayFor(requestHeaders, host) : null;
        if (relay) sent[SITE_RELAY_HEADER] = relay;
    } catch {
        // No SITE_RELAY_SECRET here: unsigned rather than not at all.
    }
    return sent;
}

/** {@link withRelayFrom} for the request being rendered or acted on. */
export async function withRelay(
    base: Record<string, string>,
): Promise<Record<string, string>> {
    try {
        return withRelayFrom(await headers(), base);
    } catch {
        // Outside a request (a test, a build): nothing to relay.
        return { ...base };
    }
}
