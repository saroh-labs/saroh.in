import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ProductDetail } from "@/lib/products/service";
import type { ProductStock, SizeStock } from "@/lib/stock/product-stock";

import { StockTable } from "./stock-table";

/**
 * A product's Stock tab on a phone (audit T4): a card per size leading with
 * what can be sold — "800g · 18 can sell" over "22 on hand · 4 promised ·
 * ₹480 · warns at 6" — where the 540px table hid Can sell and Shop shows.
 */

const product = {
    id: "p1",
    name: "Sourdough loaf",
    price: "480.00",
    option: { name: "Size" },
    variants: [{ id: "v1", title: "800g", sku: "SD-800", price: "480.00" }],
} as unknown as ProductDetail;

const shelf = (over: Partial<SizeStock["shelves"][number]> = {}) => ({
    storeId: "s1",
    name: "Hill Road",
    soldHere: true,
    onHand: 22,
    promised: 4,
    canSell: 18,
    short: 0,
    warnAt: 6,
    stockLevelId: "l1",
    word: { text: "In stock", tone: "ok" as const },
    ...over,
});

const size: SizeStock = {
    variantId: "v1",
    onHand: 22,
    promised: 4,
    canSell: 18,
    short: 0,
    warnAt: 6,
    shelves: [shelf()],
    word: { text: "In stock", tone: "ok" },
};

const stock = (over: Partial<ProductStock> = {}): ProductStock => ({
    mode: "variant",
    sizes: [size],
    totals: { onHand: 22, promised: 4, canSell: 18, short: 0 },
    split: false,
    byStore: [],
    ...over,
});

function render(s: ProductStock) {
    const html = renderToStaticMarkup(
        <StockTable
            product={product}
            stock={s}
            money={(a) => `₹${Number(a)}`}
            ordersHref="/orders"
            onOpen={() => undefined}
        />,
    );
    const at = html.indexOf('min-[760px]:hidden"');
    expect(at).toBeGreaterThan(-1);
    return { html, phone: html.slice(html.lastIndexOf("<ul", at)) };
}

describe("StockTable on a phone", () => {
    it("hides the desk table below 760px, by CSS", () => {
        const { html } = render(stock());
        expect(html).toMatch(/class="relative max-\[759px\]:hidden"/);
    });

    it("leads each size with what can be sold, then the rest", () => {
        const { phone } = render(stock());
        expect(phone).toMatch(/800g<\/button>.*18 can sell/);
        expect(phone).toContain("22 on hand · 4 promised · ₹480 · warns at 6");
        expect(phone).toContain("SD-800");
        expect(phone).toContain("Shop shows");
        expect(phone).toContain("In stock");
        expect(phone).toContain("18 can sell</span> · 22 on hand · 4 promised");
    });

    it("opens the size from the whole card, a labelled button", () => {
        const { phone } = render(stock());
        expect(phone).toContain('aria-label="Open 800g details"');
        expect(phone).toContain("after:inset-0");
        expect(phone).toContain("cursor-pointer");
    });

    it("gives each storefront its own line when split, promised still linked", () => {
        const { phone } = render(
            stock({
                split: true,
                sizes: [
                    {
                        ...size,
                        shelves: [
                            shelf({ onHand: 12, promised: 1, canSell: 11 }),
                            shelf({
                                storeId: "s2",
                                name: "Online",
                                onHand: 10,
                                promised: 3,
                                canSell: 7,
                                word: { text: "Only 7 left", tone: "low" },
                            }),
                        ],
                    },
                ],
            }),
        );
        expect(phone).toContain('aria-label="800g by location"');
        expect(phone).toContain("Hill Road · ");
        expect(phone).toContain("11 can sell");
        expect(phone).toContain("Online · ");
        expect(phone).toContain("Only 7 left");
        expect(phone).toContain('href="/orders"');
        expect(phone).toContain("relative z-[1]");
        expect(phone).toContain("coarse:min-h-11");
    });

    it("has no sideways scroller on the phone", () => {
        const { phone } = render(stock());
        expect(phone).not.toContain("min-w-[");
        expect(phone).not.toContain("overflow-x-auto");
    });
});
