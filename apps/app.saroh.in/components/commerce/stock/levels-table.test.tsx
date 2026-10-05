import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { StockCell } from "@/lib/stock/levels";
import type { StockLevelRow } from "@/lib/stock/service";

import { LevelsTable } from "./levels-table";

/**
 * Stock levels on a phone (T2): under 760px the rows read as cards by CSS
 * alone — every storefront gets its own line, named, and the product's size
 * is never truncated, so "House blend beans 1kg" and "… 250g" tell apart.
 */

function cell(over: Partial<StockCell> = {}): StockCell {
    return {
        storeId: "s1",
        stockLevelId: "l1",
        soldHere: true,
        onHand: 12,
        promised: 1,
        canSell: 11,
        short: 0,
        warnAt: 4,
        word: "IN_STOCK",
        lastChange: null,
        ...over,
    };
}

const storefronts = [
    { id: "s1", name: "Hill Road" },
    { id: "s2", name: "Online" },
];

function row(over: Partial<StockLevelRow> = {}): StockLevelRow {
    return {
        productId: "p1",
        productName: "House blend beans",
        productStatus: "PUBLISHED",
        image: null,
        variantId: "v1",
        variantTitle: "1kg",
        sku: null,
        cells: [
            cell(),
            cell({
                storeId: "s2",
                onHand: 0,
                canSell: 0,
                promised: 0,
                word: "SOLD_OUT",
            }),
        ],
        lastChange: {
            at: "2026-10-05T07:12:00.000Z",
            kind: "COUNTED",
            quantity: 0,
            by: "Arjun",
            order: null,
        },
        ...over,
    };
}

function render(rows: StockLevelRow[], counting = false) {
    return renderToStaticMarkup(
        <LevelsTable
            storefronts={storefronts}
            rows={rows}
            timezone="Asia/Kolkata"
            counting={counting}
            values={{}}
            onValue={() => undefined}
            empty="Nothing here"
        />,
    );
}

/** The class list of the element whose text is exactly `text`. */
function classOf(html: string, text: string): string {
    const at = html.indexOf(`>${text}<`);
    expect(at).toBeGreaterThan(-1);
    const open = html.lastIndexOf("<", at);
    return /class="([^"]*)"/.exec(html.slice(open, at))?.[1] ?? "";
}

describe("LevelsTable on a phone", () => {
    it("names every storefront on its own line of the card", () => {
        const html = render([row()]);
        // The column heads are desk-only; each cell carries its storefront.
        expect(html).toMatch(/max-\[759px\]:hidden[^"]*">.*Product/);
        expect(html).toContain(">Hill Road<");
        expect(html).toContain(">Online<");
        expect(html).toContain("11 can sell");
        expect(html).toContain("12 on hand · 1 promised");
        expect(html).toContain("Sold out");
        expect(html).toContain("Counted by Arjun");
    });

    it("says Not sold here for a storefront that doesn't sell it", () => {
        const html = render([
            row({
                cells: [
                    cell(),
                    cell({ storeId: "s2", soldHere: false, onHand: 0 }),
                ],
            }),
        ]);
        expect(html).toContain("Not sold here");
    });

    it("never truncates the name or the size below the desk", () => {
        const html = render([row()]);
        for (const text of ["House blend beans", "1kg · warns at 4"]) {
            const cls = classOf(html, text).split(" ");
            expect(cls).not.toContain("truncate");
            expect(cls).toContain("min-[760px]:truncate");
        }
    });

    it("keeps no sideways scroller or fixed width under 760px", () => {
        const html = render([row()]);
        expect(html.split(" ")).not.toContain("overflow-x-auto");
        expect(html).not.toMatch(/style="[^"]*min-width/);
        expect(html).toContain("min-[760px]:overflow-x-auto");
    });

    it("is a list of products, a 44px link each on a phone", () => {
        const html = render([
            row(),
            row({ variantId: "v2", variantTitle: "250g" }),
        ]);
        expect(html).toContain('role="list"');
        expect(html.match(/role="listitem"/g)).toHaveLength(2);
        expect(html).toContain("max-[759px]:min-h-11");
    });

    it("keeps one count box per shelf while counting", () => {
        const html = render([row()], true);
        expect(
            html.match(
                /aria-label="House blend beans 1kg counted at Hill Road"/g,
            ),
        ).toHaveLength(1);
    });
});
