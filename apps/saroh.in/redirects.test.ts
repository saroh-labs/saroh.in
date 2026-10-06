import { describe, expect, it } from "vitest";

import { CRAWL_DISALLOWED, SERVED_PATHS, indexedPaths } from "./lib/site-pages";
import nextConfig from "./next.config.js";
import { REDIRECTS, temporary } from "./redirects.js";

/** The URLs the V1 sitemap listed, and the addresses before it (plan U26). */
const OLD_URLS = [
    "/sell",
    "/website",
    "/bookings",
    "/contacts",
    "/insights",
    "/how-it-works",
    "/coming-soon",
    "/about",
    "/what-it-will-not-do",
    "/modules",
    "/modules/website",
    "/modules/commerce",
    "/modules/appointments",
    "/modules/crm",
    "/modules/insights",
    "/modules/payments",
    "/modules/communications",
    "/modules/automations",
    "/modules/anything-else",
];

/** A rule's source as a regex: `:param` is one path segment, as in Next. */
function matcher(source: string): RegExp {
    const body = source.replace(/:[a-z]+/gi, "[^/]+");
    return new RegExp(`^${body}/?$`);
}

/** Where Next sends a path: the first matching rule, or null. */
function resolve(path: string): string | null {
    const rule = REDIRECTS.find((r) => matcher(r.source).test(path));
    return rule ? rule.destination : null;
}

describe("redirects", () => {
    it("is what next.config.js serves", async () => {
        // The tests run with the switch unset: waitlist mode.
        expect(await nextConfig.redirects?.()).toEqual([
            ...REDIRECTS,
            ...temporary(undefined),
        ]);
    });

    it("sends Pricing to the waitlist until the launch switch opens", () => {
        expect(temporary(undefined)).toEqual([
            { source: "/pricing", destination: "/waitlist", statusCode: 302 },
        ]);
        expect(temporary("waitlist")).toHaveLength(1);
        expect(temporary("open")).toEqual([]);
    });

    it.each(OLD_URLS)("sends %s to a V2 page in one hop", (path) => {
        const to = resolve(path) ?? "(no rule)";
        expect(SERVED_PATHS).toContain(to);
        expect(resolve(to)).toBeNull();
    });

    it("lands /modules/commerce on Orders, not via /sell", () => {
        expect(resolve("/modules/commerce")).toBe("/features/orders");
    });

    it("never chains: no destination is another rule's source", () => {
        for (const r of REDIRECTS) {
            expect(resolve(r.destination)).toBeNull();
        }
    });

    it("never shadows a page the site serves", () => {
        for (const page of SERVED_PATHS) expect(resolve(page)).toBeNull();
    });

    it("is a 301 every time", () => {
        for (const r of REDIRECTS) expect(r.statusCode).toBe(301);
    });
});

describe("indexed pages", () => {
    it("lists Home, 8 features, 3 solutions and the waitlist while it is the ask; Pricing once it opens", () => {
        const waitlist = indexedPaths("waitlist");
        expect(waitlist).toHaveLength(13);
        expect(waitlist).toContain("/waitlist");
        // Pricing waits at the waitlist until launch, and a sitemap never
        // lists a redirect.
        expect(waitlist).not.toContain("/pricing");
        expect(indexedPaths("open")).toContain("/pricing");
        expect(waitlist.filter((p) => p.startsWith("/features/"))).toHaveLength(
            8,
        );
        expect(
            waitlist.filter((p) => p.startsWith("/solutions/")),
        ).toHaveLength(3);
        expect(indexedPaths("open")).not.toContain("/waitlist");
    });

    it("never lists the pricing draft, and robots keeps crawlers out of it", () => {
        for (const p of indexedPaths("waitlist")) {
            expect(p.startsWith("/pricing/")).toBe(false);
        }
        expect(CRAWL_DISALLOWED).toEqual(
            expect.arrayContaining(["/pricing/draft", "/pricing/preview"]),
        );
    });
});
