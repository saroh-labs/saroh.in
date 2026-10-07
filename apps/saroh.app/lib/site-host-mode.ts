/**
 * Which kind of site a host serves (DEC-071, KTD-7): the LIVE site, or a TEST
 * release of it.
 *
 * A copy of the pure half of the API's
 * `apps/api.saroh.in/src/modules/sites/site-host-mode.ts`. Both test files pin
 * the same vector, as `site-relay.ts` does, so the renderer and the API can
 * never disagree about whether a host is live or test. Change one, change
 * both.
 *
 * The rules:
 *  - `test--<address>.<root>` is the test host of the site at `<address>`.
 *  - Any host whose first label starts with `test--` is a test host, wherever
 *    it is. Off the root it names no site, so nothing is served on it.
 *  - `test.<H>` off the root is the test host of the custom domain `<H>`.
 *    (The API alone can see an older VERIFIED claim on the whole host, which
 *    makes it live there; this side cannot, and treats it as test, which
 *    fails closed.)
 *  - Everything else is live.
 *
 * Pure and dependency-free, so the middleware (edge) and the pages share it.
 */

export type SiteHostKind = "live" | "test";

/** What a host names: a platform address, a custom hostname, or nothing. */
export type SiteHostLookup =
    | { by: "subdomain"; subdomain: string }
    | { by: "hostname"; hostname: string }
    | null;

export interface SiteHostClass {
    /** The host as compared: lower-cased, no port, no final dot. */
    host: string;
    mode: SiteHostKind;
    /**
     * For a live host, where the live lookups start. For a test host, the
     * site whose release it may show; null when it names none.
     */
    lookup: SiteHostLookup;
}

/** The prefix of a platform test host's first label. */
export const TEST_LABEL_PREFIX = "test--";

/** The first label of a custom domain's test host. */
export const TEST_CUSTOM_LABEL = "test";

/** A host as it is compared: lower-cased, no port, no final dot. */
export function normaliseSiteHost(host: string): string {
    const bare = host.trim().toLowerCase().split(":")[0] ?? "";
    return bare.endsWith(".") ? bare.slice(0, -1) : bare;
}

/**
 * Classify a host by its shape alone (KTD-7). `rootDomain` is the renderer's
 * apex: `saroh.app`, or `saroh.app.localhost` in development.
 */
export function classifySiteHost(
    rawHost: string,
    rootDomain: string,
): SiteHostClass {
    const host = normaliseSiteHost(rawHost);
    const root = normaliseSiteHost(rootDomain);
    const live = (lookup: SiteHostLookup): SiteHostClass => ({
        host,
        mode: "live",
        lookup,
    });
    const test = (lookup: SiteHostLookup): SiteHostClass => ({
        host,
        mode: "test",
        lookup,
    });

    if (!host) return live(null);
    const labels = host.split(".");
    const first = labels[0] ?? "";

    if (root && host.endsWith(`.${root}`)) {
        const sub = host.slice(0, -(root.length + 1));
        const subLabels = sub.split(".");
        const address = subLabels[0] ?? "";
        if (address.startsWith(TEST_LABEL_PREFIX)) {
            const named = address.slice(TEST_LABEL_PREFIX.length);
            // `test--acme.saroh.app` only: one label under the root, naming
            // an address. `test--a.b.saroh.app` names nothing.
            return test(
                subLabels.length === 1 && named
                    ? { by: "subdomain", subdomain: named }
                    : null,
            );
        }
        // The renderer's rule: the left-most label is the tenant.
        return live(
            address && address !== "www"
                ? { by: "subdomain", subdomain: address }
                : null,
        );
    }
    if (host === root) return live(null);

    // Off the root: a merchant's own domain.
    if (first.startsWith(TEST_LABEL_PREFIX)) return test(null);
    if (first === TEST_CUSTOM_LABEL && labels.length >= 3) {
        return test({ by: "hostname", hostname: labels.slice(1).join(".") });
    }
    return live({ by: "hostname", hostname: host });
}

/** True when the host is a test host by its shape. */
export function isTestShapedHost(host: string, rootDomain: string): boolean {
    return classifySiteHost(host, rootDomain).mode === "test";
}

/**
 * The live host a test host stands beside (UX-081): `test--acme.saroh.app`
 * → `acme.saroh.app`, `test.shop.acme.com` → `shop.acme.com`. Null for a
 * host that names no live site. The gate offers "Go to the live site" with
 * it, so a visitor without the link isn't left at a dead end.
 */
export function liveHostOf(rawHost: string, rootDomain: string): string | null {
    const found = classifySiteHost(rawHost, rootDomain);
    if (found.mode !== "test" || !found.lookup) return null;
    return found.lookup.by === "subdomain"
        ? `${found.lookup.subdomain}.${normaliseSiteHost(rootDomain)}`
        : found.lookup.hostname;
}
