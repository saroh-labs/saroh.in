import { TEST_LABEL_PREFIX } from "./site-host-mode";

/**
 * A domain its plan has paused (DEC-139), as the renderer reads it.
 *
 * A business's own domain stops showing its site 3 days after its plan
 * stopped including one. Its host's lookup then answers the 404 any host
 * with no site gets, and names where the site is:
 *
 *     { error: { details: { reason: "domain-paused", to: "https://yourshop.saroh.app" } } }
 *
 * The layout sends the visitor to the same path on `to` with a temporary
 * redirect, so the business's customers still reach it, and nothing of
 * Saroh's is shown on the way. The domain stays connected: the same lookup
 * serves the site again the moment the plan includes a domain.
 *
 * Pure, so the rules are tested without a server.
 */

/** `details.reason` of the 404 a paused domain's host answers. */
export const DOMAIN_PAUSED_REASON = "domain-paused";

/** The longest DNS label (RFC 1035). */
const MAX_LABEL = 63;

/**
 * Where a paused domain sends visitors, from the lookup's 404 body: an
 * origin, or null when the body doesn't say the domain is paused.
 *
 * Only a Saroh address is ever believed: `to` must be an https (or http)
 * origin one label under the renderer's root domain. Anything else, and a
 * host that would forward to itself, reads as a plain 404.
 */
export function pausedOriginOf(
    body: unknown,
    host: string,
    rootDomain: string,
): string | null {
    const details = (
        body as {
            error?: { details?: { reason?: unknown; to?: unknown } };
        } | null
    )?.error?.details;
    if (details?.reason !== DOMAIN_PAUSED_REASON) return null;
    if (typeof details.to !== "string") return null;
    let to: URL;
    try {
        to = new URL(details.to);
    } catch {
        return null;
    }
    if (to.protocol !== "https:" && to.protocol !== "http:") return null;
    const root = rootDomain.toLowerCase();
    const target = to.hostname.toLowerCase();
    if (!root || !target.endsWith(`.${root}`)) return null;
    const address = target.slice(0, -(root.length + 1));
    if (!address || address.includes(".")) return null;
    if (target === host.toLowerCase()) return null;
    return to.origin;
}

/**
 * Where the test host of a paused domain (`test.<domain>`) sends visitors:
 * the test host of the site's Saroh address (`test--<address>`), where its
 * test releases still open. An address too long for that label has no test
 * host, and the visitor goes to the address itself.
 */
export function pausedTestOrigin(pausedTo: string, rootDomain: string): string {
    const root = rootDomain.toLowerCase();
    let to: URL;
    try {
        to = new URL(pausedTo);
    } catch {
        return pausedTo;
    }
    const target = to.hostname.toLowerCase();
    if (!target.endsWith(`.${root}`)) return pausedTo;
    const label = `${TEST_LABEL_PREFIX}${target.slice(0, -(root.length + 1))}`;
    if (label.length > MAX_LABEL) return pausedTo;
    to.hostname = `${label}.${root}`;
    return to.origin;
}
