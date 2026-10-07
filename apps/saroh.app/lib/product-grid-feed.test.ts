import { describe, expect, it, vi } from "vitest";

import { MAX_GRIDS_READ, productGridFeeds } from "./product-grid-feed";

const CARD = {
    slug: "sourdough",
    name: "Sourdough",
    currency: "INR",
    price: "250.00",
    mrp: null,
    priceFrom: false,
    image: null,
    variantTitles: [],
    blurb: null,
    soldOut: false,
};

const queryOf = (content: unknown) =>
    (content as { q?: string | null } | null)?.q ?? null;

describe("each Product grid's products on a served page (G12)", () => {
    it("reads nothing for a page without a grid", async () => {
        const read = vi.fn(() => Promise.resolve([CARD]));
        await expect(
            productGridFeeds(
                [{ type: "hero", content: {} }],
                "/shop",
                queryOf,
                read,
            ),
        ).resolves.toBeUndefined();
        expect(read).not.toHaveBeenCalled();
    });

    it("reads each grid's own question, by the section's index", async () => {
        const read = vi.fn((q: string) =>
            Promise.resolve(q === "a" ? [CARD] : []),
        );
        const feeds = await productGridFeeds(
            [
                { type: "productGrid", content: { q: "a" } },
                { type: "hero", content: {} },
                { type: "productGrid", content: { q: "b" } },
            ],
            "/shop",
            queryOf,
            read,
        );
        expect(read).toHaveBeenCalledTimes(2);
        expect(feeds).toEqual([
            { products: [CARD], basePath: "/shop" },
            undefined,
            { products: [], basePath: "/shop" },
        ]);
    });

    it("marks a grid on the Shop page itself (UX-082)", async () => {
        const feeds = await productGridFeeds(
            [{ type: "productGrid", content: { q: "a" } }],
            "/shop",
            queryOf,
            () => Promise.resolve([CARD]),
            true,
        );
        expect(feeds).toEqual([
            { products: [CARD], basePath: "/shop", atShop: true },
        ]);
    });

    it("doesn't read a grid with nothing chosen yet, and hands it an empty feed", async () => {
        const read = vi.fn(() => Promise.resolve([CARD]));
        const feeds = await productGridFeeds(
            [{ type: "productGrid", content: { q: null } }],
            null,
            queryOf,
            read,
        );
        expect(read).not.toHaveBeenCalled();
        expect(feeds).toEqual([{ products: [], basePath: null }]);
    });

    it("reads at most six grids a page; the rest draw nothing", async () => {
        const read = vi.fn(() => Promise.resolve([CARD]));
        const sections = Array.from({ length: MAX_GRIDS_READ + 2 }, () => ({
            type: "productGrid",
            content: { q: "a" },
        }));
        const feeds = await productGridFeeds(sections, "/shop", queryOf, read);
        expect(read).toHaveBeenCalledTimes(MAX_GRIDS_READ);
        expect(feeds?.at(-1)).toEqual({ products: [], basePath: "/shop" });
    });
});
