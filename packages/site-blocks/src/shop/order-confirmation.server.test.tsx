// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { OrderConfirmationData } from "./order-confirmation";
import { OrderConfirmation } from "./order-confirmation";

/**
 * The order confirmation is a server page on a merchant's site
 * (`/shop/order/[orderId]`). On the server, a function exported from a
 * "use client" module is only a client reference, and calling it throws
 * "Attempted to call formatAmount() from the server" — which took the page
 * down for every buyer (UX-001).
 *
 * Here every function the client modules it could reach for export is made
 * to throw the way the server does, then the page is rendered to HTML in
 * Node: if it calls one again, this fails.
 */
const { asServerSees } = vi.hoisted(() => ({
    asServerSees: async (load: () => Promise<Record<string, unknown>>) => {
        const real = await load();
        return Object.fromEntries(
            Object.entries(real).map(([name, value]) => [
                name,
                typeof value === "function" && /^[a-z]/.test(name)
                    ? () => {
                          throw new Error(
                              `Attempted to call ${name}() from the server`,
                          );
                      }
                    : value,
            ]),
        );
    },
}));
vi.mock("../product/product-page", () =>
    asServerSees(() => vi.importActual("../product/product-page")),
);
vi.mock("./bag-sheet", () =>
    asServerSees(() => vi.importActual("./bag-sheet")),
);
vi.mock("./checkout-sheet", () =>
    asServerSees(() => vi.importActual("./checkout-sheet")),
);

const ORDER: OrderConfirmationData = {
    orderNumber: "ORD-042",
    placedAt: "2026-09-29T08:02:00.000Z",
    currency: "INR",
    lines: [
        { name: "Test loaf", variant: null, quantity: 2, amount: "120.50" },
    ],
    subtotal: "241.00",
    delivery: "40.00",
    discount: null,
    total: "281.00",
    fulfilment: {
        type: "DELIVERY",
        label: "Delivery",
        pickup: null,
        deliverTo: { name: "Asha", lines: ["1 Test Street"] },
    },
    refunded: false,
    toPay: null,
};

describe("OrderConfirmation rendered on the server (UX-001)", () => {
    it("renders a paid online order with its money formatted", () => {
        const html = renderToStaticMarkup(
            <OrderConfirmation
                lookup={{ ok: true, order: ORDER }}
                businessName="Test Bakery"
            />,
        );
        expect(html).toContain("Order ORD-042");
        expect(html).toContain("₹241");
        expect(html).toContain("₹120.50");
        expect(html).toContain("₹281");
    });

    it("renders a pay-on-collection order", () => {
        const html = renderToStaticMarkup(
            <OrderConfirmation
                lookup={{
                    ok: true,
                    order: {
                        ...ORDER,
                        delivery: null,
                        total: "241.00",
                        toPay: "Pay when you collect",
                        fulfilment: {
                            type: "PICKUP",
                            label: "Pick-up",
                            pickup: { name: "Front counter", address: null },
                            deliverTo: null,
                        },
                    },
                }}
                businessName="Test Bakery"
            />,
        );
        expect(html).toContain("To pay when you collect");
        expect(html).toContain("Front counter");
    });
});
