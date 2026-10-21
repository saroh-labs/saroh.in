import { describe, expect, it } from "vitest";

import {
    enquiryPagePath,
    isCheckoutOptions,
    isQuote,
    isStanding,
    isStarted,
    problemOf,
    quoteBody,
    resultOf,
    savedAddressOf,
    startBody,
} from "./shop-checkout-shape";

/**
 * The site checkout's answers narrowed, refusals in the page's words, and
 * what the site's server sends on rebuilt field by field (G13).
 */

describe("what the site's server sends on", () => {
    it("rebuilds a quote from lines and the way only, dropping any price", () => {
        expect(
            quoteBody({
                lines: [
                    {
                        listingId: "l1",
                        variantId: null,
                        quantity: 2,
                        price: "1.00",
                    },
                ],
                fulfilment: "PICKUP",
                total: "1.00",
            }),
        ).toEqual({
            lines: [{ listingId: "l1", variantId: null, quantity: 2 }],
            fulfilment: "PICKUP",
        });
    });

    it("refuses a bag it can't read", () => {
        expect(quoteBody({ lines: "nope" })).toBeNull();
        expect(
            quoteBody({
                lines: [{ listingId: "l1", variantId: null, quantity: 0 }],
            }),
        ).toBeNull();
        expect(
            quoteBody({
                lines: [
                    { listingId: "../admin", variantId: null, quantity: 1 },
                ],
            }),
        ).toBeNull();
    });

    it("rebuilds a start with its key, the way and a trimmed address", () => {
        expect(
            startBody({
                lines: [{ listingId: "l1", variantId: "v1", quantity: 1 }],
                fulfilment: "LOCAL_DELIVERY",
                key: "first-try",
                address: {
                    line1: " 12 Hill Road ",
                    city: "Mumbai",
                    state: "Maharashtra",
                    postalCode: "400050",
                    organizationId: "someone-else",
                },
                amount: 1,
            }),
        ).toEqual({
            lines: [{ listingId: "l1", variantId: "v1", quantity: 1 }],
            fulfilment: "LOCAL_DELIVERY",
            key: "first-try",
            address: {
                line1: "12 Hill Road",
                city: "Mumbai",
                state: "Maharashtra",
                postalCode: "400050",
            },
        });
        expect(
            startBody({ lines: [], fulfilment: "PICKUP", key: "abcdefgh" }),
        ).toBeNull();
        expect(
            startBody({
                lines: [{ listingId: "l1", variantId: null, quantity: 1 }],
                fulfilment: "DIGITAL",
                key: "abcdefgh",
            }),
        ).toBeNull();
    });

    it("passes on a QR code's tag with a start, and drops anything else there", () => {
        const start = {
            lines: [{ listingId: "l1", variantId: null, quantity: 1 }],
            fulfilment: "PICKUP",
            key: "abcdefgh",
        };
        expect(startBody({ ...start, source: "qr-h7c" })).toEqual({
            ...start,
            source: "qr-h7c",
        });
        for (const source of ["newsletter", "qr-", 7, "cuid_of_a_row", null]) {
            // Never a reason to refuse the order: it just goes without.
            expect(startBody({ ...start, source })).toEqual(start);
        }
        // A quote writes nothing, so it never carries one.
        expect(
            quoteBody({ lines: start.lines, source: "qr-h7c" }),
        ).not.toHaveProperty("source");
    });

    it("passes on where the visit came from, a group and a label only (U15)", () => {
        const start = {
            lines: [{ listingId: "l1", variantId: null, quantity: 1 }],
            fulfilment: "PICKUP",
            key: "abcdefgh",
        };
        expect(
            startBody({
                ...start,
                visitSource: "instagram",
                visitRef: "Diwali-Post",
                visitId: "v_1",
            }),
        ).toEqual({
            ...start,
            visitSource: "instagram",
            visitRef: "diwali-post",
        });
        expect(
            startBody({
                ...start,
                visitSource: "direct",
                visitRef: "someone@example.com",
            }),
        ).toEqual({ ...start, visitSource: "direct" });
        for (const visitSource of ["facebook", 7, null, undefined]) {
            expect(
                startBody({ ...start, visitSource, visitRef: "story" }),
            ).toEqual(start);
        }
        expect(
            quoteBody({ lines: start.lines, visitSource: "google" }),
        ).not.toHaveProperty("visitSource");
    });
});

describe("the API's answers", () => {
    it("narrows the options and the quote", () => {
        expect(
            isCheckoutOptions({
                canOrder: true,
                storefront: { name: "Online" },
                currency: "INR",
                ways: [{ type: "PICKUP", label: "Pick-up", fee: null }],
            }),
        ).toBe(true);
        expect(isCheckoutOptions({ canOrder: "yes" })).toBe(false);
        expect(
            isQuote({
                currency: "INR",
                lines: [],
                ways: [],
                fulfilment: null,
                subtotal: "0.00",
                delivery: "0.00",
                total: "0.00",
                ready: false,
            }),
        ).toBe(true);
        const priced = {
            currency: "INR",
            lines: [],
            ways: [],
            fulfilment: null,
            subtotal: "0.00",
            delivery: "0.00",
            total: "0.00",
            ready: false,
        };
        // Where a pick-up is collected (UX-025).
        expect(
            isQuote({
                ...priced,
                pickup: { address: "12 Hill Road", hours: null },
            }),
        ).toBe(true);
        expect(isQuote({ ...priced, pickup: { address: 12 } })).toBe(false);
        expect(resultOf(200, { total: 5 }, isQuote)).toMatchObject({
            ok: false,
            reason: "error",
        });
    });

    it("takes each way a checkout stands, a refund being sent included", () => {
        const standing = (state: string) => ({
            orderNumber: "ORD-1",
            state,
            total: "500.00",
            currency: "INR",
            message: null,
        });
        for (const state of [
            "paying",
            "placed",
            "refunding",
            "refunded",
            "closed",
        ]) {
            expect(isStanding(standing(state))).toBe(true);
        }
        expect(isStanding(standing("lost"))).toBe(false);
    });

    it("says each refusal in the page's words", () => {
        expect(problemOf(401, {}).reason).toBe("signed-out");
        expect(problemOf(403, {}).reason).toBe("cant-order");
        // The business's payments down: said as that, not as our trouble.
        for (const reason of [
            "provider-unavailable",
            "provider-keys-refused",
        ]) {
            expect(
                problemOf(503, {
                    error: {
                        message: "Internal words",
                        details: { reason },
                    },
                }),
            ).toEqual({
                ok: false,
                reason: "payments-down",
                message:
                    "The business can't take payment online right now. Please try again later, or pay them another way.",
            });
        }
        expect(problemOf(503, {}).reason).toBe("error");
        expect(
            problemOf(409, {
                error: {
                    message: "Something in your bag has changed.",
                    details: { reason: "bag-changed" },
                },
            }).reason,
        ).toBe("bag-changed");
        expect(
            problemOf(429, {
                error: {
                    message:
                        "You have other checkouts waiting for payment. Finish one of them, or try again tomorrow.",
                },
            }),
        ).toEqual({
            ok: false,
            reason: "busy",
            message:
                "You have other checkouts waiting for payment. Finish one of them, or try again tomorrow.",
        });
        // Any other API text stays with the API.
        const other = problemOf(429, {
            error: { message: "Too many requests. Try again shortly." },
        });
        expect(other.message).not.toContain("requests");
        expect(
            problemOf(500, {
                error: { message: "Stored provider credentials are malformed" },
            }).message,
        ).not.toMatch(/credentials/);
    });
});

describe("the note for the business", () => {
    const bag = {
        lines: [{ listingId: "l1", variantId: null, quantity: 1 }],
        fulfilment: "PICKUP",
        key: "key-12345678",
    };

    it("is sent on trimmed, cut at what a note may run to, and left out when empty", () => {
        expect(startBody({ ...bag, notes: "  No nuts, please " })?.notes).toBe(
            "No nuts, please",
        );
        expect(
            (startBody({ ...bag, notes: "x".repeat(900) })?.notes as string)
                .length,
        ).toBe(500);
        expect(startBody({ ...bag, notes: "   " })).not.toHaveProperty("notes");
        expect(startBody({ ...bag, notes: 7 })).not.toHaveProperty("notes");
    });
});

describe("the facts a product page says before the bag", () => {
    const options = {
        canOrder: true,
        storefront: { name: "Hill Road" },
        currency: "INR",
        ways: [
            { type: "LOCAL_DELIVERY", label: "Local delivery", fee: "60.00" },
        ],
    };

    it("takes the location's free delivery amount, absent from an older API", () => {
        expect(isCheckoutOptions(options)).toBe(true);
        expect(
            isCheckoutOptions({ ...options, freeDeliveryOver: "999.00" }),
        ).toBe(true);
        expect(isCheckoutOptions({ ...options, freeDeliveryOver: null })).toBe(
            true,
        );
        expect(isCheckoutOptions({ ...options, freeDeliveryOver: 999 })).toBe(
            false,
        );
    });

    it("takes a line's returns rule, absent from an older API", () => {
        const line = {
            listingId: "l1",
            variantId: null,
            slug: "sourdough",
            name: "Sourdough",
            variantTitle: null,
            image: null,
            unitPrice: "250.00",
            quantity: 1,
            amount: "250.00",
            state: "ok",
            available: null,
        };
        const quote = (returns?: unknown) => ({
            currency: "INR",
            lines: [returns === undefined ? line : { ...line, returns }],
            ways: [],
            fulfilment: null,
            subtotal: "250.00",
            delivery: "0.00",
            total: "250.00",
            ready: false,
        });
        expect(isQuote(quote())).toBe(true);
        expect(isQuote(quote("Exchange within 7 days"))).toBe(true);
        expect(isQuote(quote(null))).toBe(true);
        expect(isQuote(quote(7))).toBe(false);
    });
});

describe("a returning customer's last delivery", () => {
    it("is rebuilt field by field, and null when they have had none", () => {
        expect(savedAddressOf({ address: null })).toEqual({ address: null });
        expect(
            savedAddressOf({
                address: {
                    name: "Asha Rao",
                    phone: "98450 12345",
                    line1: "12 Hill Road",
                    line2: null,
                    city: "Mumbai",
                    state: "Maharashtra",
                    postalCode: "400050",
                    orderId: "o_1",
                },
                contactId: "c_1",
            }),
        ).toEqual({
            address: {
                name: "Asha Rao",
                phone: "98450 12345",
                line1: "12 Hill Road",
                city: "Mumbai",
                state: "Maharashtra",
                postalCode: "400050",
            },
        });
    });

    it("refuses an answer that isn't one", () => {
        expect(savedAddressOf(null)).toBeNull();
        expect(savedAddressOf({})).toBeNull();
        expect(savedAddressOf({ address: "12 Hill Road" })).toBeNull();
        expect(
            savedAddressOf({ address: { line1: "12 Hill Road", city: 7 } }),
        ).toBeNull();
    });

    it("says a delivery refused for its phone in the page's words", () => {
        expect(
            problemOf(400, {
                error: {
                    message: "Add a phone number for the delivery.",
                    details: { reason: "phone", field: "address.phone" },
                },
            }),
        ).toEqual({
            ok: false,
            reason: "invalid",
            message: "Add a phone number for the delivery.",
        });
        expect(problemOf(400, {}).message).toBe(
            "Check the details and try again.",
        );
    });
});

describe("where to ask about ordering", () => {
    const section = (type: string, formId?: string) => ({
        type,
        content: formId ? { formId } : {},
    });

    it("finds the page with the enquiry form, home first", () => {
        expect(
            enquiryPagePath({
                pages: [
                    {
                        path: "/contact",
                        isHome: false,
                        sections: [section("enquiry", "f1")],
                    },
                    { path: "/", isHome: true, sections: [section("hero")] },
                ],
            }),
        ).toBe("/contact");
        expect(
            enquiryPagePath({
                pages: [
                    {
                        path: "/contact",
                        isHome: false,
                        sections: [section("enquiry", "f1")],
                    },
                    {
                        path: "/",
                        isHome: true,
                        sections: [section("enquiry", "f2")],
                    },
                ],
            }),
        ).toBe("/");
    });

    it("is none without a form behind the section", () => {
        expect(
            enquiryPagePath({
                pages: [
                    {
                        path: "/contact",
                        isHome: false,
                        sections: [section("enquiry")],
                    },
                ],
            }),
        ).toBeNull();
    });
});

describe("paying at the handover (2026-10-06)", () => {
    const lines = [{ listingId: "l1", variantId: null, quantity: 1 }];

    it("sends the choice on only when it is paying at the handover", () => {
        expect(
            startBody({
                lines,
                fulfilment: "PICKUP",
                key: "key-12345678",
                payment: "ON_HANDOVER",
            }),
        ).toMatchObject({ payment: "ON_HANDOVER" });
        for (const payment of ["ONLINE", "CASH", undefined]) {
            expect(
                startBody({
                    lines,
                    fulfilment: "PICKUP",
                    key: "key-12345678",
                    payment,
                }),
            ).not.toHaveProperty("payment");
        }
    });

    it("takes an order placed with nothing to pay, and the ways to pay a quote offers", () => {
        const order = {
            orderId: "o1",
            orderNumber: "ORD-1",
            total: "500.00",
            currency: "INR",
        };
        expect(
            isStarted({ ...order, payBy: "ON_HANDOVER", payment: null }),
        ).toBe(true);
        // Online still needs its window.
        expect(isStarted({ ...order, payBy: "ONLINE", payment: null })).toBe(
            false,
        );
        const quote = {
            currency: "INR",
            lines: [],
            ways: [],
            fulfilment: "PICKUP",
            subtotal: "0.00",
            delivery: "0.00",
            total: "0.00",
            ready: false,
        };
        expect(isQuote(quote)).toBe(true);
        expect(
            isQuote({
                ...quote,
                payments: [{ type: "ON_HANDOVER", label: "Pay at pick-up" }],
            }),
        ).toBe(true);
        expect(
            isQuote({ ...quote, payments: [{ type: "CASH", label: "Cash" }] }),
        ).toBe(false);
        expect(
            isStanding({
                orderNumber: "ORD-1",
                state: "to-pay",
                total: "500.00",
                currency: "INR",
                message: null,
            }),
        ).toBe(true);
    });

    it("says a fourth order waiting to be paid in the API's words, written for the customer", () => {
        const message =
            "You have orders waiting to be paid for when they reach you. Once one is collected or delivered, you can order again.";
        expect(problemOf(429, { error: { message } })).toEqual({
            ok: false,
            reason: "busy",
            message,
        });
    });
});

describe("a discount code in the bag (DEC-104)", () => {
    const priced = {
        currency: "INR",
        lines: [],
        ways: [],
        fulfilment: null,
        subtotal: "500.00",
        delivery: "0.00",
        total: "450.00",
        ready: false,
    };

    it("sends a tidied code on with the quote and the start, and nothing else", () => {
        expect(
            quoteBody({
                lines: [{ listingId: "l1", variantId: null, quantity: 1 }],
                discountCode: " save10 ",
            }),
        ).toEqual({
            lines: [{ listingId: "l1", variantId: null, quantity: 1 }],
            discountCode: "SAVE10",
        });
        // Something no code could be is dropped, never forwarded.
        expect(
            quoteBody({
                lines: [{ listingId: "l1", variantId: null, quantity: 1 }],
                discountCode: "<script>",
            }),
        ).toEqual({
            lines: [{ listingId: "l1", variantId: null, quantity: 1 }],
        });
        expect(
            startBody({
                lines: [{ listingId: "l1", variantId: null, quantity: 1 }],
                fulfilment: "PICKUP",
                key: "abcdefgh",
                discountCode: "SAVE10",
            }),
        ).toMatchObject({ discountCode: "SAVE10" });
    });

    it("reads a quote's applied or refused code, and one from an older API", () => {
        expect(
            isQuote({
                ...priced,
                discount: { code: "SAVE10", applied: true, amount: "50.00" },
            }),
        ).toBe(true);
        expect(
            isQuote({
                ...priced,
                discount: {
                    code: "OLD",
                    applied: false,
                    reason: "EXPIRED",
                    message: "OLD has ended.",
                },
            }),
        ).toBe(true);
        expect(isQuote({ ...priced, discount: null })).toBe(true);
        expect(isQuote(priced)).toBe(true);
        expect(
            isQuote({ ...priced, discount: { code: "X", applied: "yes" } }),
        ).toBe(false);
    });

    it("reads a quote's free delivery over an amount, and one from an older API", () => {
        expect(
            isQuote({
                ...priced,
                freeDelivery: { over: "999.00", short: "120.00" },
            }),
        ).toBe(true);
        expect(
            isQuote({
                ...priced,
                freeDelivery: { over: "999.00", short: null },
            }),
        ).toBe(true);
        expect(isQuote({ ...priced, freeDelivery: null })).toBe(true);
        expect(isQuote({ ...priced, freeDelivery: { over: 999 } })).toBe(false);
    });

    it("says a code that stopped applying in the checkout's words", () => {
        expect(
            problemOf(409, {
                error: {
                    message: "SAVE10 has ended.",
                    details: { reason: "bag-changed", field: "discountCode" },
                },
            }),
        ).toEqual({
            ok: false,
            reason: "bag-changed",
            message: "SAVE10 has ended.",
        });
    });
});

describe("GST on the quote (the business's price mode)", () => {
    const adds = {
        mode: "ADDED",
        rate: "18",
        listCents: 100000,
        gstCents: 18000,
        payCents: 118000,
    };
    const line = {
        listingId: "l1",
        variantId: null,
        slug: "sourdough",
        name: "Sourdough",
        variantTitle: null,
        image: null,
        unitPrice: "1180.00",
        quantity: 1,
        amount: "1180.00",
        state: "ok",
        available: null,
    };
    const quote = (lineGst: unknown, gst: unknown) => ({
        currency: "INR",
        lines: [
            { ...line, ...(lineGst === undefined ? {} : { gst: lineGst }) },
        ],
        ways: [],
        fulfilment: null,
        subtotal: "1180.00",
        delivery: "0.00",
        total: "1180.00",
        ready: true,
        ...(gst === undefined ? {} : { gst }),
    });

    it("reads a quote with it, with none, and from an API that sends nothing", () => {
        expect(isQuote(quote(adds, "180.00"))).toBe(true);
        expect(isQuote(quote(null, null))).toBe(true);
        expect(isQuote(quote(undefined, undefined))).toBe(true);
    });
});
