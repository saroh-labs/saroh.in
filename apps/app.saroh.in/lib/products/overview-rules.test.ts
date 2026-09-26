import { describe, expect, it } from "vitest";

import { productHref, productTabOf } from "./links";
import type { OverviewOrder, ProductPlacement } from "./overview-rules";
import { stockBadge } from "./overview-rules";
import {
    accessLine,
    availability,
    collectionsSummary,
    detailTag,
    heldByLine,
    openOrderLine,
    orderRef,
    ordersSummary,
    sellableByStore,
    websiteSummary,
    whereItSells,
} from "./overview-words";

describe("the Stock tab's badge", () => {
    const totals = { onHand: 0, promised: 0, canSell: 0, lowCount: 1 };
    const at = (short: number, low: number) => ({
        needs: { short, low },
        totals,
    });

    it("says short before low, and nothing when all is well", () => {
        expect(stockBadge(at(1, 1), true)).toBe("1 short");
        expect(stockBadge(at(0, 2), true)).toBe("2 low");
        expect(stockBadge(at(0, 0), true)).toBeNull();
    });

    it("says nothing for a product that doesn't count stock", () => {
        expect(stockBadge(at(1, 1), false)).toBeNull();
    });

    it("falls back to this storefront's low count from an older API", () => {
        expect(stockBadge({ totals }, true)).toBe("1 low");
    });
});

describe("the product page's tabs", () => {
    it("opens Stock for the old ?tab=variants", () => {
        expect(productTabOf("variants")).toBe("stock");
        expect(productTabOf("stock")).toBe("stock");
        expect(productTabOf("collections")).toBe("collections");
        expect(productTabOf("nonsense")).toBe("overview");
        expect(productTabOf(undefined)).toBe("overview");
    });
    it("links the old name to the new tab", () => {
        expect(productHref("s1", "p1", "variants")).toBe(
            "/commerce/products/p1?storefront=s1&tab=stock",
        );
        expect(productHref(null, "p1", "overview")).toBe(
            "/commerce/products/p1",
        );
    });
});

describe("availability", () => {
    it("a short product says so, with the gap as the figure", () => {
        const a = availability({
            onHand: 1,
            promised: 3,
            canSell: 0,
            short: 2,
        });
        expect(a.short).toBe(true);
        expect(a.label).toBe("Short for orders already placed");
        expect(a.figure).toBe("2 short");
        expect(a.note).toBe("1 on hand, 3 promised");
    });
    it("otherwise what can be sold, and where", () => {
        const a = availability(
            { onHand: 30, promised: 5, canSell: 25, short: 0 },
            sellableByStore([
                { name: "Hill Road", canSell: 10 },
                { name: "Online", canSell: 15 },
            ]),
        );
        expect(a.label).toBe("Can be sold now");
        expect(a.figure).toBe("25");
        expect(a.note).toBe(
            "30 on hand, 5 promised · 10 at Hill Road, 15 online",
        );
    });
    it("names no storefront when there is one", () => {
        expect(sellableByStore([{ name: "Hill Road", canSell: 3 }])).toBeNull();
    });
});

describe("heldByLine", () => {
    it("says which sizes the open orders hold", () => {
        expect(
            heldByLine(5, 3, [
                { title: "800g", promised: 4 },
                { title: "400g", promised: 1 },
                { title: "1kg", promised: 0 },
            ]),
        ).toBe("5 held by 3 open orders — 800g 4, 400g 1");
    });
    it("is nothing when nothing is promised", () => {
        expect(heldByLine(0, 0, [])).toBeNull();
    });
    it("keeps the number while orders can't be read", () => {
        expect(heldByLine(2, null, [])).toMatch(/^Promised stock \(2\)/);
    });
});

describe("Linked to this product", () => {
    it("summarises orders this month", () => {
        expect(ordersSummary(3, 41, new Date(2026, 8, 24))).toBe(
            "3 open · 41 in September",
        );
    });
    it("writes an order number as people say it", () => {
        expect(orderRef("1064")).toBe("#1064");
        expect(orderRef("ORD-507")).toBe("ORD-507");
    });
    it("writes an open order as one line", () => {
        const order: OverviewOrder = {
            id: "o1",
            orderNumber: "#1020",
            customerId: "c1",
            customer: "Priya Raman",
            status: "PENDING",
            open: true,
            createdAt: "2026-09-24T08:00:00Z",
            lines: [{ variantId: "v1", title: "800g", quantity: 2 }],
        };
        expect(openOrderLine(order, "Sourdough")).toBe(
            "#1020 Priya — 800g × 2, new",
        );
    });
    const placement = (
        over: Partial<ProductPlacement> = {},
    ): ProductPlacement => ({
        collections: [
            {
                id: "c1",
                name: "Bread",
                kind: "AUTOMATIC",
                category: null,
                showing: true,
            },
            {
                id: "c2",
                name: "Weekend bakes",
                kind: "HAND_PICKED",
                category: null,
                showing: true,
            },
        ],
        website: { showsProducts: false, pages: [] },
        ...over,
    });
    it("counts the collections it shows in", () => {
        expect(collectionsSummary(placement())).toEqual({
            count: "In 2 collections",
            names: "Bread, Weekend bakes",
        });
        expect(collectionsSummary(placement({ collections: [] }))).toEqual({
            count: "In no collection",
            names: "—",
        });
    });
    it("says the website can't show products yet, rather than none", () => {
        expect(websiteSummary(placement()).lines).toEqual([
            "The website doesn't show products yet.",
        ]);
        expect(
            websiteSummary(
                placement({
                    website: {
                        showsProducts: true,
                        pages: [
                            {
                                siteId: "s",
                                siteName: "Rye",
                                path: "/",
                                title: "Home — Featured products",
                            },
                            {
                                siteId: "s",
                                siteName: "Rye",
                                path: "/menu",
                                title: "Menu — Breads",
                            },
                        ],
                    },
                }),
            ).headline,
        ).toBe("Shown on 2 pages");
    });
});

describe("Details tags", () => {
    it("an empty field the shop would show is hidden until filled in", () => {
        expect(detailTag(false, true)).toBe("Hidden until filled in");
        expect(detailTag(true, true)).toBe("On the shop");
        expect(detailTag(true, false)).toBe("Team only");
        expect(detailTag(false, false)).toBe("Team only");
    });
});

describe("the header", () => {
    it("says where it sells, or why it doesn't", () => {
        expect(whereItSells("PUBLISHED", ["Hill Road", "Online"])).toBe(
            "Hill Road, Online",
        );
        expect(whereItSells("DRAFT", ["Hill Road"])).toBe(
            "not on the shop yet",
        );
        expect(whereItSells("ARCHIVED", [])).toBe("not on the shop");
    });
    it("tells a stock-only role what it can do, and nobody who can edit", () => {
        expect(
            accessLine({
                roleLabel: "Member",
                canWrite: false,
                canStock: true,
                canReply: false,
            }),
        ).toBe(
            "You're signed in as Member. You can change stock counts here. An owner or admin can change what you can do in Team.",
        );
        expect(
            accessLine({
                roleLabel: "Reviewer",
                canWrite: false,
                canStock: false,
                canReply: false,
            }),
        ).toContain("You can look, but not change anything.");
        expect(
            accessLine({
                roleLabel: "Owner",
                canWrite: true,
                canStock: true,
                canReply: true,
            }),
        ).toBeNull();
    });
});
