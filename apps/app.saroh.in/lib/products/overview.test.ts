import { describe, expect, it } from "vitest";

import {
    customersSee,
    discountAmount,
    onTheShop,
    plural,
    priceLabel,
    ratingBars,
    ratingLabel,
} from "./overview-rules";

const rupees = (amount: string) => `₹${Number(amount)}`;

describe("product page display rules", () => {
    it("shows one price, or the range across variants", () => {
        expect(
            priceLabel(
                {
                    min: "799.00",
                    max: "799.00",
                    mrp: null,
                    savingPercent: null,
                },
                rupees,
            ),
        ).toBe("₹799");
        expect(
            priceLabel(
                {
                    min: "499.00",
                    max: "899.00",
                    mrp: null,
                    savingPercent: null,
                },
                rupees,
            ),
        ).toBe("₹499 – ₹899");
    });

    it("says what customers see for each stock word", () => {
        const line = { onHand: 10, promised: 7, canSell: 3, warnAt: 4 };
        expect(customersSee({ ...line, word: "LOW" })).toBe("Only 3 left");
        expect(customersSee({ ...line, canSell: 0, word: "SOLD_OUT" })).toBe(
            "Sold out",
        );
        expect(customersSee({ ...line, canSell: 9, word: "IN_STOCK" })).toBe(
            "In stock",
        );
    });

    it("counts in words, singular and plural", () => {
        expect(plural(0, "variant")).toBe("0 variants");
        expect(plural(1, "variant")).toBe("1 variant");
        expect(plural(2, "category", "categories")).toBe("2 categories");
    });

    it("reads the rating, and nothing when nobody has reviewed it", () => {
        expect(ratingLabel({ average: 4.6, count: 12 })).toBe("4.6 from 12");
        expect(ratingLabel({ average: null, count: 0 })).toBeNull();
    });

    it("spreads the rating 5★ first, as parts of the whole", () => {
        const bars = ratingBars([0, 0, 1, 3, 8]);
        expect(bars.map((b) => b.stars)).toEqual([5, 4, 3, 2, 1]);
        expect(bars[0]).toEqual({ stars: 5, count: 8, percent: 67 });
        expect(ratingBars([0, 0, 0, 0, 0])[0].percent).toBe(0);
    });

    it("says a discount as an amount off", () => {
        expect(
            discountAmount(
                { kind: "PERCENTAGE", percentBps: 1000, amount: null },
                rupees,
            ),
        ).toBe("10% off");
        expect(
            discountAmount(
                { kind: "PERCENTAGE", percentBps: 1250, amount: null },
                rupees,
            ),
        ).toBe("12.5% off");
        expect(
            discountAmount(
                { kind: "FIXED_AMOUNT", percentBps: null, amount: "50.00" },
                rupees,
            ),
        ).toBe("₹50 off");
    });

    it("treats a detail with no switch as shown", () => {
        expect(onTheShop({}, "maker")).toBe(true);
        expect(onTheShop({ maker: false }, "maker")).toBe(false);
    });
});
