import { beforeEach, describe, expect, it, vi } from "vitest";

import { generateMetadata } from "./page";

interface Lookup {
    ok: boolean;
    reason?: string;
}

const site = vi.hoisted(() => {
    const state: { resolved: unknown; lookup: Lookup } = {
        resolved: null,
        lookup: { ok: true },
    };
    return state;
});

vi.mock("@/lib/publication", () => ({
    getSiteForHost: vi.fn(() => Promise.resolve(site.resolved)),
    findPageByPath: vi.fn(() => null),
    postsPrefix: vi.fn(() => "blog"),
}));
vi.mock("@/lib/module-pages", () => ({
    isFreePage: vi.fn(() => false),
    moduleLabel: vi.fn(() => "Shop"),
    moduleRoute: vi.fn(() => ({ draw: "builtin" })),
}));
vi.mock("@/lib/catalogue", () => ({
    getCatalogue: vi.fn(() => Promise.resolve(site.lookup)),
}));
vi.mock("@/lib/test-metadata", () => ({
    shareable: vi.fn((_resolved: unknown, metadata: unknown) => metadata),
}));
vi.mock("@/lib/shop-checkout", () => ({ getCheckoutOptions: vi.fn() }));
vi.mock("@/lib/page-cache/site-rules", () => ({
    dontCachePage: vi.fn(),
    listsProducts: vi.fn(),
}));
vi.mock("@/components/published-page", () => ({ PublishedPage: () => null }));
vi.mock("@saroh/site-blocks", () => ({}));
vi.mock("../[slug]/page", () => ({
    default: () => null,
    generateMetadata: vi.fn(),
}));

const params = Promise.resolve({ domain: "northwind.saroh.dev" });

describe("the shop's tab title", () => {
    beforeEach(() => {
        site.resolved = {
            siteId: "site_1",
            modules: [],
            snapshot: { site: { name: "Northwind Supply" }, pages: [] },
        };
        site.lookup = { ok: true };
    });

    it("names the shop when it has something to sell", async () => {
        const metadata = await generateMetadata({ params });
        expect(metadata?.title).toBe("Shop · Northwind Supply");
    });

    it("says the page isn't found when the shop 404s", async () => {
        site.lookup = { ok: false, reason: "missing" };
        const metadata = await generateMetadata({ params });
        expect(metadata?.title).toBe("Page not found · Northwind Supply");
    });

    it("keeps the shop's title while it is only unavailable", async () => {
        site.lookup = { ok: false, reason: "unavailable" };
        const metadata = await generateMetadata({ params });
        expect(metadata?.title).toBe("Shop · Northwind Supply");
    });
});
