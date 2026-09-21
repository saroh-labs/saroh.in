import type { OrderView, RedeemableDiscount } from "./redeem";
import { redeem } from "./redeem";

const NOW = new Date("2026-09-21T12:00:00.000Z");

const code = (over: Partial<RedeemableDiscount> = {}): RedeemableDiscount => ({
    kind: "PERCENTAGE",
    percentBps: 1500,
    amountCents: null,
    currency: null,
    appliesTo: "BUSINESS",
    storeIds: [],
    categoryIds: [],
    productIds: [],
    startsAt: null,
    endsAt: null,
    usageLimit: null,
    used: 0,
    ...over,
});

const order = (over: Partial<OrderView> = {}): OrderView => ({
    storeId: "st_1",
    currency: "INR",
    lines: [
        {
            productId: "p_1",
            categoryId: "c_bread",
            unitCents: 1000,
            quantity: 2,
        },
        {
            productId: "p_2",
            categoryId: "c_coffee",
            unitCents: 2500,
            quantity: 1,
        },
    ],
    ...over,
});

describe("redeem", () => {
    it("takes 15% off the whole order for a business-wide code", () => {
        // 2000 + 2500 = 4500 → 675
        expect(redeem(code(), order(), NOW)).toEqual({
            ok: true,
            amountCents: 675,
        });
    });

    it("takes the percentage of the named product's lines only", () => {
        const r = redeem(
            code({ appliesTo: "PRODUCT", productIds: ["p_2"] }),
            order(),
            NOW,
        );
        expect(r).toEqual({ ok: true, amountCents: 375 });
    });

    it("matches every line in a named collection", () => {
        const r = redeem(
            code({ appliesTo: "COLLECTION", categoryIds: ["c_bread"] }),
            order(),
            NOW,
        );
        expect(r).toEqual({ ok: true, amountCents: 300 });
    });

    it("rounds the summed subtotal once, not each line", () => {
        // 10% of 5 and of 5: per line 0.5 + 0.5 → 1 + 1 = 2 (half up each);
        // summed: 10% of 10 = 1. The rule is the summed one.
        const r = redeem(
            code({ percentBps: 1000 }),
            order({
                lines: [
                    {
                        productId: "a",
                        categoryId: null,
                        unitCents: 5,
                        quantity: 1,
                    },
                    {
                        productId: "b",
                        categoryId: null,
                        unitCents: 5,
                        quantity: 1,
                    },
                ],
            }),
            NOW,
        );
        expect(r).toEqual({ ok: true, amountCents: 1 });
    });

    it("rounds half a cent up", () => {
        // 12.5% of 4 cents = 0.5 → 1
        const r = redeem(
            code({ percentBps: 1250 }),
            order({
                lines: [
                    {
                        productId: "a",
                        categoryId: null,
                        unitCents: 4,
                        quantity: 1,
                    },
                ],
            }),
            NOW,
        );
        expect(r).toEqual({ ok: true, amountCents: 1 });
    });

    it("never takes more than the eligible part for a fixed amount", () => {
        const r = redeem(
            code({
                kind: "FIXED_AMOUNT",
                percentBps: null,
                amountCents: 10_000,
                currency: "INR",
                appliesTo: "PRODUCT",
                productIds: ["p_1"],
            }),
            order(),
            NOW,
        );
        expect(r).toEqual({ ok: true, amountCents: 2000 });
    });

    it("refuses a storefront outside the code's reach", () => {
        const r = redeem(
            code({ appliesTo: "STOREFRONT", storeIds: ["st_other"] }),
            order(),
            NOW,
        );
        expect(r).toEqual({ ok: false, reason: "STOREFRONT" });
    });

    it("honours a storefront inside it, on every line", () => {
        const r = redeem(
            code({ appliesTo: "STOREFRONT", storeIds: ["st_other", "st_1"] }),
            order(),
            NOW,
        );
        expect(r).toEqual({ ok: true, amountCents: 675 });
    });

    it("refuses a storefront code whose storefronts were all deleted — it never widens", () => {
        const r = redeem(
            code({ appliesTo: "STOREFRONT", storeIds: [] }),
            order(),
            NOW,
        );
        expect(r).toEqual({ ok: false, reason: "STOREFRONT" });
    });

    it("refuses a fixed amount in another currency", () => {
        const r = redeem(
            code({
                kind: "FIXED_AMOUNT",
                percentBps: null,
                amountCents: 500,
                currency: "GBP",
            }),
            order(),
            NOW,
        );
        expect(r).toEqual({ ok: false, reason: "CURRENCY" });
    });

    it("refuses when no line matches, rather than taking nothing off", () => {
        const r = redeem(
            code({ appliesTo: "PRODUCT", productIds: ["p_9"] }),
            order(),
            NOW,
        );
        expect(r).toEqual({ ok: false, reason: "NO_MATCH" });
    });

    it.each([
        ["SCHEDULED", { startsAt: new Date("2026-10-01T00:00:00Z") }, 0],
        ["EXPIRED", { endsAt: new Date("2026-09-01T00:00:00Z") }, 0],
        ["EXHAUSTED", { usageLimit: 3 }, 3],
    ] as const)("refuses a code that is %s", (reason, window, used) => {
        expect(redeem(code({ ...window, used }), order(), NOW)).toEqual({
            ok: false,
            reason,
        });
    });
});
