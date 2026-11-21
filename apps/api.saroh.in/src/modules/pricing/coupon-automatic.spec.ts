import { couponCheckoutExpiresAt } from "../billing/coupon-checkout";
import {
    AUTOMATIC_COUPON_HOLD_MS,
    automaticClash,
    discountProblem,
    offerTermsChanged,
    yearlyOffTooMuch,
} from "./coupons.service";

// Codes and plans are made up.
describe("automaticClash: one automatic coupon per plan", () => {
    const others = [
        { code: "FAKE-ONE", planIds: ["b"] },
        { code: "FAKE-TWO", planIds: ["c", "d"] },
    ];

    it("names the first plan another automatic coupon already covers, and that coupon", () => {
        expect(automaticClash(others, ["a", "d"])).toEqual({
            code: "FAKE-TWO",
            planId: "d",
        });
        expect(automaticClash(others, ["b", "c"])).toEqual({
            code: "FAKE-ONE",
            planId: "b",
        });
    });

    it("is null when no plan is taken", () => {
        expect(automaticClash(others, ["a"])).toBeNull();
        expect(automaticClash([], ["b"])).toBeNull();
    });
});

describe("discountProblem: an amount or a percent, never both", () => {
    it("takes an amount alone or a whole percent from 1 to 90 alone", () => {
        expect(
            discountProblem({ discountPaise: 111, percentOff: null }),
        ).toBeNull();
        expect(discountProblem({ discountPaise: 0, percentOff: 1 })).toBeNull();
        expect(
            discountProblem({ discountPaise: 0, percentOff: 90 }),
        ).toBeNull();
    });

    it("refuses neither, both, or a percent out of range or not whole", () => {
        expect(
            discountProblem({ discountPaise: 0, percentOff: null })?.field,
        ).toBe("discountPaise");
        expect(
            discountProblem({ discountPaise: 111, percentOff: 7 })?.field,
        ).toBe("discountPaise");
        for (const percentOff of [0, 91, 7.5, -3]) {
            expect(
                discountProblem({ discountPaise: 0, percentOff })?.field,
            ).toBe("percentOff");
        }
    });
});

describe("offerTermsChanged: the Razorpay Offer was made for these terms (F7)", () => {
    const base = {
        discountPaise: 111,
        percentOff: null,
        months: 2,
        planIds: ["b", "c"],
    };

    it("is false for the same terms, plans in any order", () => {
        expect(offerTermsChanged(base, { ...base })).toBe(false);
        expect(
            offerTermsChanged(base, { ...base, planIds: ["c", "b", "b"] }),
        ).toBe(false);
    });

    it("is true for another amount, percent, months or plans", () => {
        for (const change of [
            { discountPaise: 112 },
            { discountPaise: 0, percentOff: 7 },
            { months: 3 },
            { planIds: ["b"] },
        ]) {
            expect(offerTermsChanged(base, { ...base, ...change })).toBe(true);
        }
    });
});

describe("yearlyOffTooMuch: a year never costs less than a month (F11)", () => {
    it("allows up to the year less one month, and refuses past it", () => {
        // Paid 10 months for the year: up to 9 months' worth off.
        const amount = (months: number) => ({
            discountPaise: 1_000,
            percentOff: null,
            months,
        });
        expect(yearlyOffTooMuch(amount(9), 1_000, 10_000)).toBe(false);
        expect(yearlyOffTooMuch(amount(10), 1_000, 10_000)).toBe(true);
        const percent = { discountPaise: 0, percentOff: 90, months: 12 };
        expect(yearlyOffTooMuch(percent, 1_000, 10_000)).toBe(true);
        expect(
            yearlyOffTooMuch({ ...percent, months: 10 }, 1_000, 10_000),
        ).toBe(false);
        // A yearly offer (DEC-231) is the year it's measured against.
        expect(yearlyOffTooMuch(amount(7), 1_000, 7_000)).toBe(true);
        expect(yearlyOffTooMuch(amount(6), 1_000, 7_000)).toBe(false);
    });
});

describe("couponCheckoutExpiresAt: an automatic coupon holds its place an hour (F4)", () => {
    const now = new Date("2026-11-18T10:00:00.000Z");
    const day = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    it("cuts an automatic coupon's checkout to the hold, never lengthens one", () => {
        expect(
            couponCheckoutExpiresAt(day, { automatic: true }, now).getTime(),
        ).toBe(now.getTime() + AUTOMATIC_COUPON_HOLD_MS);
        const soon = new Date(now.getTime() + 60_000);
        expect(couponCheckoutExpiresAt(soon, { automatic: true }, now)).toBe(
            soon,
        );
    });

    it("leaves a typed coupon's, or no coupon's, as it was", () => {
        expect(couponCheckoutExpiresAt(day, { automatic: false }, now)).toBe(
            day,
        );
        expect(couponCheckoutExpiresAt(day, null, now)).toBe(day);
    });
});
