jest.mock("@saroh/database", () => ({
    prisma: {
        collection: { findMany: jest.fn() },
        product: { findMany: jest.fn() },
    },
}));

import { BadRequestException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import {
    assertGridRefsOwned,
    checkProductGrids,
    foreignGridRef,
    gridContent,
} from "./product-grid-checks";

const collectionFind = prisma.collection.findMany as jest.Mock;
const productFind = prisma.product.findMany as jest.Mock;

/** G12 — a Product grid names only the business's own, and says what won't show. */
describe("a Product grid's content", () => {
    it("reads a just-added grid as the newest", () => {
        expect(gridContent({})).toEqual({
            source: "newest",
            collectionId: null,
            productIds: [],
        });
    });

    it("reads what it picked, forgivingly", () => {
        expect(
            gridContent({ source: "picked", productIds: ["p_1", 2, "p_2"] }),
        ).toEqual({
            source: "picked",
            collectionId: null,
            productIds: ["p_1", "p_2"],
        });
    });
});

describe("foreignGridRef", () => {
    const known = {
        collectionIds: new Set(["col_breads"]),
        productIds: new Set(["p_1", "p_2"]),
    };

    it("passes a grid naming only the business's own", () => {
        expect(
            foreignGridRef(
                [
                    {
                        index: 0,
                        content: {
                            source: "collection",
                            collectionId: "col_breads",
                        },
                        stored: null,
                    },
                    {
                        index: 1,
                        content: { source: "picked", productIds: ["p_2"] },
                        stored: null,
                    },
                ],
                known,
            ),
        ).toBeNull();
    });

    it("names the grid and field of another business's collection", () => {
        expect(
            foreignGridRef(
                [
                    {
                        index: 2,
                        content: {
                            source: "collection",
                            collectionId: "col_theirs",
                        },
                        stored: null,
                    },
                ],
                known,
            ),
        ).toEqual({ index: 2, field: "collectionId" });
    });

    it("names another business's product", () => {
        expect(
            foreignGridRef(
                [
                    {
                        index: 0,
                        content: {
                            source: "picked",
                            productIds: ["p_1", "p_theirs"],
                        },
                        stored: null,
                    },
                ],
                known,
            ),
        ).toEqual({ index: 0, field: "productIds" });
    });

    it("carries a product the stored grid already named, deleted since", () => {
        expect(
            foreignGridRef(
                [
                    {
                        index: 0,
                        content: {
                            source: "picked",
                            productIds: ["p_1", "p_deleted"],
                        },
                        stored: {
                            source: "picked",
                            productIds: ["p_deleted", "p_1"],
                        },
                    },
                ],
                known,
            ),
        ).toBeNull();
    });
});

describe("assertGridRefsOwned", () => {
    beforeEach(() => {
        collectionFind.mockReset();
        productFind.mockReset();
    });

    it("reads nothing for a page with no grid naming anything", async () => {
        const stored = jest.fn();
        await assertGridRefsOwned(
            "org_rye",
            [
                { type: "hero", content: {} },
                { type: "productGrid", content: { source: "newest" } },
            ],
            stored,
        );
        expect(collectionFind).not.toHaveBeenCalled();
        expect(productFind).not.toHaveBeenCalled();
        expect(stored).not.toHaveBeenCalled();
    });

    it("looks the ids up in the business only", async () => {
        productFind.mockResolvedValue([{ id: "p_1" }]);
        const stored = jest.fn();
        await assertGridRefsOwned(
            "org_rye",
            [
                {
                    type: "productGrid",
                    content: { source: "picked", productIds: ["p_1"] },
                },
            ],
            stored,
        );
        expect(productFind).toHaveBeenCalledWith({
            where: { organizationId: "org_rye", id: { in: ["p_1"] } },
            select: { id: true },
        });
        // Every id found: the stored draft is never read.
        expect(stored).not.toHaveBeenCalled();
    });

    it("refuses a collection from another business, naming the section", async () => {
        collectionFind.mockResolvedValue([]);
        const save = assertGridRefsOwned(
            "org_rye",
            [
                { type: "hero", content: {}, key: "k_hero" },
                {
                    type: "productGrid",
                    content: {
                        source: "collection",
                        collectionId: "col_pulse",
                    },
                    key: "k_grid",
                },
            ],
            () => Promise.resolve(new Map()),
        );
        await expect(save).rejects.toBeInstanceOf(BadRequestException);
        await expect(save).rejects.toMatchObject({
            response: {
                message:
                    "Section at index 1 names a collection that isn't one of yours.",
                details: { index: 1, field: "collectionId" },
            },
        });
    });

    it("lets a save through when the missing product was already there", async () => {
        productFind.mockResolvedValue([{ id: "p_1" }]);
        await expect(
            assertGridRefsOwned(
                "org_rye",
                [
                    {
                        type: "productGrid",
                        content: {
                            source: "picked",
                            productIds: ["p_1", "p_deleted"],
                        },
                        key: "k_grid",
                    },
                ],
                () =>
                    Promise.resolve(
                        new Map([
                            [
                                "k_grid",
                                {
                                    type: "productGrid",
                                    content: {
                                        source: "picked",
                                        productIds: ["p_deleted"],
                                    },
                                },
                            ],
                        ]),
                    ),
            ),
        ).resolves.toBeUndefined();
    });
});

describe("checkProductGrids", () => {
    const page = (
        sections: { type: string; content: unknown; hidden?: boolean }[],
        hidden = false,
    ) => ({
        id: "page_home",
        hidden,
        sections: sections.map((s) => ({ hidden: false, ...s })),
    });
    const stock = {
        storefrontName: "Online",
        onSale: new Set(["p_1", "p_2"]),
        collections: new Map([
            ["col_breads", { name: "Breads", onSale: 5 }],
            ["col_gifts", { name: "Gifts", onSale: 0 }],
        ]),
    };

    it("says nothing about a grid with something to show", () => {
        expect(
            checkProductGrids(
                [
                    page([
                        { type: "productGrid", content: {} },
                        {
                            type: "productGrid",
                            content: {
                                source: "collection",
                                collectionId: "col_breads",
                            },
                        },
                        {
                            type: "productGrid",
                            content: { source: "picked", productIds: ["p_1"] },
                        },
                    ]),
                ],
                stock,
            ),
        ).toEqual([]);
    });

    it("flags a grid whose every picked product is archived", () => {
        expect(
            checkProductGrids(
                [
                    page([
                        { type: "hero", content: {} },
                        {
                            type: "productGrid",
                            content: {
                                source: "picked",
                                productIds: ["p_archived", "p_draft"],
                            },
                        },
                    ]),
                ],
                stock,
            ),
        ).toEqual([
            {
                type: "productsNotOnSale",
                message:
                    "None of the products picked here is on sale at Online any more, so this product grid doesn't show on your site. Pick others, or show your newest.",
                pageId: "page_home",
                sectionIndex: 1,
                field: "productIds",
            },
        ]);
    });

    it("counts the ones that dropped out when others still show", () => {
        const [flag] = checkProductGrids(
            [
                page([
                    {
                        type: "productGrid",
                        content: {
                            source: "picked",
                            productIds: ["p_1", "p_x", "p_y"],
                        },
                    },
                ]),
            ],
            stock,
        );
        expect(flag.message).toBe(
            "2 products picked here aren't on sale at Online any more, so they don't show.",
        );
    });

    it("asks for a collection or products not chosen yet", () => {
        const flags = checkProductGrids(
            [
                page([
                    { type: "productGrid", content: { source: "collection" } },
                    { type: "productGrid", content: { source: "picked" } },
                ]),
            ],
            stock,
        );
        expect(flags.map((f) => [f.type, f.field])).toEqual([
            ["emptyRequiredField", "collectionId"],
            ["emptyRequiredField", "productIds"],
        ]);
    });

    it("flags a deleted collection, and one with nothing on sale", () => {
        const flags = checkProductGrids(
            [
                page([
                    {
                        type: "productGrid",
                        content: {
                            source: "collection",
                            collectionId: "col_gone",
                        },
                    },
                    {
                        type: "productGrid",
                        content: {
                            source: "collection",
                            collectionId: "col_gifts",
                        },
                    },
                ]),
            ],
            stock,
        );
        expect(flags.map((f) => f.message)).toEqual([
            "The collection this product grid showed has been deleted, so the grid doesn't show on your site. Choose another.",
            "Nothing in Gifts is on sale at Online, so this product grid doesn't show on your site.",
        ]);
    });

    it("leaves hidden grids and hidden pages alone", () => {
        const empty = { type: "productGrid", content: { source: "picked" } };
        expect(
            checkProductGrids(
                [page([{ ...empty, hidden: true }]), page([empty], true)],
                stock,
            ),
        ).toEqual([]);
    });
});
