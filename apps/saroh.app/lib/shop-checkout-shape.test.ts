import { describe, expect, it } from "vitest";

import {
    enquiryPagePath,
    isCheckoutOptions,
    isQuote,
    isStanding,
    problemOf,
    quoteBody,
    resultOf,
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
