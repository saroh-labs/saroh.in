import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { OrderConfirmationData } from "./order-confirmation";
import { OrderConfirmation, orderConfirmationHref } from "./order-confirmation";

/**
 * The order confirmation on a merchant's site (round-2 P4): the number,
 * what was bought, the money and how it reaches them; back to the shop,
 * and to their Orders only when the account area serves. Never a receipt
 * email that wasn't sent.
 */

const ORDER: OrderConfirmationData = {
    orderNumber: "ORD-019",
    placedAt: "2026-09-29T08:02:00.000Z",
    currency: "INR",
    lines: [
        { name: "Sourdough", variant: "Large", quantity: 2, amount: "500.00" },
        { name: "Rye loaf", variant: null, quantity: 1, amount: "180.00" },
    ],
    subtotal: "680.00",
    delivery: null,
    discount: null,
    total: "680.00",
    fulfilment: {
        type: "PICKUP",
        label: "Pick-up",
        pickup: { name: "Hill Road", address: "12 Hill Road, Bandra" },
        deliverTo: null,
    },
    refunded: false,
    toPay: null,
};

describe("OrderConfirmation (P4)", () => {
    it("says an order paid at the handover is placed and still to pay", () => {
        render(
            <OrderConfirmation
                lookup={{
                    ok: true,
                    order: { ...ORDER, toPay: "Pay when you collect" },
                }}
                businessName="Rye & Co."
            />,
        );
        expect(
            screen.getByRole("heading", {
                level: 1,
                name: "Thank you — your order is placed",
            }),
        ).toBeTruthy();
        expect(
            screen.getByText(
                "You'll pay when you collect your order. Rye & Co. will be in touch when it's ready.",
            ),
        ).toBeTruthy();
        expect(
            screen.getByText("To pay when you collect").nextElementSibling
                ?.textContent,
        ).toBe("₹680");
        expect(screen.queryByText("Paid")).toBeNull();
    });

    it("says when the pick-up place is open (UX-025)", () => {
        render(
            <OrderConfirmation
                lookup={{
                    ok: true,
                    order: {
                        ...ORDER,
                        fulfilment: {
                            ...ORDER.fulfilment,
                            pickup: {
                                name: "Hill Road",
                                address: "12 Hill Road, Bandra",
                                hours: "Mon–Sat 10:00–19:00, Sun closed",
                            },
                        },
                    },
                }}
                businessName="Rye & Co."
            />,
        );
        expect(
            screen.getByText("Open Mon–Sat 10:00–19:00, Sun closed"),
        ).toBeTruthy();
    });

    it("shows the order: its number, lines, total and where to pick it up", () => {
        render(
            <OrderConfirmation
                lookup={{ ok: true, order: ORDER }}
                businessName="Rye & Co."
            />,
        );
        expect(
            screen.getByRole("heading", {
                level: 1,
                name: "Thank you — your order is placed",
            }),
        ).toBeTruthy();
        expect(screen.getByText("Order ORD-019")).toBeTruthy();
        expect(screen.getByText("Sourdough")).toBeTruthy();
        expect(screen.getByText("Large · Qty 2")).toBeTruthy();
        expect(screen.getByText("Qty 1")).toBeTruthy();
        expect(screen.getByText("Paid").nextElementSibling?.textContent).toBe(
            "₹680",
        );
        expect(
            screen.getByRole("heading", { name: "Pick up from" }),
        ).toBeTruthy();
        expect(screen.getByText("12 Hill Road, Bandra")).toBeTruthy();
        // No receipt email is sent when a site order is placed.
        expect(screen.queryByText(/emailed/i)).toBeNull();
        // Back to the shop; no Orders link without the account area.
        expect(
            screen.getByRole("link", { name: "Back to the shop" }),
        ).toHaveAttribute("href", "/shop");
        expect(screen.queryByRole("link", { name: /your orders/i })).toBeNull();
    });

    it("says where a delivery goes, and its fee", () => {
        render(
            <OrderConfirmation
                lookup={{
                    ok: true,
                    order: {
                        ...ORDER,
                        delivery: "60.00",
                        total: "740.00",
                        fulfilment: {
                            type: "LOCAL_DELIVERY",
                            label: "Local delivery",
                            pickup: null,
                            deliverTo: {
                                name: "Asha Rao",
                                lines: [
                                    "Flat 4, Sea View",
                                    "Mumbai, Maharashtra 400050",
                                ],
                            },
                        },
                    },
                }}
                businessName="Rye & Co."
            />,
        );
        expect(
            screen.getByRole("heading", { name: "Local delivery to" }),
        ).toBeTruthy();
        expect(screen.getByText("Asha Rao")).toBeTruthy();
        expect(screen.getByText("Mumbai, Maharashtra 400050")).toBeTruthy();
        expect(
            screen.getByText("Local delivery").nextElementSibling?.textContent,
        ).toBe("₹60");
    });

    it("links to their Orders when the account area serves", () => {
        render(
            <OrderConfirmation
                lookup={{ ok: true, order: ORDER }}
                businessName="Rye & Co."
                ordersHref="/account/orders?order=ord_1"
            />,
        );
        expect(
            screen.getByRole("link", { name: "See it in your orders" }),
        ).toHaveAttribute("href", "/account/orders?order=ord_1");
    });

    it("says a later refund", () => {
        render(
            <OrderConfirmation
                lookup={{ ok: true, order: { ...ORDER, refunded: true } }}
                businessName="Rye & Co."
            />,
        );
        expect(
            screen.getByRole("heading", {
                level: 1,
                name: "This order was refunded",
            }),
        ).toBeTruthy();
        expect(screen.getByText("Paid, then refunded")).toBeTruthy();
    });

    it.each([
        ["signed-out", "Sign in to see your order"],
        ["missing", "We couldn't find that order"],
        ["unavailable", "We couldn't load your order"],
    ] as const)("says what went wrong when %s", (reason, title) => {
        render(
            <OrderConfirmation
                lookup={{ ok: false, reason }}
                businessName="Rye & Co."
            />,
        );
        expect(
            screen.getByRole("heading", { level: 1, name: title }),
        ).toBeTruthy();
        expect(
            screen.getByRole("link", { name: "Back to the shop" }),
        ).toHaveAttribute("href", "/shop");
    });

    it("says who sold a placed order, in the business's legal name (DEC-121)", () => {
        render(
            <OrderConfirmation
                lookup={{ ok: true, order: ORDER }}
                businessName="Rye & Co."
                soldBy="Sold by Rye Foods LLP"
            />,
        );
        expect(screen.getByText("Sold by Rye Foods LLP")).toHaveClass(
            "text-site-muted",
        );
        expect(document.body.textContent).not.toMatch(/responsible/);
    });

    it("keeps the customer on the business's own site", () => {
        expect(orderConfirmationHref("ord_1")).toBe("/shop/order/ord_1");
        expect(orderConfirmationHref("a/b")).toBe("/shop/order/a%2Fb");
    });
});
