import {
    packAttemptView,
    packCheckoutView,
    packOnSaleView,
} from "./customer-view";

/**
 * Buying a pack online (round-2 A11): the allow-list the customer's answers
 * are built from. Each serializer is fed a row carrying what must never
 * leave — the business, status, holder counts, drafts' pending changes —
 * and only the named fields come out.
 */

const TERMS = {
    packId: "pack_1",
    name: "10-class pack",
    credits: 10,
    validityDays: 60,
    price: "4500.00",
    currency: "INR",
};

describe("a pack on sale", () => {
    it("carries its ref, words and price, and nothing the team sees", () => {
        const row = {
            id: "pack_1",
            organizationId: "org_1",
            name: "10-class pack",
            description: "  Any class, any day.  ",
            credits: 10,
            validityDays: 60,
            price: { toString: () => "4500" },
            currency: "INR",
            status: "ACTIVE",
            pendingChanges: { price: "9" },
            revisedById: "user_1",
        };
        expect(packOnSaleView(row)).toEqual({
            ref: "pack_1",
            name: "10-class pack",
            description: "Any class, any day.",
            credits: 10,
            validityDays: 60,
            price: "4500.00",
            currency: "INR",
        });
    });

    it("reads an empty description as none", () => {
        expect(
            packOnSaleView({
                id: "p",
                name: "Pack",
                description: "   ",
                credits: 1,
                validityDays: 7,
                price: { toString: () => "100.5" },
                currency: "INR",
            }).description,
        ).toBeNull();
    });
});

describe("a started pack payment", () => {
    it("names the draft as the ref, the pack's terms and the handoff", () => {
        const payment = {
            paymentIntentId: "pi_1",
            provider: "RAZORPAY",
            providerIntentId: "order_1",
            amountCents: 450000,
            currency: "INR",
            publicKey: "rzp_test_1",
            clientParams: { razorpayOrderId: "order_1" },
        };
        expect(
            packCheckoutView({
                invoiceId: "inv_1",
                terms: TERMS,
                total: { toString: () => "4500" },
                currency: "INR",
                payment,
            }),
        ).toEqual({
            ref: "inv_1",
            pack: { name: "10-class pack", credits: 10, validityDays: 60 },
            total: "4500.00",
            currency: "INR",
            payment,
        });
    });

    it("stands as paying, bought or closed, with the expiry only once bought", () => {
        const expiresAt = new Date("2026-11-30T10:00:00.000Z");
        expect(
            packAttemptView({ status: "DRAFT", terms: TERMS, expiresAt: null }),
        ).toEqual({
            state: "paying",
            pack: { name: "10-class pack", credits: 10 },
            expiresAt: null,
        });
        expect(
            packAttemptView({ status: "PAID", terms: TERMS, expiresAt }),
        ).toEqual({
            state: "bought",
            pack: { name: "10-class pack", credits: 10 },
            expiresAt: "2026-11-30T10:00:00.000Z",
        });
        expect(
            packAttemptView({ status: "VOID", terms: TERMS, expiresAt }).state,
        ).toBe("closed");
    });
});
