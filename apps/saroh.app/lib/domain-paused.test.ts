import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
    env: {
        API_URL: "https://api.test",
        NEXT_PUBLIC_ROOT_DOMAIN: "saroh.app",
    },
}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));

import {
    DOMAIN_PAUSED_REASON,
    pausedOriginOf,
    pausedTestOrigin,
} from "./domain-paused";
import { getDomainPausedTo, getSiteForHost } from "./publication";

/**
 * A domain its plan has paused (DEC-139): its host shows nothing, names the
 * site's Saroh address, and never shows another site instead. Every host
 * is made up.
 */

const paused = (to: unknown) => ({
    error: {
        statusCode: 404,
        message: "This domain isn't showing a site right now",
        details: { reason: DOMAIN_PAUSED_REASON, to },
    },
});

/** Answers by the API path asked for; anything else is a 404. */
function api(routes: Record<string, { status: number; body: unknown }>) {
    const fetch = vi.fn((input: string) => {
        const path = input.replace("https://api.test/public/sites/", "");
        const hit = routes[path] ?? { status: 404, body: { error: {} } };
        return Promise.resolve(
            new Response(JSON.stringify(hit.body), {
                status: hit.status,
                headers: { "content-type": "application/json" },
            }),
        );
    });
    vi.stubGlobal("fetch", fetch);
    return fetch;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("pausedOriginOf", () => {
    const body = paused("https://yourshop.saroh.app");

    it("is the site's Saroh address, as an origin", () => {
        expect(pausedOriginOf(body, "shop.example.com", "saroh.app")).toBe(
            "https://yourshop.saroh.app",
        );
        // A path on the answer is not part of where the host sends anyone.
        expect(
            pausedOriginOf(
                paused("https://yourshop.saroh.app/elsewhere?x=1"),
                "shop.example.com",
                "saroh.app",
            ),
        ).toBe("https://yourshop.saroh.app");
    });

    it("is null for any 404 that doesn't say the domain is paused", () => {
        for (const not of [
            null,
            {},
            { error: {} },
            {
                error: {
                    details: { reason: "revoked", to: "https://a.saroh.app" },
                },
            },
            { error: { details: ["hostname must be a domain"] } },
            paused(42),
            paused(undefined),
        ]) {
            expect(
                pausedOriginOf(not, "shop.example.com", "saroh.app"),
            ).toBeNull();
        }
    });

    it("believes only a Saroh address: never another site, a script or a deeper name", () => {
        for (const to of [
            "https://evil.example.com",
            "https://saroh.app",
            "https://saroh.app.evil.example.com",
            "https://a.b.saroh.app",
            "javascript:alert(1)",
            "ftp://yourshop.saroh.app",
            "not a url",
        ]) {
            expect(
                pausedOriginOf(paused(to), "shop.example.com", "saroh.app"),
            ).toBeNull();
        }
    });

    it("never sends a host to itself", () => {
        expect(
            pausedOriginOf(body, "yourshop.saroh.app", "saroh.app"),
        ).toBeNull();
    });
});

describe("pausedTestOrigin", () => {
    it("is the Saroh address's own test host", () => {
        expect(
            pausedTestOrigin("https://yourshop.saroh.app", "saroh.app"),
        ).toBe("https://test--yourshop.saroh.app");
    });

    it("is the address itself when it is too long to have a test host", () => {
        const long = `https://${"a".repeat(60)}.saroh.app`;
        expect(pausedTestOrigin(long, "saroh.app")).toBe(long);
    });
});

describe("a paused domain's host", () => {
    it("shows no site, and never the site that holds its first label as an address", async () => {
        const fetch = api({
            "by-hostname/shop.example.com": {
                status: 404,
                body: paused("https://yourshop.saroh.app"),
            },
            // Another business's site, at `shop.saroh.app`.
            "by-subdomain/shop": {
                status: 200,
                body: {
                    snapshot: { site: { name: "Someone else" }, pages: [] },
                },
            },
        });
        await expect(getSiteForHost("shop.example.com")).resolves.toBeNull();
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("names where its visitors go", async () => {
        const fetch = api({
            "by-hostname/shop.example.com": {
                status: 404,
                body: paused("https://yourshop.saroh.app"),
            },
        });
        await expect(getDomainPausedTo("Shop.Example.com:443")).resolves.toBe(
            "https://yourshop.saroh.app",
        );
        const [url, init] = fetch.mock.calls[0] as unknown as [
            string,
            RequestInit,
        ];
        expect(url).toBe(
            "https://api.test/public/sites/by-hostname/shop.example.com",
        );
        // Read fresh every time: the domain is back the moment its plan is.
        expect(init.cache).toBe("no-store");
    });

    it("sends its test host on to the Saroh address's test host", async () => {
        const fetch = api({
            "by-hostname/shop.example.com": {
                status: 404,
                body: paused("https://yourshop.saroh.app"),
            },
        });
        await expect(getDomainPausedTo("test.shop.example.com")).resolves.toBe(
            "https://test--yourshop.saroh.app",
        );
        // Asked about the domain itself, not its test host.
        expect(fetch.mock.calls[0]?.[0]).toBe(
            "https://api.test/public/sites/by-hostname/shop.example.com",
        );
    });

    it("is not paused when its host serves, 404s plainly, or the API is down", async () => {
        api({
            "by-hostname/shop.example.com": {
                status: 200,
                body: { snapshot: { site: { name: "Yours" }, pages: [] } },
            },
        });
        await expect(getDomainPausedTo("shop.example.com")).resolves.toBeNull();
        expect(
            (await getSiteForHost("shop.example.com"))?.snapshot.site.name,
        ).toBe("Yours");

        api({});
        await expect(getDomainPausedTo("shop.example.com")).resolves.toBeNull();

        api({
            "by-hostname/shop.example.com": { status: 500, body: {} },
        });
        await expect(getDomainPausedTo("shop.example.com")).resolves.toBeNull();

        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.reject(new Error("ECONNREFUSED"))),
        );
        await expect(getDomainPausedTo("shop.example.com")).resolves.toBeNull();
    });

    it("never asks about a Saroh address, which is never paused", async () => {
        const fetch = api({});
        await expect(
            getDomainPausedTo("yourshop.saroh.app"),
        ).resolves.toBeNull();
        await expect(
            getDomainPausedTo("test--yourshop.saroh.app"),
        ).resolves.toBeNull();
        await expect(getDomainPausedTo("saroh.app")).resolves.toBeNull();
        await expect(getDomainPausedTo(null)).resolves.toBeNull();
        expect(fetch).not.toHaveBeenCalled();
    });

    it("leaves the Saroh address serving the site as before", async () => {
        const fetch = api({
            "by-subdomain/yourshop": {
                status: 200,
                body: {
                    snapshot: { site: { name: "Yours" }, pages: [] },
                    siteId: "site_1",
                    // The API names the Saroh address as primary while paused.
                    primaryHost: "yourshop.saroh.app",
                },
            },
        });
        const site = await getSiteForHost("yourshop.saroh.app");
        expect(site).toMatchObject({
            siteId: "site_1",
            mode: "live",
            primaryHost: "yourshop.saroh.app",
        });
        expect(fetch).toHaveBeenCalledTimes(1);
    });
});
