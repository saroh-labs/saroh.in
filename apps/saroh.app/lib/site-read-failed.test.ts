import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const render = vi.hoisted(() => ({
    memo: new Map<unknown, Map<string, unknown>>(),
}));

vi.mock("@/env", () => ({
    env: {
        API_URL: "https://api.test",
        NEXT_PUBLIC_ROOT_DOMAIN: "saroh.app",
    },
}));
vi.mock("next/headers", () => ({
    headers: () => Promise.resolve(new Headers()),
}));
vi.mock("@/lib/page-cache/site-rules", () => ({
    dontCachePage: vi.fn(),
    listsProducts: vi.fn(),
}));
/*
 * One render, as the server's `cache` gives one: outside a render the real
 * one calls straight through, so a test on it would pass with or without the
 * wrapper. This keeps React's rule (one answer per function and arguments,
 * for primitives; an object is a new key each time, which it refuses here).
 * `render.memo.clear()` is the next render.
 */
vi.mock("react", async (original) => ({
    ...(await original<typeof React>()),
    cache:
        (make: (...args: unknown[]) => unknown) =>
        (...args: unknown[]) => {
            if (args.some((a) => typeof a === "object" && a !== null)) {
                throw new Error("cache() never hits on an object argument");
            }
            const seen = render.memo.get(make) ?? new Map<string, unknown>();
            render.memo.set(make, seen);
            const key = JSON.stringify(args);
            if (!seen.has(key)) seen.set(key, make(...args));
            return seen.get(key);
        },
}));

import {
    getDomainPausedTo,
    getMovedTo,
    getPreviewByToken,
    getPreviewPosts,
    getPublicationForHost,
    getPublishedPost,
    getSiteForHost,
    getSiteForPage,
    readPublishedPosts,
    siteReadFailed,
    subdomainFromHost,
} from "./publication";
import { getPublicPacks } from "./site-packs";
import { getPublicPlans } from "./site-plans";
import { getProductGridFeeds } from "./site-product-grids";

const SITE = (name: string) => ({
    snapshot: { site: { name, slug: name }, pages: [] },
    siteId: `site_${name}`,
});
const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });

/** Answers by the API path asked for; anything else is a 404. */
function api(routes: Record<string, () => Response | Promise<Response>>) {
    const fetched = vi.fn((input: string) => {
        const answer = Object.entries(routes).find(
            ([route]) => input === `https://api.test/public/sites/${route}`,
        )?.[1];
        return Promise.resolve(answer ? answer() : json({ error: {} }, 404));
    });
    vi.stubGlobal("fetch", fetched);
    return fetched;
}
const offline = () => Promise.reject(new Error("aborted"));
const askedFor = (fetched: ReturnType<typeof api>) =>
    fetched.mock.calls.map(([url]) =>
        url.replace("https://api.test/public/sites/", ""),
    );

beforeEach(() => {
    vi.unstubAllGlobals();
    render.memo.clear();
});

describe("asking whether a host's read failed, after its read", () => {
    it("answers 404 with no failure, asking a custom domain by hostname alone", async () => {
        const fetched = api({});
        await expect(siteReadFailed("shop.example.com")).resolves.toBe(false);
        expect(askedFor(fetched)).toEqual(["by-hostname/shop.example.com"]);
    });

    it("asks a Saroh address by its address", async () => {
        const fetched = api({});
        await expect(siteReadFailed("rye.saroh.app")).resolves.toBe(false);
        expect(askedFor(fetched)).toEqual(["by-subdomain/rye"]);
    });

    it("doesn't read again once this request's site read has failed", async () => {
        const fetched = api({ "by-subdomain/rye": () => json({}, 500) });
        await getSiteForHost("rye.saroh.app");
        fetched.mockClear();
        await expect(siteReadFailed("rye.saroh.app")).resolves.toBe(true);
        expect(fetched).not.toHaveBeenCalled();
    });
});

describe("one request, one answer", () => {
    it("reads a site once for the metadata, the layout and the page", async () => {
        const fetched = api({ "by-subdomain/rye": () => json(SITE("rye")) });
        await getSiteForHost("rye.saroh.app");
        await getSiteForHost("rye.saroh.app");
        await getSiteForPage("rye.saroh.app");
        expect(fetched).toHaveBeenCalledTimes(1);
    });

    it("is one read whichever spelling of the host asks: not-found has the Host header", async () => {
        const fetched = api({ "by-subdomain/rye": () => json(SITE("rye")) });
        await getSiteForHost("rye.saroh.app");
        await getSiteForHost("Rye.Saroh.App:443");
        expect(fetched).toHaveBeenCalledTimes(1);
    });

    it("can't turn the layout's good read into the page's notFound on a blip", async () => {
        let up = true;
        api({
            "by-subdomain/rye": () =>
                up ? json(SITE("rye")) : Promise.reject(new Error("aborted")),
        });
        const layout = await getSiteForHost("rye.saroh.app");
        up = false;
        const page = await getSiteForPage("rye.saroh.app");
        expect(page).toBe(layout);
        expect(page?.snapshot.site.name).toBe("rye");
    });

    it("is one read of a paused domain for the site read and the paused check", async () => {
        const fetched = api({
            "by-hostname/shop.example.com": () =>
                json(
                    {
                        error: {
                            details: {
                                reason: "domain-paused",
                                to: "https://yourshop.saroh.app",
                            },
                        },
                    },
                    404,
                ),
        });
        await expect(getSiteForHost("shop.example.com")).resolves.toBeNull();
        await expect(getDomainPausedTo("shop.example.com")).resolves.toBe(
            "https://yourshop.saroh.app",
        );
        expect(fetched).toHaveBeenCalledTimes(1);
    });

    it("reads again on the next request", async () => {
        const fetched = api({ "by-subdomain/rye": () => json(SITE("rye")) });
        await getSiteForHost("rye.saroh.app");
        render.memo.clear();
        await getSiteForHost("rye.saroh.app");
        expect(fetched).toHaveBeenCalledTimes(2);
    });

    it.each<[string, () => Promise<unknown>]>([
        ["plans", () => getPublicPlans("site_1")],
        ["class packs", () => getPublicPacks("site_1")],
        [
            "a Product grid's products",
            () =>
                getProductGridFeeds(
                    [{ type: "productGrid", content: {} }],
                    "site_1",
                ),
        ],
        ["the posts", () => readPublishedPosts("site_1")],
        ["a post", () => getPublishedPost("site_1", "a").catch(() => null)],
        ["an old address", () => getMovedTo("rye.saroh.app", "relay")],
        ["a preview", () => getPreviewByToken("tok").catch(() => null)],
        ["a preview's posts", () => getPreviewPosts("tok")],
    ])("spends one read of the visitor's limit on %s", async (_name, read) => {
        const fetched = vi.fn(() => Promise.resolve(json({}, 500)));
        vi.stubGlobal("fetch", fetched);
        await read();
        await read();
        expect(fetched).toHaveBeenCalledTimes(1);
    });
});

describe("a page whose site read failed", () => {
    it.each<[string, () => Response | Promise<Response>]>([
        ["no answer", offline],
        ["a 500", () => json({}, 500)],
        ["a 429", () => json({}, 429)],
        ["a body that isn't a site", () => json({ nope: true })],
    ])(
        "throws to the error page on %s, never notFound",
        async (_name, answer) => {
            api({ "by-subdomain/rye": answer });
            await expect(getSiteForPage("rye.saroh.app")).rejects.toThrow(
                "Site read failed",
            );
            render.memo.clear();
            api({ "by-hostname/shop.client.com": answer });
            await expect(getSiteForPage("shop.client.com")).rejects.toThrow(
                "Site read failed",
            );
            render.memo.clear();
            api({ "by-hostname/shop.client.com": answer });
            await expect(
                getPublicationForHost("shop.client.com"),
            ).rejects.toThrow("Site read failed");
        },
    );

    it("is null only when the API said nothing is here", async () => {
        api({});
        await expect(getSiteForPage("rye.saroh.app")).resolves.toBeNull();
        await expect(getSiteForPage("shop.client.com")).resolves.toBeNull();
    });

    it("doesn't ask on a test host, whose release says why itself", async () => {
        const fetched = api({});
        await expect(getSiteForPage("test--rye.saroh.app")).resolves.toBeNull();
        expect(fetched).not.toHaveBeenCalled();
    });

    /** A new page can't go back to reading the site and calling notFound. */
    it("is how every page under the site reads it", () => {
        const app = path.join(__dirname, "../app/[domain]");
        const direct = /await getSiteForHost\(\w+\);[\s\S]{0,40}?notFound\(\)/;
        expect(
            direct.test(
                "const resolved = await getSiteForHost(domain);\n\n    if (!resolved) {\n        notFound();",
            ),
        ).toBe(true);
        const pages = readdirSync(app, { recursive: true, encoding: "utf8" })
            .filter((file) => /(^|\/)(page|layout)\.tsx$/.test(file))
            .filter((file) =>
                direct.test(readFileSync(path.join(app, file), "utf8")),
            );
        expect(pages).toEqual([]);
    });
});

describe("a merchant's own domain", () => {
    const THE_OTHER_MERCHANT = {
        "by-subdomain/shop": () => json(SITE("someone-else")),
    };

    it.each<[string, () => Response | Promise<Response>]>([
        ["a 404", () => json({ error: {} }, 404)],
        ["a 500", () => json({}, 500)],
        ["no answer", offline],
        ["a body that isn't a site", () => json({ nope: true })],
    ])(
        "never draws the merchant at its first label on %s",
        async (_name, answer) => {
            const fetched = api({
                ...THE_OTHER_MERCHANT,
                "by-hostname/shop.client.com": answer,
            });
            await expect(getSiteForHost("shop.client.com")).resolves.toBeNull();
            expect(askedFor(fetched)).toEqual(["by-hostname/shop.client.com"]);
        },
    );

    it("isn't called failed for the merchant at its first label", async () => {
        const fetched = api(THE_OTHER_MERCHANT);
        await expect(siteReadFailed("shop.client.com")).resolves.toBe(false);
        expect(askedFor(fetched)).toEqual(["by-hostname/shop.client.com"]);
    });

    it("stays failed when its read failed, for the error page", async () => {
        api({
            ...THE_OTHER_MERCHANT,
            "by-hostname/shop.client.com": () => json({}, 500),
        });
        await expect(getSiteForHost("shop.client.com")).resolves.toBeNull();
        await expect(siteReadFailed("shop.client.com")).resolves.toBe(true);
    });

    it("draws its own site", async () => {
        api({
            ...THE_OTHER_MERCHANT,
            "by-hostname/shop.client.com": () => json(SITE("mine")),
        });
        const site = await getSiteForHost("Shop.Client.com:443");
        expect(site?.snapshot.site.name).toBe("mine");
    });

    it("has no subdomain; addresses under the root keep theirs", () => {
        expect(subdomainFromHost("shop.client.com")).toBeNull();
        expect(subdomainFromHost("saroh.app")).toBeNull();
        expect(subdomainFromHost("rye.saroh.app")).toBe("rye");
        expect(subdomainFromHost("RYE.saroh.app:3005")).toBe("rye");
        expect(subdomainFromHost("a.rye.saroh.app")).toBe("a");
        expect(subdomainFromHost("www.saroh.app")).toBeNull();
    });
});
