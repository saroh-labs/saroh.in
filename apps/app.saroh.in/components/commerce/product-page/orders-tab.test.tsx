import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ProductOverview } from "@/lib/products/overview-rules";

import { ProductOrdersTab } from "./orders-tab";

/**
 * A product's Orders tab on a phone (audit T4): under 760px the desk table
 * gives way to the Orders list's own card, so Location, When and Status no
 * longer hide 280px to the right of a 600px table.
 */

const overview = {
    product: { id: "p1", name: "Sourdough loaf", status: "PUBLISHED" },
    storefront: { id: "s1", name: "Hill Road" },
    orders: {
        status: "ok",
        data: {
            openCount: 1,
            thisMonthCount: 1,
            soldThisMonth: {},
            recent: [
                {
                    id: "o1",
                    orderNumber: "#1042",
                    customerId: "c1",
                    customer: "Priya Raman",
                    status: "PENDING",
                    open: true,
                    createdAt: "2026-09-27T09:00:00.000Z",
                    lines: [{ variantId: "v1", title: "800g", quantity: 2 }],
                },
            ],
        },
    },
} as unknown as ProductOverview;

function render() {
    const html = renderToStaticMarkup(
        <ProductOrdersTab overview={overview} storeId="s1" filter="recent" />,
    );
    const at = html.indexOf('min-[760px]:hidden"');
    expect(at).toBeGreaterThan(-1);
    return { html, phone: html.slice(html.lastIndexOf("<ul", at)) };
}

describe("ProductOrdersTab on a phone", () => {
    it("hides the desk table below 760px, by CSS, not after hydration", () => {
        const { html } = render();
        expect(html).toMatch(/overflow-x-auto[^"]*max-\[759px\]:hidden/);
    });

    it("draws a card per order holding every column the table has", () => {
        const { phone } = render();
        expect(phone).toContain("Priya Raman");
        expect(phone).toContain("#1042");
        expect(phone).toContain("800g × 2");
        expect(phone).toContain("Hill Road");
        expect(phone).toContain(">New</div>");
        // When: the viewer's date renders a <time> for the order's moment.
        expect(phone).toContain("2026-09-27T09:00:00.000Z");
    });

    it("opens the order, the whole card the target, in a labelled list", () => {
        const { phone } = render();
        expect(phone).toContain('aria-label="Orders for Sourdough loaf"');
        expect(phone).toContain('href="/commerce/orders/o1');
        expect(phone).toContain("after:inset-0");
        expect(phone).toContain(", order #1042");
    });

    it("has no sideways scroller on the phone", () => {
        const { phone } = render();
        expect(phone).not.toContain("min-w-[");
        expect(phone).not.toContain("overflow-x-auto");
        expect(phone).not.toContain("<table");
    });
});
