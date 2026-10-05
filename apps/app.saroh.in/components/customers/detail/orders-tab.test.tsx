import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { DetailOrder } from "@/lib/customer-workspace/detail";

import { OrdersTab } from "./orders-tab";

/**
 * Customer detail's Orders tab on a phone (audit T5): the same card as the
 * Orders list below 760px, where it used to scroll a 560px table sideways.
 */

const NOW = new Date("2026-09-29T10:00:00Z");

const order: DetailOrder = {
    id: "o1",
    number: "ORD-001",
    placedAt: "2026-09-27T09:00:00Z",
    status: "CONFIRMED",
    paymentStatus: "PAID",
    itemCount: 1,
    items: [
        {
            productId: "p1",
            name: "Sourdough loaf",
            variant: "800g",
            quantity: 2,
        },
    ],
    fulfilmentType: "PICKUP",
    stage: "NEW",
    delivery: null,
    total: "960.00",
    currency: "INR",
    via: { customerId: "sc1", storefront: { id: "s1", name: "Hill Road" } },
};

function render(rows: DetailOrder[], filter: "all" | "open" | "past" = "all") {
    const html = renderToStaticMarkup(
        <OrdersTab
            rows={rows}
            count={rows.length}
            filter={filter}
            onFilter={() => undefined}
            timeZone="Asia/Kolkata"
            now={NOW}
        />,
    );
    const at = html.indexOf("min-[760px]:hidden");
    expect(at).toBeGreaterThan(-1);
    return { html, phone: html.slice(html.lastIndexOf("<", at)) };
}

describe("Customer OrdersTab on a phone", () => {
    it("hides the desk table below 760px, by CSS", () => {
        const { html } = render([order]);
        expect(html).toMatch(/overflow-x-auto[^"]*max-\[759px\]:hidden/);
    });

    it("draws a card holding what, total, number, status, when and where", () => {
        const { phone } = render([order]);
        expect(phone).toContain('aria-label="Their orders"');
        expect(phone).toContain("Sourdough loaf, 800g × 2");
        expect(phone).toContain("960");
        expect(phone).toContain("#ORD-001");
        expect(phone).toContain("Hill Road");
        expect(phone).toContain('href="/commerce/orders/o1"');
        expect(phone).toContain("after:inset-0");
    });

    it("has no sideways scroller on the phone", () => {
        const { phone } = render([order]);
        expect(phone).not.toContain("min-w-[");
        expect(phone).not.toContain("overflow-x-auto");
    });

    it("says so when the filter leaves nothing, on the phone too", () => {
        const { phone } = render([{ ...order, status: "CANCELLED" }], "open");
        expect(phone).toContain("Nothing open — every order is done.");
        expect(phone).not.toContain("<ul");
    });
});
