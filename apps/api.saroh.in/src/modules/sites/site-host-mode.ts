import { outsideOrgContext, prisma } from "@saroh/database";

import { rendererHost } from "./site-origin";

/**
 * Which kind of site a host serves (DEC-071, KTD-7): the LIVE site, or a
 * TEST release of it. The one place the API decides it, so the live lookups,
 * the test-release lookup (T3) and the write guard (T4) cannot disagree.
 *
 * The rules:
 *  - `test--<address>.<root>` is the test host of the site at `<address>`.
 *  - Any host whose first label starts with `test--` is a test host, wherever
 *    it is. Off the root it names no site, so nothing is served on it, live or
 *    test. That is the fail-closed half of R11: whatever the address table
 *    holds, a `test--` label is never served as a live site.
 *  - `test.<H>` off the root is the test host of the custom domain `<H>`,
 *    unless a VERIFIED Domain row claims the whole host itself (an older
 *    claim, from before `test.` was refused). Only {@link siteHostMode} can
 *    see that row, so {@link classifySiteHost} alone calls it test.
 *  - Everything else is live.
 *
 * The pure half is mirrored in `apps/saroh.app/lib/site-host-mode.ts` (T5),
 * and both spec files pin the same vector, as `site-relay.ts` does.
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
     * site whose release it may show; null when it names none, and then
     * nothing is served on it at all.
     */
    lookup: SiteHostLookup;
}

/** The prefix of a platform test host's first label. */
export const TEST_LABEL_PREFIX = "test--";

/** The first label of a custom domain's test host. */
export const TEST_CUSTOM_LABEL = "test";

/** The longest DNS label (RFC 1035). */
const MAX_LABEL = 63;

/** The longest host name (RFC 1035). */
const MAX_HOST = 253;

/** A host as it is compared: lower-cased, no port, no final dot. */
export function normaliseSiteHost(host: string): string {
    const bare = host.trim().toLowerCase().split(":")[0] ?? "";
    return bare.endsWith(".") ? bare.slice(0, -1) : bare;
}

/**
 * Classify a host by its shape alone (KTD-7). Pure, so the renderer can hold
 * a byte-for-byte copy. `rootDomain` is the renderer's apex: `saroh.app`, or
 * `saroh.app.localhost` in development.
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

/** True when the host is a test host by its shape (see {@link siteHostMode}). */
export function isTestShapedHost(host: string, rootDomain: string): boolean {
    return classifySiteHost(host, rootDomain).mode === "test";
}

/** The renderer's apex this API serves, as {@link classifySiteHost} wants it. */
export function siteRootDomain(): string {
    return rendererHost();
}

/**
 * Classify a host, settling the one case its shape cannot: a `test.<H>` host
 * that a VERIFIED Domain row bound to a site claims as itself is that site's
 * LIVE host, not a test host.
 *
 * Read across every business, outside any organization context, so the
 * answer is the same inside a request and under row-level security.
 */
export async function siteHostMode(
    rawHost: string,
    rootDomain: string = siteRootDomain(),
): Promise<SiteHostClass> {
    const shaped = classifySiteHost(rawHost, rootDomain);
    if (shaped.mode !== "test" || shaped.lookup?.by !== "hostname") {
        return shaped;
    }
    const exact = await outsideOrgContext(() =>
        prisma.domain.findUnique({
            where: { hostname: shaped.host },
            select: { status: true, siteId: true },
        }),
    );
    if (exact?.status === "VERIFIED" && exact.siteId) {
        return {
            host: shaped.host,
            mode: "live",
            lookup: { by: "hostname", hostname: shaped.host },
        };
    }
    return shaped;
}

/** Where one site's test releases are served. */
export interface TestHost {
    host: string;
    /** `test--<address>.<root>`, or `test.<custom domain>`. */
    kind: "platform" | "custom";
}

/**
 * The test hosts of a site (T2 builds release links from these): its
 * platform address first, then each custom hostname the caller says is set
 * up for it (Q4: ops attaches `test.<domain>` by hand, so only the caller
 * knows which are).
 *
 * An address too long for `test--` to fit one DNS label gets no platform test
 * host, and a hostname that would already read as a test host gets none
 * either, so every host returned here classifies as test.
 */
export function testHostsFor(
    site: { subdomain: string | null; customHostnames?: readonly string[] },
    rootDomain: string = siteRootDomain(),
): TestHost[] {
    const root = normaliseSiteHost(rootDomain);
    const hosts: TestHost[] = [];
    const address = site.subdomain?.trim().toLowerCase();
    if (address && root) {
        const label = `${TEST_LABEL_PREFIX}${address}`;
        const host = `${label}.${root}`;
        if (
            label.length <= MAX_LABEL &&
            host.length <= MAX_HOST &&
            !address.includes(".")
        ) {
            hosts.push({ host, kind: "platform" });
        }
    }
    for (const raw of site.customHostnames ?? []) {
        const hostname = normaliseSiteHost(raw);
        if (!hostname) continue;
        const host = `${TEST_CUSTOM_LABEL}.${hostname}`;
        if (host.length > MAX_HOST) continue;
        const shaped = classifySiteHost(host, root);
        if (
            shaped.mode === "test" &&
            shaped.lookup?.by === "hostname" &&
            shaped.lookup.hostname === hostname
        ) {
            hosts.push({ host, kind: "custom" });
        }
    }
    return hosts;
}
