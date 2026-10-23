import { describe, expect, it } from "vitest";

import {
    addStockLink,
    emptiedLine,
    groupEmptied,
    groupOneAction,
    groupOpenAll,
    moreLabel,
    STOCK_LEVELS_HREF,
    stockNote,
} from "./group-body";
import type { HomeNeed, HomeNeedGroup } from "./service";

/**
 * What a Needs you group says around its rows (DEC-171, plan U7): the
 * line under them, the low-stock note, a closed group's one action, a
 * phone sheet's last button, and an emptied group's line.
 */

function need(over: Partial<HomeNeed> & Pick<HomeNeed, "id">): HomeNeed {
    return {
        code: "CRM_UNANSWERED_MESSAGES",
        severity: "ATTENTION",
        title: "A row",
        sub: null,
        amountMinor: null,
        currency: null,
        amountIn: null,
        tag: null,
        tone: "due",
        href: `/x/${over.id}`,
        ...over,
    };
}

function group(
    over: Partial<HomeNeedGroup> & Pick<HomeNeedGroup, "kind">,
): HomeNeedGroup {
    return {
        count: 1,
        late: 0,
        totals: null,
        oldest: null,
        rows: [],
        more: 0,
        href: "/list",
        codes: [],
        ...over,
    };
}

const REPLY = {
    kind: "REPLY" as const,
    label: "Reply",
    confirm: "",
    yes: "Send reply",
    done: "Reply sent",
    sends: true,
    undoable: false,
    target: "c1",
    person: "Rohan",
};

describe("moreLabel", () => {
    it("names what is past the rows, by kind", () => {
        expect(moreLabel(group({ kind: "ORDERS", more: 3 }))).toBe(
            "3 more orders",
        );
        expect(moreLabel(group({ kind: "ORDERS", more: 1 }))).toBe(
            "1 more order",
        );
        expect(moreLabel(group({ kind: "ENQUIRIES", more: 2 }))).toBe(
            "2 more enquiries",
        );
        expect(moreLabel(group({ kind: "AWAITING_PAYMENT", more: 0 }))).toBe(
            null,
        );
    });

    it("bills: the rest of the overdue, and the bills not due yet (HANeedsD)", () => {
        expect(
            moreLabel(group({ kind: "BILLS", count: 10, all: 16, more: 5 })),
        ).toBe("5 more overdue, 6 not due yet");
        expect(
            moreLabel(group({ kind: "BILLS", count: 2, all: 2, more: 0 })),
        ).toBe(null);
        expect(
            moreLabel(group({ kind: "BILLS", count: 2, all: 5, more: 0 })),
        ).toBe("3 not due yet");
    });
});

describe("low stock (A14)", () => {
    it("says only products with a stock level show, and where to set one", () => {
        expect(
            stockNote(group({ kind: "STOCK", codes: ["COMMERCE_STOCK_LOW"] })),
        ).toEqual({
            text: "Only products with a stock level show here.",
            link: { label: "Set stock levels", href: STOCK_LEVELS_HREF },
        });
        expect(
            stockNote(
                group({ kind: "STOCK", codes: ["COMMERCE_STOCK_SHORT"] }),
            ),
        ).toBe(null);
        expect(stockNote(group({ kind: "ORDERS" }))).toBe(null);
    });

    it("a stock row adds stock on its own product", () => {
        expect(
            addStockLink(
                need({
                    id: "s1",
                    code: "COMMERCE_STOCK_LOW",
                    href: "/commerce/stock?product=p1",
                }),
            ),
        ).toEqual({ label: "Add stock", href: "/commerce/stock?product=p1" });
        expect(addStockLink(need({ id: "c1" }))).toBe(null);
    });
});

describe("groupOneAction", () => {
    it("is the first open row's own action, started in place", () => {
        const g = group({
            kind: "ENQUIRIES",
            rows: [
                need({ id: "c0" }),
                need({ id: "c1", inline: REPLY }),
                need({ id: "c2", inline: REPLY }),
            ],
        });
        expect(groupOneAction(g)).toEqual({
            kind: "row",
            label: "Reply",
            rowId: "c1",
        });
        // Done here: the next one.
        expect(groupOneAction(g, new Set(["c1"]))).toEqual({
            kind: "row",
            label: "Reply",
            rowId: "c2",
        });
        expect(groupOneAction(g, new Set(["c1", "c2"]))).toBe(null);
    });

    it("orders, bills and setup have none of their own", () => {
        for (const kind of ["ORDERS", "BILLS", "SETUP"] as const) {
            expect(
                groupOneAction(
                    group({ kind, rows: [need({ id: "a", inline: REPLY })] }),
                ),
            ).toBe(null);
        }
    });

    it("low stock: Add stock, on the product when there is one, else the list", () => {
        const low = (n: number) =>
            group({
                kind: "STOCK",
                href: "/commerce/stock?show=needs",
                rows: Array.from({ length: n }, (_, i) =>
                    need({
                        id: `s${i}`,
                        code: "COMMERCE_STOCK_LOW",
                        href: `/commerce/stock?product=p${i}`,
                    }),
                ),
            });
        expect(groupOneAction(low(1))).toEqual({
            kind: "link",
            label: "Add stock",
            href: "/commerce/stock?product=p0",
        });
        expect(groupOneAction(low(2))).toEqual({
            kind: "link",
            label: "Add stock",
            href: "/commerce/stock?show=needs",
        });
    });
});

describe("groupEmptied", () => {
    const g = group({
        kind: "AWAITING_PAYMENT",
        count: 2,
        rows: [need({ id: "b1" }), need({ id: "b2" })],
    });
    it("only once every row is done here and nothing is past them", () => {
        expect(groupEmptied(g, new Set(["b1"]))).toBe(false);
        expect(groupEmptied(g, new Set(["b1", "b2"]))).toBe(true);
        expect(groupEmptied({ ...g, more: 3 }, new Set(["b1", "b2"]))).toBe(
            false,
        );
    });
    it("says so, and which group it was", () => {
        expect(emptiedLine("AWAITING_PAYMENT")).toEqual({
            title: "All done",
            sub: "Bookings awaiting payment · nothing left to do here",
            tag: null,
        });
    });
});

describe("groupOpenAll", () => {
    it("is a phone sheet's last button (HPSheets)", () => {
        expect(groupOpenAll(group({ kind: "ORDERS", href: "/o" }))).toEqual({
            label: "Open all orders",
            href: "/o",
        });
        expect(
            groupOpenAll(
                group({ kind: "AWAITING_PAYMENT", href: "/bookings" }),
            ),
        ).toEqual({ label: "Open bookings", href: "/bookings" });
        expect(
            groupOpenAll(
                group({ kind: "STOCK", codes: ["COMMERCE_STOCK_LOW"] }),
            ),
        ).toEqual({ label: "Set stock levels", href: STOCK_LEVELS_HREF });
    });
});
