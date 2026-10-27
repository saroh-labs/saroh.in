import { describe, expect, it } from "vitest";

import { SOLUTION_SLUGS as SITE_SOLUTION_SLUGS } from "./content/types";
import { SIGN_UP_URL } from "./lib/links";
import { CRAWL_DISALLOWED, indexedPaths, SERVED_PATHS } from "./lib/site-pages";
import nextConfig from "./next.config.js";
import {
    FAMILY_PAGE,
    launched,
    REDIRECTS,
    searchRedirects,
    SOLUTION_SLUGS,
    temporary,
} from "./redirects.js";
import { familyOf, loadPublishList } from "./search-pages.config.js";

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
            ...searchRedirects(loadPublishList(), familyOf),
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

describe("search page redirects (DEC-193)", () => {
    /** Families as the content says; "gyms" and "shops" are not in this stub's code. */
    const FAMILIES: Record<string, string> = {
        salons: "Beauty",
        clinics: "Health",
        "dental-clinics": "Health",
        "nail-studios": "Beauty",
        "yoga-studios": "Fitness and classes",
        "music-classes": "Learning",
    };
    const family = (slug: string) => FAMILIES[slug] ?? null;
    const list = (
        live: string[],
        takenOff: string[] = [],
        preview = false,
    ) => ({
        preview,
        live,
        takenOff: takenOff.map((path) => ({ path, at: "2026-10-25" })),
    });

    it("keeps the four solution slugs the site's", () => {
        expect(SOLUTION_SLUGS).toEqual([...SITE_SOLUTION_SLUGS]);
        expect(Object.values(FAMILY_PAGE).sort()).toEqual(
            [...SITE_SOLUTION_SLUGS].sort(),
        );
    });

    it("makes none without a list", () => {
        expect(searchRedirects(null, family)).toEqual([]);
    });

    it("moves /solutions/<x> for good only once /for/<x> is live and in the code", () => {
        expect(searchRedirects(list(["/for/salons"]), family)).toEqual([
            {
                source: "/solutions/salons",
                destination: "/for/salons",
                statusCode: 301,
            },
        ]);
        // Live in the API, but no file for it in this commit: no redirect.
        expect(searchRedirects(list(["/for/gyms"]), family)).toEqual([]);
        // A /for/ page that isn't a solution moves nothing.
        expect(searchRedirects(list(["/for/dental-clinics"]), family)).toEqual(
            [],
        );
    });

    it("sends a page taken off to its live family page, else Home, for now (302)", () => {
        const rules = searchRedirects(
            list(
                ["/for/salons"],
                [
                    "/for/nail-studios",
                    "/for/dental-clinics",
                    "/for/music-classes",
                    "/for/yoga-studios",
                ],
            ),
            family,
        );
        const to = Object.fromEntries(
            rules.map((r) => [r.source, [r.destination, r.statusCode]]),
        );
        expect(to).toEqual({
            "/solutions/salons": ["/for/salons", 301],
            "/for/nail-studios": ["/for/salons", 302],
            // Clinics isn't live: Home.
            "/for/dental-clinics": ["/", 302],
            // Learning has no family page.
            "/for/music-classes": ["/", 302],
            "/for/yoga-studios": ["/", 302],
        });
    });

    it("never chains, and a family page taken off goes Home", () => {
        const rules = searchRedirects(
            list(
                ["/for/clinics"],
                ["/for/salons", "/for/nail-studios", "/for/dental-clinics"],
            ),
            family,
        );
        const sources = new Set(rules.map((r) => r.source));
        for (const r of rules) expect(sources.has(r.destination)).toBe(false);
        expect(rules.find((r) => r.source === "/for/salons")?.destination).toBe(
            "/",
        );
        expect(
            rules.find((r) => r.source === "/for/dental-clinics")?.destination,
        ).toBe("/for/clinics");
        // Nothing here shadows a fixed rule or a page the site serves.
        for (const r of rules) {
            expect(resolve(r.source)).toBeNull();
            expect(resolve(r.destination)).toBeNull();
        }
    });

    it("leaves taken-off pages alone on a preview, which still builds them as drafts", () => {
        expect(
            searchRedirects(
                list(["/for/salons"], ["/for/nail-studios"], true),
                family,
            ),
        ).toEqual([
            {
                source: "/solutions/salons",
                destination: "/for/salons",
                statusCode: 301,
            },
        ]);
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
