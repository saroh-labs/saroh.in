import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ModulePages from "@/lib/module-pages";

import { PublishedPage } from "@/components/published-page";
import { getCatalogue } from "@/lib/catalogue";
import { dontCachePage } from "@/lib/page-cache/site-rules";
import { getProductGridFeeds } from "@/lib/site-product-grids";
import { ShopListing, ShopUnavailable } from "@saroh/site-blocks";

import ShopPage, { generateMetadata } from "./page";

interface Lookup {
    ok: boolean;
    reason?: string;
    data?: { products: { name: string }[] };
}

interface Drawn {
    type: unknown;
    props: Record<string, unknown>;
}

const site = vi.hoisted(() => {
    const state: {
        resolved: unknown;
        lookup: Lookup;
        draw: string;
        page: unknown;
        feeds: unknown;
    } = {
        resolved: null,
        lookup: { ok: true },
        draw: "builtin",
        page: null,
        feeds: undefined,
    };
    return state;
});

vi.mock("@/lib/publication", () => ({
    getSiteForHost: vi.fn(() => Promise.resolve(site.resolved)),
    getSiteForPage: vi.fn(() => Promise.resolve(site.resolved)),
    findPageByPath: vi.fn(() => null),
    postsPrefix: vi.fn(() => "blog"),
}));
vi.mock("@/lib/module-pages", async (importOriginal) => ({
    // The rule that keeps an empty page out of search is the real one.
    ...(await importOriginal<typeof ModulePages>()),
    findModulePage: vi.fn(() => null),
    isFreePage: vi.fn(() => false),
    moduleLabel: vi.fn(() => "Shop"),
    // A deep link (`?all=1`) goes past a Shop page, as the real one does.
    moduleRoute: vi.fn(
        (_pages: unknown, _modules: unknown, _kind: unknown, deep?: boolean) =>
            deep ? { draw: "builtin" } : { draw: site.draw, page: site.page },
    ),
}));
vi.mock("@/lib/site-contact", () => ({ getSiteContact: vi.fn() }));
vi.mock("@/lib/site-product-grids", () => ({
    getProductGridFeeds: vi.fn(() => Promise.resolve(site.feeds)),
}));
vi.mock("@/lib/api-url", () => ({ publicApiUrl: () => "https://api.test" }));
vi.mock("@/lib/catalogue", () => ({
    getCatalogue: vi.fn(() => Promise.resolve(site.lookup)),
}));
vi.mock("@/lib/test-metadata", () => ({
    shareable: vi.fn((_resolved: unknown, metadata: unknown) => metadata),
}));
vi.mock("@/lib/shop-checkout", () => ({ getCheckoutOptions: vi.fn() }));
vi.mock("@/lib/shop-checkout-shape", () => ({
    enquiryPagePath: vi.fn(() => null),
}));
vi.mock("@/lib/page-cache/site-rules", () => ({
    dontCachePage: vi.fn(),
    listsProducts: vi.fn(),
}));
vi.mock("@/components/published-page", () => ({ PublishedPage: vi.fn() }));
vi.mock("@saroh/site-blocks", () => ({
    LookShopListing: vi.fn(),
    ModulePageUnavailable: vi.fn(),
    NotTakingOrders: vi.fn(),
    ShopListing: vi.fn(),
    ShopUnavailable: vi.fn(),
    lookOf: () => undefined,
    modulePageTopOf: () => null,
    reachOf: () => null,
    shopFactsLine: () => null,
    shopLeadLine: () => null,
}));
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

    it("stays indexed while the shop's read fails: a blip says nothing", async () => {
        site.lookup = { ok: false, reason: "unavailable" };
        const metadata = await generateMetadata({ params });
        expect(metadata?.robots).toBeUndefined();
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

    it("follows the catalogue for a published Shop page too", async () => {
        site.draw = "page";
        site.lookup = { ok: true, data: { products: [] } };
        const metadata = await generateMetadata({ params });
        expect(metadata?.robots).toEqual({ index: false, follow: true });
    });
});

describe("what /shop draws for a site with a published Shop page", () => {
    const sold = Array.from({ length: 13 }, (_, i) => ({
        slug: `p${i}`,
        name: `P${i}`,
    }));
    const grid = {
        type: "productGrid",
        contractVersion: 1,
        content: { source: "newest", count: 12 },
    };
    const shopPage = {
        path: "/shop",
        kind: "SHOP",
        title: "Shop",
        isHome: false,
        sections: [grid],
    };
    const open = async (query = {}) =>
        (await ShopPage({
            params,
            searchParams: Promise.resolve(query),
        })) as unknown as Drawn;
    /** The one element a `<main>` wraps, or the element itself. */
    const inside = (element: Drawn): Drawn => {
        const children = element.props.children;
        return Array.isArray(children)
            ? (children.at(-1) as Drawn)
            : ((children as Drawn | undefined) ?? element);
    };

    beforeEach(() => {
        vi.clearAllMocks();
        site.resolved = {
            siteId: "site_1",
            modules: { SHOP: "on" },
            snapshot: { site: { name: "Northwind Supply" }, pages: [shopPage] },
        };
        site.lookup = { ok: true, data: { products: sold } };
        site.draw = "page";
        site.page = shopPage;
        site.feeds = [{ products: sold.slice(0, 12) }];
    });

    it("says there's more when 13 sold don't fit a grid of 12", async () => {
        const element = inside(await open());
        expect(element.type).toBe(PublishedPage);
        const grids = element.props.productGrids as { moreHref?: string }[];
        expect(grids[0]?.moreHref).toBe("/shop?all=1");
    });

    it("draws the built-in listing on ?all=1, reading no grid", async () => {
        const element = inside(await open({ all: "1" }));
        expect(element.type).toBe(ShopListing);
        expect(element.props.products).toEqual(sold);
        expect(getProductGridFeeds).not.toHaveBeenCalled();
    });

    it("draws ShopUnavailable when the catalogue fails, and isn't kept", async () => {
        site.lookup = { ok: false, reason: "unavailable" };
        const element = await open();
        expect(element.type).toBe(ShopUnavailable);
        expect(element.props.retryHref).toBe("/shop");
        expect(dontCachePage).toHaveBeenCalled();
    });

    it("tries the address it was opened on again", async () => {
        site.lookup = { ok: false, reason: "unavailable" };
        const element = await open({ all: "1" });
        expect(element.type).toBe(ShopUnavailable);
        expect(element.props.retryHref).toBe("/shop?all=1");
    });

    it("asks for the catalogue and the grids together", async () => {
        const order: string[] = [];
        vi.mocked(getCatalogue).mockImplementationOnce(async () => {
            order.push("catalogue");
            await Promise.resolve();
            order.push("catalogue done");
            return site.lookup as never;
        });
        vi.mocked(getProductGridFeeds).mockImplementationOnce(() => {
            order.push("grids");
            return Promise.resolve(site.feeds as never);
        });
        await open();
        expect(order.indexOf("grids")).toBeLessThan(
            order.indexOf("catalogue done"),
        );
    });
});
