import { describe, expect, it } from "vitest";

import type { CheckoutQuote, QuoteLine } from "./api";
import { returnsLines } from "./bag-lines";
import {
    freeDeliveryNote,
    holdReason,
    overStock,
    payWords,
    placeLabel,
    stockNotice,
} from "./bag-sheet";
import { cleanCode, codeSettled } from "./code-field";

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
            "Only 1 left, so we've set your bag to 1.",
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
            "Fewer are left than you asked for, so we've set Linen kurta (M) to 1, Tote to 2.",
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

describe("the bag's discount code (DEC-104)", () => {
    it("tidies a code as the shop stores it, and refuses what can't be one", () => {
        expect(cleanCode("  save10 ")).toBe("SAVE10");
        expect(cleanCode("")).toBeNull();
        expect(cleanCode("two words")).toBeNull();
        expect(cleanCode("X".repeat(33))).toBeNull();
    });

    it("waits for the quote that judged the code, and not on an older API", () => {
        const base = {
            currency: "INR",
            lines: [],
            ways: [],
            fulfilment: null,
            subtotal: "0.00",
            delivery: "0.00",
            total: "0.00",
            ready: false,
        };
        expect(codeSettled(null, "SAVE10")).toBe(false);
        expect(codeSettled({ ...base, discount: null }, "SAVE10")).toBe(false);
        expect(
            codeSettled(
                {
                    ...base,
                    discount: { code: "SAVE10", applied: true, amount: "5.00" },
                },
                "SAVE10",
            ),
        ).toBe(true);
        expect(codeSettled({ ...base, discount: null }, null)).toBe(true);
        // An API before site codes never answers for one.
        expect(codeSettled(base, "SAVE10")).toBe(true);
    });
});

/**
 * The location's "Free delivery over" under the bag's delivery row: a nudge
 * while the items are under it, a plain "free" once they reach it, and
 * nothing for Pick-up or a shop with no amount.
 */
describe("freeDeliveryNote", () => {
    const ways = (local: string | null, shipping: string | null) =>
        [
            { type: "PICKUP", label: "Pick-up", fee: null },
            { type: "LOCAL_DELIVERY", label: "Local delivery", fee: local },
            { type: "SHIPPING", label: "Shipping", fee: shipping },
        ] satisfies CheckoutQuote["ways"];

    it("says how much more makes delivery free while the bag is under it", () => {
        const under = quote({
            ways: ways("60.00", "120.00"),
            freeDelivery: { over: "999.00", short: "120.00" },
        });
        expect(freeDeliveryNote(under, "LOCAL_DELIVERY")).toBe(
            "Add ₹120 more for free delivery.",
        );
        // Before a way is chosen, too.
        expect(freeDeliveryNote(under, null)).toBe(
            "Add ₹120 more for free delivery.",
        );
    });

    it("says delivery is free once the bag reaches it", () => {
        const reached = quote({
            ways: ways(null, null),
            freeDelivery: { over: "999.00", short: null },
        });
        expect(freeDeliveryNote(reached, "SHIPPING")).toBe(
            "Free delivery on orders of ₹999 or more.",
        );
        expect(freeDeliveryNote(reached, null)).toBeNull();
    });

    it("says nothing for Pick-up, with no amount, or for a way with no fee", () => {
        const under = quote({
            ways: ways(null, "120.00"),
            freeDelivery: { over: "999.00", short: "120.00" },
        });
        expect(freeDeliveryNote(under, "PICKUP")).toBeNull();
        expect(freeDeliveryNote(under, "LOCAL_DELIVERY")).toBeNull();
        expect(
            freeDeliveryNote(
                quote({ ways: ways("60.00", null), freeDelivery: null }),
                "LOCAL_DELIVERY",
            ),
        ).toBeNull();
        // An API before free delivery sends nothing.
        expect(
            freeDeliveryNote(quote({ ways: ways("60.00", null) }), null),
        ).toBeNull();
    });
});

/**
 * The bag's button says what pressing it does. Signed out, the email code
 * is the last step: an order paid at the handover is placed straight after
 * it, so the button never reads a bare "Continue".
 */
describe("placeLabel", () => {
    const base = { busy: false, total: "₹560" };

    it("says Place order to someone signed in, however it is paid", () => {
        expect(placeLabel({ ...base, signedIn: true, pay: "ONLINE" })).toBe(
            "Place order · ₹560",
        );
        expect(
            placeLabel({ ...base, signedIn: true, pay: "ON_HANDOVER" }),
        ).toBe("Place order · ₹560");
    });

    it("signed out, says the order is placed when nothing is paid online", () => {
        expect(
            placeLabel({ ...base, signedIn: false, pay: "ON_HANDOVER" }),
        ).toBe("Sign in and place order · ₹560");
    });

    it("signed out, says it leads to paying when it is paid online", () => {
        expect(placeLabel({ ...base, signedIn: false, pay: "ONLINE" })).toBe(
            "Sign in and pay · ₹560",
        );
    });

    it("promises neither before the quote says how it is paid, and drops the dot without a total", () => {
        expect(
            placeLabel({ busy: false, total: "", signedIn: false, pay: null }),
        ).toBe("Sign in to order");
        expect(
            placeLabel({ busy: false, total: "", signedIn: true, pay: null }),
        ).toBe("Place order");
    });

    it("says it is starting while a checkout starts", () => {
        expect(
            placeLabel({ ...base, busy: true, signedIn: false, pay: "ONLINE" }),
        ).toBe("Starting…");
    });

    it("never says Continue", () => {
        for (const signedIn of [true, false]) {
            for (const pay of ["ONLINE", "ON_HANDOVER", null] as const) {
                expect(placeLabel({ ...base, signedIn, pay })).not.toMatch(
                    /continue/i,
                );
            }
        }
    });
});

/** The returns rule above the bag's button: what the product pages say. */
describe("returnsLines", () => {
    it("says one rule once when every line shares it", () => {
        expect(
            returnsLines([
                line({ returns: "Exchange within 7 days" }),
                line({
                    listingId: "l-2",
                    name: "Cotton scarf",
                    returns: " Exchange within 7 days ",
                }),
            ]),
        ).toEqual(["Returns: Exchange within 7 days"]);
    });

    it("names the products a rule covers when the bag holds more than one, or some have none", () => {
        expect(
            returnsLines([
                line({ returns: "Exchange within 7 days" }),
                line({
                    listingId: "l-2",
                    name: "Cotton scarf",
                    returns: "No returns on sale items",
                }),
                line({ listingId: "l-3", name: "Tote bag", returns: null }),
            ]),
        ).toEqual([
            "Returns for Linen kurta: Exchange within 7 days",
            "Returns for Cotton scarf: No returns on sale items",
        ]);
    });

    it("says nothing with no rule, and nothing for a line no longer sold", () => {
        expect(returnsLines([line(), line({ returns: " " })])).toEqual([]);
        expect(
            returnsLines([line({ state: "gone", returns: "Old rule" })]),
        ).toEqual([]);
    });
});
