import type { ShopListingCard } from "@saroh/site-blocks";
import { describe, expect, it } from "vitest";

import type { PublicationPage, Section } from "./publication";
import {
    ALL_PRODUCTS_HREF,
    shopPageFeeds,
    withShopGrid,
} from "./shop-page-offer";

const card = (slug: string) => ({ slug }) as unknown as ShopListingCard;
const grid = (count?: number): Section => ({
    type: "productGrid",
    contractVersion: 1,
    content: count ? { count } : {},
});
const feed = (...slugs: string[]) => ({
    products: slugs.map(card),
    basePath: "/shop",
    atShop: true,
});
const SOLD = [{ slug: "a" }, { slug: "b" }, { slug: "c" }];

describe("a Shop page's grids", () => {
    it("adds no way on when they draw all that's sold", () => {
        const feeds = shopPageFeeds([grid(3)], [feed("a", "b", "c")], SOLD);
        expect(feeds?.[0]?.moreHref).toBeUndefined();
    });

    it("offers the rest when they draw less", () => {
        const feeds = shopPageFeeds([grid(2)], [feed("a", "b", "c")], SOLD);
        expect(feeds?.[0]?.moreHref).toBe(ALL_PRODUCTS_HREF);
    });

    it("draws nothing for the picked ones all gone: the route's listing", () => {
        expect(shopPageFeeds([grid(4)], [feed()], SOLD)).toBeNull();
    });

    it("keeps a failed grid: it says so, and isn't nothing", () => {
        const failed = { ...feed(), failed: true };
        const feeds = shopPageFeeds([grid(4)], [failed], SOLD);
        expect(feeds?.[0]?.failed).toBe(true);
    });
});

describe("a Shop page with no grid", () => {
    const page = (sections: Section[]): PublicationPage => ({
        path: "/shop",
        title: "Shop",
        isHome: false,
        kind: "SHOP",
        sections,
    });

    it("gets the one a new Shop page starts with", () => {
        const drawn = withShopGrid(page([]));
        expect(drawn.sections.map((s) => s.type)).toEqual(["productGrid"]);
    });

    it("keeps a page that has its own", () => {
        const own = page([grid(2)]);
        expect(withShopGrid(own)).toBe(own);
    });
});
