import { describe, expect, it } from "vitest";

import { SIGN_UP_URL } from "./lib/links";
import { CRAWL_DISALLOWED, indexedPaths, SERVED_PATHS } from "./lib/site-pages";
import nextConfig from "./next.config.js";
import { launched, REDIRECTS, temporary } from "./redirects.js";

/** The URLs the V1 sitemap listed, and the addresses before it (plan U26). */
const OLD_URLS = [
    "/sell",
    "/website",
    "/bookings",
    "/contacts",
    "/insights",
    "/how-it-works",
    "/coming-soon",
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

    it("keeps the waitlist a page until the launch switch opens, then moves it to sign-up for good", () => {
        expect(launched(undefined)).toEqual([]);
        expect(launched("waitlist")).toEqual([]);
        // Where "Start free" goes (`cta`, lib/links.ts), with no query of
        // its own: Next carries the visitor's over.
        // Given the address the build is given, as next.config.js gives it
        // (read back from `SIGN_UP_URL`): CI sets one, so the unset default
        // is not what the site links to there.
        expect(launched("open", SIGN_UP_URL.replace(/\/signup$/, ""))).toEqual([
            { source: "/waitlist", destination: SIGN_UP_URL, statusCode: 301 },
        ]);
        expect(launched("open")).toEqual([
            {
                source: "/waitlist",
                destination: "https://accounts.saroh.in/signup",
                statusCode: 301,
            },
        ]);
        expect(launched("open", "https://accounts.example.test")).toEqual([
            {
                source: "/waitlist",
                destination: "https://accounts.example.test/signup",
                statusCode: 301,
            },
        ]);
        // Open, nothing sends anyone to the waitlist any more: no chain.
        expect(temporary("open")).toEqual([]);
    });

    it("sends the old Website addresses to the Website page", () => {
        expect(resolve("/website")).toBe("/features/website");
        expect(resolve("/modules/website")).toBe("/features/website");
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

    it("leaves /about to the About page (DEC-137)", () => {
        expect(resolve("/about")).toBeNull();
        expect(SERVED_PATHS).toContain("/about");
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
    it("lists Home, 9 features, 4 solutions, About, Contact, /customers, /llms.txt and the waitlist while it is the ask; Pricing once it opens", () => {
        const waitlist = indexedPaths("waitlist");
        expect(waitlist).toHaveLength(19);
        expect(waitlist).toEqual(
            expect.arrayContaining(["/features/website", "/solutions/salons"]),
        );
        expect(waitlist).toContain("/waitlist");
        expect(waitlist).toContain("/customers");
        // About and Contact are pages in either mode (DEC-137).
        for (const mode of ["waitlist", "open"] as const) {
            expect(indexedPaths(mode)).toEqual(
                expect.arrayContaining(["/about", "/contact"]),
            );
        }
        // Pricing waits at the waitlist until launch, and a sitemap never
        // lists a redirect.
        expect(waitlist).not.toContain("/pricing");
        expect(waitlist).not.toContain("/pricing.md");
        expect(indexedPaths("open")).toContain("/pricing");
        expect(indexedPaths("open")).toContain("/pricing.md");
        expect(waitlist.filter((p) => p.startsWith("/features/"))).toHaveLength(
            9,
        );
        expect(
            waitlist.filter((p) => p.startsWith("/solutions/")),
        ).toHaveLength(4);
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

    it("leaves /welcome open to crawlers, so its noindex can be read", () => {
        expect(CRAWL_DISALLOWED).not.toContain("/welcome");
    });
});
