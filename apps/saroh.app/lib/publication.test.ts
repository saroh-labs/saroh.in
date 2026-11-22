import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
    env: {
        API_URL: "https://api.test",
        NEXT_PUBLIC_ROOT_DOMAIN: "saroh.app",
    },
}));

import {
    findRedirect,
    getMovedTo,
    movedAddressOf,
    pageHead,
    withQuery,
} from "./publication";

/**
 * An old web address that forwards (DEC-069, L3). The layout asks only on
 * a miss; anything but a good answer is null, and the page then 404s as it
 * always did.
 */

function answer(status: number, body: unknown) {
    const fetch = vi.fn(() =>
        Promise.resolve(
            new Response(JSON.stringify(body), {
                status,
                headers: { "content-type": "application/json" },
            }),
        ),
    );
    vi.stubGlobal("fetch", fetch);
    return fetch;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("movedAddressOf", () => {
    it("is the platform address a host names", () => {
        expect(movedAddressOf("rye.saroh.app")).toBe("rye");
        expect(movedAddressOf("Rye.Saroh.App:3005")).toBe("rye");
    });

    it("is null for a custom hostname, the apex, www and deeper names", () => {
        expect(movedAddressOf("shop.rye.in")).toBeNull();
        expect(movedAddressOf("saroh.app")).toBeNull();
        expect(movedAddressOf("www.saroh.app")).toBeNull();
        expect(movedAddressOf("a.rye.saroh.app")).toBeNull();
        expect(movedAddressOf(null)).toBeNull();
    });

    it("is null for a test host, which names a release, not an old address", () => {
        expect(movedAddressOf("test--rye.saroh.app")).toBeNull();
        expect(movedAddressOf("TEST--Rye.saroh.app:3005")).toBeNull();
    });
});

describe("getMovedTo", () => {
    it("asks the API for the address and returns the new origin", async () => {
        const fetch = answer(200, { to: "https://rye-bakery.saroh.app" });
        await expect(getMovedTo("rye.saroh.app", "signed")).resolves.toBe(
            "https://rye-bakery.saroh.app",
        );
        const [url, init] = fetch.mock.calls[0] as unknown as [
            string,
            RequestInit & { headers: Record<string, string> },
        ];
        expect(url).toBe("https://api.test/public/sites/moved/rye");
        expect(init.cache).toBe("no-store");
        expect(init.headers["x-saroh-relay"]).toBe("signed");
    });

    it("is null on a 404, and the page 404s as today", async () => {
        answer(404, { message: "This address hasn't moved" });
        await expect(getMovedTo("rye.saroh.app")).resolves.toBeNull();
    });

    it("is null on an API error, and never throws", async () => {
        answer(500, {});
        await expect(getMovedTo("rye.saroh.app")).resolves.toBeNull();
        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.reject(new Error("ECONNREFUSED"))),
        );
        await expect(getMovedTo("rye.saroh.app")).resolves.toBeNull();
    });

    it("is null for an answer that isn't an http(s) origin elsewhere", async () => {
        answer(200, { to: "javascript:alert(1)" });
        await expect(getMovedTo("rye.saroh.app")).resolves.toBeNull();
        answer(200, { to: 42 });
        await expect(getMovedTo("rye.saroh.app")).resolves.toBeNull();
        // Never a hop to the host the visitor is already on.
        answer(200, { to: "https://rye.saroh.app" });
        await expect(getMovedTo("rye.saroh.app")).resolves.toBeNull();
    });

    it("never asks for a test host", async () => {
        const fetch = answer(200, { to: "https://rye-bakery.saroh.app" });
        await expect(getMovedTo("test--rye.saroh.app")).resolves.toBeNull();
        expect(fetch).not.toHaveBeenCalled();
    });

    it("never asks for a custom hostname", async () => {
        const fetch = answer(200, { to: "https://rye-bakery.saroh.app" });
        await expect(getMovedTo("shop.rye.in")).resolves.toBeNull();
        expect(fetch).not.toHaveBeenCalled();
    });
});

describe("a site's primary host", () => {
    it("is a bare host name, lower-cased, or nothing", async () => {
        const { hostOrNull, siteOriginFor } = await import("./publication");
        expect(hostOrNull("WWW.RyeBakery.in")).toBe("www.ryebakery.in");
        expect(hostOrNull("rye.saroh.app.localhost")).toBe(
            "rye.saroh.app.localhost",
        );
        for (const not of [
            null,
            undefined,
            7,
            "",
            "localhost",
            "https://ryebakery.in",
            "ryebakery.in/shop",
            "rye bakery.in",
            "-rye.in",
            "rye.in:3000",
        ]) {
            expect(hostOrNull(not)).toBeNull();
        }
        expect(
            siteOriginFor({ primaryHost: "www.ryebakery.in" }, "rye.saroh.app"),
        ).toBe("https://www.ryebakery.in");
        expect(siteOriginFor({ primaryHost: null }, "rye.saroh.app")).toBe(
            "https://rye.saroh.app",
        );
        expect(siteOriginFor(null, "rye.saroh.app")).toBe(
            "https://rye.saroh.app",
        );
    });
});

describe("findRedirect (KTD-3)", () => {
    const snapshot = {
        site: { name: "Rye", slug: "rye" },
        pages: [
            { path: "/", title: null, isHome: true, sections: [] },
            { path: "/bridal", title: "Bridal", isHome: false, sections: [] },
        ],
        redirects: [
            { from: "/services/bridal-makeup-packages", to: "/bridal" },
            { from: "/bridal", to: "/" },
            { from: "/away", to: "//evil.com" },
            { from: "/full", to: "https://evil.com/x" },
            { from: "/self", to: "/self/" },
        ],
        publishedAt: "2026-11-18T00:00:00.000Z",
    };

    it("names where an old link now lives, trailing slash or not", () => {
        expect(findRedirect(snapshot, "/services/bridal-makeup-packages")).toBe(
            "/bridal",
        );
        expect(
            findRedirect(snapshot, "/services/bridal-makeup-packages/"),
        ).toBe("/bridal");
    });

    it("lets a live page win over a forward at the same link", () => {
        expect(findRedirect(snapshot, "/bridal")).toBeNull();
    });

    it("never leaves the site or loops on itself", () => {
        expect(findRedirect(snapshot, "/away")).toBeNull();
        expect(findRedirect(snapshot, "/full")).toBeNull();
        expect(findRedirect(snapshot, "/self")).toBeNull();
    });

    it("is null for a snapshot from before forwards, as a 404 was", () => {
        const { redirects: _none, ...old } = snapshot;
        expect(
            findRedirect(old, "/services/bridal-makeup-packages"),
        ).toBeNull();
    });
});

describe("withQuery", () => {
    it("keeps the query a visitor asked with", () => {
        expect(withQuery("/bridal", { ref: "ig", tag: ["a", "b"] })).toBe(
            "/bridal?ref=ig&tag=a&tag=b",
        );
        expect(withQuery("/bridal", {})).toBe("/bridal");
    });
});

describe("pageHead (KTD-7)", () => {
    const site = {
        name: "Rye",
        slug: "rye",
        seoDescription: "Bread, daily.",
        socialImageUrl: "https://img.test/site.jpg",
    };
    const page = {
        path: "/about",
        title: "About",
        isHome: false,
        sections: [],
    };

    it("falls back to the site's text and picture", () => {
        expect(pageHead(page, site)).toEqual({
            title: undefined,
            description: "Bread, daily.",
            images: ["https://img.test/site.jpg"],
            robots: undefined,
        });
    });

    it("uses the page's own, and keeps it off Google when asked", () => {
        expect(
            pageHead(
                {
                    ...page,
                    seoTitle: "About our bakery",
                    seoDescription: "Since 1990.",
                    shareImageUrl: "https://img.test/about.jpg",
                    noindex: true,
                },
                site,
            ),
        ).toEqual({
            title: "About our bakery",
            description: "Since 1990.",
            images: ["https://img.test/about.jpg"],
            robots: { index: false, follow: true },
        });
    });
});
