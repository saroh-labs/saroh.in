import { beforeEach, describe, expect, it, vi } from "vitest";

const checkout = vi.hoisted(() => ({ canOrder: false }));

vi.mock("./catalogue", () => ({
    shopFetch: vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify([]), { status: 404 })),
    ),
}));
vi.mock("./page-cache/site-rules", () => ({
    dontCachePage: vi.fn(),
    listsProducts: vi.fn(),
}));
vi.mock("./shop-checkout", () => ({
    getCheckoutOptions: vi.fn(() => Promise.resolve(checkout)),
}));

import { getCheckoutOptions } from "./shop-checkout";
import { getProductGridFeeds } from "./site-product-grids";

const grid = (addInPlace?: boolean) => ({
    type: "productGrid",
    content: { source: "newest", ...(addInPlace ? { addInPlace } : {}) },
});

/** A card's Add fills the bag only where the site takes orders (DEC-237). */
describe("getProductGridFeeds' bag", () => {
    beforeEach(() => vi.mocked(getCheckoutOptions).mockClear());

    it("names the site's bag when the site takes orders", async () => {
        checkout.canOrder = true;
        const feeds = await getProductGridFeeds([grid(true)], "site_1");
        expect(feeds?.[0]?.bagSite).toBe("site_1");
    });

    it("leaves the bag off when the site takes no orders", async () => {
        checkout.canOrder = false;
        const feeds = await getProductGridFeeds([grid(true)], "site_1");
        expect(feeds?.[0]?.bagSite).toBeUndefined();
    });

    it("asks nothing for grids without Add on the card", async () => {
        checkout.canOrder = true;
        const feeds = await getProductGridFeeds([grid()], "site_1");
        expect(getCheckoutOptions).not.toHaveBeenCalled();
        expect(feeds?.[0]?.bagSite).toBeUndefined();
    });
});
