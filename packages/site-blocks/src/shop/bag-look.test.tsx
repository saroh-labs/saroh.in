import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { CheckoutQuote, QuoteLine } from "./api";
import { BagLines } from "./bag-lines";
import type { OrderConfirmationData } from "./order-confirmation";
import { OrderConfirmation } from "./order-confirmation";
import { SheetFrame } from "./sheet-frame";

/**
 * How the bag, its sheets and the order page look (starter audit, 12 Oct
 * 2026): no empty photo squares, a placed order that reads as a success,
 * and a failed read that can be asked for again. What they do is in
 * `shop.test.tsx` and `order-confirmation.test.tsx`.
 */

const line = (name: string, image: QuoteLine["image"] = null): QuoteLine => ({
    listingId: `listing-${name}`,
    variantId: null,
    slug: name,
    name,
    variantTitle: null,
    image,
    unitPrice: "250.00",
    quantity: 1,
    amount: "250.00",
    state: "ok",
    available: null,
});

const quoteOf = (lines: QuoteLine[]): CheckoutQuote => ({
    currency: "INR",
    lines,
    ways: [],
    fulfilment: null,
    subtotal: "500.00",
    delivery: "0.00",
    total: "500.00",
    ready: true,
});

describe("the bag's lines", () => {
    it("draws no photo column for a bag with no photos at all", () => {
        const { container } = render(
            <BagLines
                site="site-1"
                quote={quoteOf([line("Crate"), line("Pallet")])}
                caps={{}}
                onRemoved={() => undefined}
            />,
        );
        expect(container.querySelector("img")).toBeNull();
        expect(container.querySelector("[data-line-blank]")).toBeNull();
        // Each line still says what it is, and can be changed.
        expect(screen.getByText("Crate")).toBeVisible();
        expect(
            screen.getByRole("button", { name: "Remove Pallet" }),
        ).toBeVisible();
    });

    it("keeps a quiet square beside a line with no photo when another has one, so the names line up", () => {
        const { container } = render(
            <BagLines
                site="site-1"
                quote={quoteOf([
                    line("Sourdough", {
                        url: "https://img.test/loaf.jpg",
                        alt: "A loaf",
                    }),
                    line("Crate"),
                ])}
                caps={{}}
                onRemoved={() => undefined}
            />,
        );
        const photo = container.querySelector("img");
        // Its room is kept before it arrives.
        expect(photo).toHaveAttribute("width", "56");
        expect(photo).toHaveAttribute("height", "56");
        const blank = container.querySelectorAll("[data-line-blank]");
        expect(blank).toHaveLength(1);
        expect(blank[0]).toHaveAttribute("aria-hidden", "true");
    });
});

describe("a sheet that says it worked", () => {
    it("opens on a tick in the site's accent, over its title", () => {
        render(
            <SheetFrame
                title="Order placed"
                mark="done"
                onClose={() => undefined}
            >
                <p>See your order</p>
            </SheetFrame>,
        );
        const dialog = screen.getByRole("dialog", { name: "Order placed" });
        const mark = dialog.querySelector("[data-sheet-mark]");
        expect(mark).toHaveAttribute("aria-hidden", "true");
        expect(mark?.className).toContain("bg-site-accent");
        // The close button is still there, by name.
        expect(screen.getByRole("button", { name: "Close" })).toBeVisible();
    });

    it("draws no tick on any other sheet", () => {
        render(
            <SheetFrame title="Your bag" onClose={() => undefined}>
                <p>Lines</p>
            </SheetFrame>,
        );
        expect(document.querySelector("[data-sheet-mark]")).toBeNull();
    });
});

const ORDER: OrderConfirmationData = {
    orderNumber: "ORD-019",
    placedAt: "2026-09-29T08:02:00.000Z",
    currency: "INR",
    lines: [
        { name: "Sourdough", variant: "Large", quantity: 2, amount: "500.00" },
    ],
    subtotal: "500.00",
    delivery: null,
    discount: null,
    total: "500.00",
    fulfilment: {
        type: "PICKUP",
        label: "Pick-up",
        pickup: { name: "Hill Road", address: "12 Hill Road, Bandra" },
        deliverTo: null,
    },
    refunded: false,
    toPay: null,
};

describe("the order page as a moment", () => {
    it("opens a placed order on a mark in the site's accent", () => {
        const { container } = render(
            <OrderConfirmation
                lookup={{ ok: true, order: ORDER }}
                businessName="Rye & Co."
            />,
        );
        const mark = container.querySelector("[data-order-mark]");
        expect(mark).toHaveAttribute("aria-hidden", "true");
        expect(mark?.className).toContain("bg-site-accent");
        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    });

    it("draws no mark on an order that was refunded", () => {
        const { container } = render(
            <OrderConfirmation
                lookup={{ ok: true, order: { ...ORDER, refunded: true } }}
                businessName="Rye & Co."
            />,
        );
        expect(container.querySelector("[data-order-mark]")).toBeNull();
    });

    it("says a failed read as an alert and offers Try again on its own address, ahead of the way back", () => {
        render(
            <OrderConfirmation
                lookup={{ ok: false, reason: "unavailable" }}
                businessName="Rye & Co."
                retryHref="/shop/order/ord_1"
            />,
        );
        expect(screen.getByRole("alert")).toHaveTextContent(
            "We couldn't load your order",
        );
        const again = screen.getByRole("link", { name: "Try again" });
        expect(again).toHaveAttribute("href", "/shop/order/ord_1");
        expect(again.className).toContain("bg-site-accent");
        expect(
            screen.getByRole("link", { name: "Back to the shop" }).className,
        ).not.toContain("bg-site-accent");
    });

    it.each(["missing", "signed-out"] as const)(
        "offers no Try again when the order is %s: asking again wouldn't mend it",
        (reason) => {
            render(
                <OrderConfirmation
                    lookup={{ ok: false, reason }}
                    businessName="Rye & Co."
                    retryHref="/shop/order/ord_1"
                />,
            );
            expect(
                screen.queryByRole("link", { name: "Try again" }),
            ).toBeNull();
            expect(screen.queryByRole("alert")).toBeNull();
        },
    );
});
