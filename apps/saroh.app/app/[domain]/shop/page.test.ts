import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ModulePages from "@/lib/module-pages";

import { generateMetadata } from "./page";

interface Lookup {
    ok: boolean;
    reason?: string;
    data?: { products: { name: string }[] };
}

const site = vi.hoisted(() => {
    const state: { resolved: unknown; lookup: Lookup; draw: string } = {
        resolved: null,
        lookup: { ok: true },
        draw: "builtin",
    };
    return state;
});

vi.mock("@/lib/publication", () => ({
    getSiteForHost: vi.fn(() => Promise.resolve(site.resolved)),
    findPageByPath: vi.fn(() => null),
    postsPrefix: vi.fn(() => "blog"),
}));
vi.mock("@/lib/module-pages", async (importOriginal) => ({
    // The rule that keeps an empty page out of search is the real one.
    ...(await importOriginal<typeof ModulePages>()),
    findModulePage: vi.fn(() => null),
    isFreePage: vi.fn(() => false),
    moduleLabel: vi.fn(() => "Shop"),
    moduleRoute: vi.fn(() => ({ draw: site.draw })),
}));
vi.mock("@/lib/site-contact", () => ({ getSiteContact: vi.fn() }));
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
vi.mock("@saroh/site-blocks", () => ({ modulePageTopOf: () => null }));
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
        site.lookup = { ok: true, data: { products: [{ name: "Crates" }] } };
        site.draw = "builtin";
    });

    it("names the shop when it has something to sell", async () => {
        const metadata = await generateMetadata({ params });
        expect(metadata?.title).toBe("Shop · Northwind Supply");
    });

    it("describes the shop by what it sells, and names its one address on the site's own domain", async () => {
        site.resolved = {
            siteId: "site_1",
            modules: [],
            primaryHost: "www.northwind.example",
            snapshot: { site: { name: "Northwind Supply" }, pages: [] },
        };
        site.lookup = {
            ok: true,
            data: { products: [{ name: "Crates" }, { name: "Pallets" }] },
        };
        const metadata = await generateMetadata({ params });
        expect(metadata?.description).toBe(
            "Shop Crates and Pallets from Northwind Supply online.",
        );
        expect(metadata?.alternates?.canonical).toBe(
            "https://www.northwind.example/shop",
        );
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

describe("a shop with nothing to show is kept out of search", () => {
    beforeEach(() => {
        site.resolved = {
            siteId: "site_1",
            modules: [],
            snapshot: { site: { name: "Northwind Supply" }, pages: [] },
        };
        site.lookup = { ok: true, data: { products: [{ name: "Crates" }] } };
        site.draw = "builtin";
    });

    const NOT_FOR_SEARCH = { index: false, follow: true };

    it("leaves a shop with something to sell to be indexed", async () => {
        const metadata = await generateMetadata({ params });
        expect(metadata?.robots).toBeUndefined();
    });

    it("says noindex while the shop's read fails, and changes nothing else", async () => {
        site.lookup = { ok: false, reason: "unavailable" };
        const metadata = await generateMetadata({ params });
        expect(metadata?.robots).toEqual(NOT_FOR_SEARCH);
        expect(metadata?.title).toBe("Shop · Northwind Supply");
        expect(metadata?.openGraph).toMatchObject({ url: "/shop" });
    });

    it("says noindex for a shop with nothing on sale", async () => {
        site.lookup = { ok: true, data: { products: [] } };
        const metadata = await generateMetadata({ params });
        expect(metadata?.robots).toEqual(NOT_FOR_SEARCH);
    });

    it("says noindex while the Shop page is taken off the site", async () => {
        site.draw = "unavailable";
        const metadata = await generateMetadata({ params });
        expect(metadata?.robots).toEqual(NOT_FOR_SEARCH);
    });

    it("leaves a published Shop page to be indexed whatever the catalogue says", async () => {
        site.draw = "page";
        site.lookup = { ok: false, reason: "unavailable" };
        const metadata = await generateMetadata({ params });
        expect(metadata?.robots).toBeUndefined();
    });
});
