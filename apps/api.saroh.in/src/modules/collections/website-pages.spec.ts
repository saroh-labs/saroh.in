jest.mock("@saroh/database", () => ({
    prisma: { site: { findMany: jest.fn().mockResolvedValue([]) } },
}));

import { prisma } from "@saroh/database";

import type { ProductBlockReader } from "./website-pages";
import {
    PRODUCT_BLOCKS,
    pagesShowing,
    websitePagesFor,
    websitePagesForCollections,
} from "./website-pages";

/**
 * "Shown on the website" (#516) reads the live snapshot's sections. No block
 * can show a product yet (#473), so today the answer is always empty; the
 * scanner itself is checked with a stand-in block.
 */
describe("website pages that show a product", () => {
    const productsBlock: ProductBlockReader = (content) => {
        const c = content as {
            productIds?: unknown;
            collectionId?: unknown;
        } | null;
        return {
            productIds: Array.isArray(c?.productIds)
                ? c.productIds.filter(
                      (id): id is string => typeof id === "string",
                  )
                : [],
            collectionIds:
                typeof c?.collectionId === "string" ? [c.collectionId] : [],
        };
    };
    const blocks = { productGrid: productsBlock };

    const snapshot = {
        pages: [
            {
                path: "/",
                title: "Home",
                sections: [
                    { type: "hero", content: { heading: "Rye & Co." } },
                    { type: "productGrid", content: { productIds: ["p1"] } },
                ],
            },
            {
                path: "/breads",
                title: "Breads",
                sections: [
                    {
                        type: "productGrid",
                        content: { collectionId: "col_breads" },
                    },
                ],
            },
            { path: "/about", title: "About", sections: [] },
            // Malformed rows from old snapshots show nothing.
            null,
            { path: 7, sections: [] },
            { path: "/broken", sections: [null, { type: 3 }] },
        ],
    };

    it("no block can show a product yet", () => {
        expect(Object.keys(PRODUCT_BLOCKS)).toHaveLength(0);
        expect(
            pagesShowing(snapshot, { productId: "p1", collectionIds: [] }),
        ).toEqual([]);
    });

    it("says the website doesn't show products, without reading a site", async () => {
        await expect(
            websitePagesFor("org_rye", { productId: "p1", collectionIds: [] }),
        ).resolves.toEqual({ showsProducts: false, pages: [] });
        expect(prisma.site.findMany).not.toHaveBeenCalled();
    });

    it("finds a page that names the product", () => {
        expect(
            pagesShowing(
                snapshot,
                { productId: "p1", collectionIds: [] },
                blocks,
            ),
        ).toEqual([{ path: "/", title: "Home" }]);
    });

    it("finds a page that shows a collection the product is in", () => {
        expect(
            pagesShowing(
                snapshot,
                { productId: "p2", collectionIds: ["col_breads"] },
                blocks,
            ),
        ).toEqual([{ path: "/breads", title: "Breads" }]);
    });

    it("reads nothing from a snapshot that isn't one", () => {
        for (const bad of [null, "x", 3, {}, { pages: "no" }]) {
            expect(
                pagesShowing(
                    bad,
                    { productId: "p1", collectionIds: [] },
                    blocks,
                ),
            ).toEqual([]);
        }
    });

    it("a collection's card says the website doesn't show products, without reading a site", async () => {
        const got = await websitePagesForCollections("org_rye", [
            "col_breads",
            "col_gifts",
        ]);
        expect(Object.fromEntries(got)).toEqual({
            col_breads: { showsProducts: false, pages: [] },
            col_gifts: { showsProducts: false, pages: [] },
        });
        expect(prisma.site.findMany).not.toHaveBeenCalled();
    });

    it("finds the pages that show one collection, reading the sites once", async () => {
        const findMany = prisma.site.findMany as jest.Mock;
        findMany.mockResolvedValueOnce([
            {
                id: "site_1",
                name: "Rye & Co.",
                currentPublication: { snapshot },
            },
        ]);
        const got = await websitePagesForCollections(
            "org_rye",
            ["col_breads", "col_gifts"],
            blocks,
        );
        expect(findMany).toHaveBeenCalledTimes(1);
        expect(got.get("col_breads")).toEqual({
            showsProducts: true,
            pages: [
                {
                    siteId: "site_1",
                    siteName: "Rye & Co.",
                    path: "/breads",
                    title: "Breads",
                },
            ],
        });
        // A page naming a product is not a page showing a collection.
        expect(got.get("col_gifts")).toEqual({
            showsProducts: true,
            pages: [],
        });
    });
});
