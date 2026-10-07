import { describe, expect, it } from "vitest";

import type { CheckoutQuote, QuoteLine } from "./api";
import { holdReason, overStock, payWords, stockNotice } from "./bag-sheet";

/**
 * The line above the bag's button (#837): it says how the customer pays only
 * once the quote is back, so a shop that takes money at the handover never
 * first claims "You pay online" while prices load.
 */
describe("payWords", () => {
    it("says nothing about paying before the quote is back", () => {
        expect(payWords(null)).toBeNull();
    });

    it("says online once the quote offers it", () => {
        expect(payWords({ type: "ONLINE", label: "Pay online" })).toMatch(
            /^You pay online in a secure window/,
        );
    });

    it("says at the handover once the quote offers only that", () => {
        expect(
            payWords({ type: "ON_HANDOVER", label: "Pay when you collect" }),
        ).toBe(
            "You'll pay when you collect your order. Your order is placed now.",
        );
    });
});

const line = (over: Partial<QuoteLine> = {}): QuoteLine => ({
    listingId: "l-1",
    variantId: null,
    slug: "kurta",
    name: "Linen kurta",
    variantTitle: null,
    image: null,
    unitPrice: "100.00",
    quantity: 2,
    amount: "200.00",
    state: "ok",
    available: null,
    ...over,
});

const quote = (over: Partial<CheckoutQuote> = {}): CheckoutQuote => ({
    currency: "INR",
    lines: [line()],
    ways: [{ type: "PICKUP", label: "Pick-up", fee: null }],
    fulfilment: "PICKUP",
    subtotal: "200.00",
    delivery: "0.00",
    total: "200.00",
    ready: true,
    ...over,
});

/** The bag never asks for more than is left, and says why (UX-058). */
describe("overStock and stockNotice", () => {
    it("caps a line asking for more than is left, and says so", () => {
        const over = overStock([line({ state: "short", available: 1 })]);
        expect(over.map((o) => o.left)).toEqual([1]);
        expect(stockNotice(over)).toBe(
            "Only 1 left — we've set your bag to 1.",
        );
    });

    it("leaves a line that fits, or one sold out, alone", () => {
        expect(
            overStock([line(), line({ state: "sold-out", available: 0 })]),
        ).toEqual([]);
        expect(stockNotice([])).toBeNull();
    });

    it("names each line when several are capped", () => {
        const over = overStock([
            line({ state: "short", available: 1, variantTitle: "M" }),
            line({
                listingId: "l-2",
                name: "Tote",
                state: "short",
                available: 2,
                quantity: 3,
            }),
        ]);
        expect(stockNotice(over)).toBe(
            "Fewer are left than you asked for — we've set Linen kurta (M) to 1, Tote to 2.",
        );
    });
});

describe("holdReason", () => {
    const base = { way: "PICKUP" as const, addressOk: true, payable: true };

    it("says nothing while the quote is on its way, or when it can be placed", () => {
        expect(holdReason({ ...base, quote: null })).toBeNull();
        expect(holdReason({ ...base, quote: quote() })).toBeNull();
    });

    it("says why the button is held", () => {
        expect(
            holdReason({
                ...base,
                quote: quote({
                    lines: [line({ state: "sold-out", available: 0 })],
                }),
            }),
        ).toBe("Take out what's sold out to continue.");
        expect(
            holdReason({
                ...base,
                quote: quote({ lines: [line({ state: "gone" })] }),
            }),
        ).toBe("Take out what's no longer sold to continue.");
        expect(
            holdReason({
                ...base,
                way: null,
                quote: quote({ fulfilment: null }),
            }),
        ).toBe("Choose how your order reaches you.");
        expect(holdReason({ ...base, addressOk: false, quote: quote() })).toBe(
            "Add the address to deliver to.",
        );
    });
});
