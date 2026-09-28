import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { OrderReadLine } from "@/lib/orders/read";

import { RefundPanel } from "./refund-panel";

/**
 * The refund sheet as the design draws it (B8): the lines, then Why (the
 * design's reasons) beside "Or another amount", the way the money goes back,
 * and Refund — which does nothing until something is chosen.
 */
const line = (over: Partial<OrderReadLine>): OrderReadLine => ({
    id: "l1",
    productId: "p1",
    name: "Seeded loaf",
    variantTitle: null,
    sku: null,
    imageUrl: null,
    allergens: { contains: [], mayContain: [] },
    quantity: 2,
    refundedQuantity: 0,
    price: "240.00",
    ...over,
});

const noop = () => undefined;
const html = (lines: OrderReadLine[]) =>
    renderToStaticMarkup(
        <RefundPanel
            lines={lines}
            remaining={480}
            shipping={0}
            how="Back to Razorpay, in 3–5 days."
            format={(n) => `₹${n}`}
            onCancel={noop}
            onRefund={noop}
        />,
    );

describe("RefundPanel", () => {
    it("draws the lines, Why with the design's reasons, and Or another amount", () => {
        const out = html([line({})]);
        expect(out).toContain("What are you refunding?");
        expect(out).toContain("2 × Seeded loaf");
        expect(out).toContain("Why");
        expect(out).toContain("Choose a reason");
        for (const reason of [
            "Wrong item",
            "Quality",
            "Late",
            "Customer changed their mind",
            "Goodwill",
            "Other",
        ]) {
            expect(out).toContain(`>${reason}</option>`);
        }
        expect(out).toContain("Or another amount");
        expect(out).toContain('aria-label="Refund another amount, in rupees"');
        expect(out).toContain("Back to Razorpay, in 3–5 days.");
    });

    it("keeps Refund off until a line is ticked or an amount typed", () => {
        const out = html([line({})]);
        expect(out).toMatch(/<button[^>]*disabled=""[^>]*>Refund ₹0<\/button>/);
    });

    it("offers the stock choice only for units that can go back on the shelf", () => {
        // Nothing ticked yet: nothing to put back, so no Stock choice.
        expect(html([line({ returnable: 2 })])).not.toContain(
            "Put back in stock",
        );
    });
});
