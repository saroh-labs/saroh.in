// A plan's figures (D1): a price as a month's worth, and who pays what.
// Pure; the grouped query that feeds it is in the service and .db specs.
import type { PriceGroup } from "./plan-figures";
import { monthlyMinor, planFigures } from "./plan-figures";

const money = (s: string) => ({ toString: () => s });
const group = (over: Partial<PriceGroup> = {}): PriceGroup => ({
    price: money("1500"),
    currency: "INR",
    interval: "MONTH",
    status: "ACTIVE",
    count: 1,
    ...over,
});
const MONTHLY = { price: money("1500"), currency: "INR", interval: "MONTH" };

describe("a price as a month's worth", () => {
    it("takes a twelfth of a year", () => {
        expect(monthlyMinor(1_200_000, "YEAR")).toBe(100_000);
    });

    it("takes 52 twelfths of a week, rounded to the paisa", () => {
        expect(monthlyMinor(35_000, "WEEK")).toBe(151_667);
    });

    it("takes a third of a quarter, and a month as it is", () => {
        expect(monthlyMinor(100_000, "QUARTER")).toBe(33_333);
        expect(monthlyMinor(120_000, "MONTH")).toBe(120_000);
    });

    it("rounds half a paisa up", () => {
        // ₹0.18 a year is 1.5 paise a month.
        expect(monthlyMinor(18, "YEAR")).toBe(2);
    });
});

describe("a plan's figures", () => {
    it("says the plan's monthly figure as money", () => {
        expect(
            planFigures(
                { price: money("12000"), currency: "INR", interval: "YEAR" },
                [],
            ).monthly,
        ).toBe("1000.00");
        expect(
            planFigures(
                { price: money("350"), currency: "INR", interval: "WEEK" },
                [],
            ).monthly,
        ).toBe("1516.67");
    });

    it("lists each price people pay, the current one first", () => {
        const f = planFigures(MONTHLY, [
            group({ price: money("1200"), count: 3 }),
            group({ count: 10 }),
            group({ status: "PAUSED", count: 2 }),
        ]);
        expect(f.byPrice).toEqual([
            {
                price: "1500.00",
                // No GST on top: what they pay is the price.
                pay: "1500.00",
                currency: "INR",
                interval: "MONTH",
                count: 12,
                current: true,
            },
            {
                price: "1200.00",
                pay: "1200.00",
                currency: "INR",
                interval: "MONTH",
                count: 3,
                current: false,
            },
        ]);
        expect(f.subscriberCount).toBe(15);
    });

    it("counts only running members in what comes in a month", () => {
        const f = planFigures(MONTHLY, [
            group({ count: 10 }),
            group({ status: "PAUSED", count: 2 }),
            group({ price: money("1200"), count: 3 }),
        ]);
        // 10 × 1,500 + 3 × 1,200; the paused two bring nothing in.
        expect(f.monthlyFromMembers).toBe("18600.00");
    });

    it("keeps a member on another interval apart, as an older price, at its month's worth", () => {
        const f = planFigures(MONTHLY, [
            group({ price: money("12000"), interval: "YEAR", count: 2 }),
        ]);
        expect(f.byPrice).toEqual([
            expect.objectContaining({ interval: "YEAR", current: false }),
        ]);
        expect(f.monthlyFromMembers).toBe("2000.00");
    });

    it("leaves another currency out of the month's sum, but lists it", () => {
        const f = planFigures(MONTHLY, [
            group({ currency: "USD", price: money("20"), count: 4 }),
        ]);
        expect(f.byPrice).toHaveLength(1);
        expect(f.byPrice[0]!.current).toBe(false);
        expect(f.monthlyFromMembers).toBe("0.00");
    });

    // 12 Oct 2026: a figure that is money expected is what the member
    // pays, GST and all; a price the business set stays as typed.
    describe("where GST is added to the plan's price", () => {
        const GYM = {
            price: money("2000"),
            currency: "INR",
            interval: "MONTH",
        };
        /** 18% on top, rounded to the paisa, as `unitPayCents` does. */
        const added18 = (minor: number) =>
            minor + Math.round((minor * 1800) / 10_000);

        it("says what each member pays beside the price they joined at", () => {
            const f = planFigures(
                GYM,
                [
                    group({ price: money("2000"), count: 4 }),
                    group({ price: money("1500"), count: 1 }),
                ],
                added18,
            );
            expect(f.byPrice).toEqual([
                {
                    // ₹2,000 + ₹360 is ₹2,360 a month.
                    price: "2000.00",
                    pay: "2360.00",
                    currency: "INR",
                    interval: "MONTH",
                    count: 4,
                    current: true,
                },
                {
                    // ₹1,500 + ₹270 is ₹1,770.
                    price: "1500.00",
                    pay: "1770.00",
                    currency: "INR",
                    interval: "MONTH",
                    count: 1,
                    current: false,
                },
            ]);
        });

        it("sums a month from members from what they pay, not what was typed", () => {
            const f = planFigures(
                GYM,
                [
                    group({ price: money("2000"), count: 4 }),
                    group({ price: money("1500"), count: 1 }),
                    group({ price: money("2000"), status: "PAUSED", count: 2 }),
                ],
                added18,
            );
            // 4 × 2,360 + 1 × 1,770; the paused two bring nothing in.
            expect(f.monthlyFromMembers).toBe("11210.00");
            // The plan's own price as a month's worth stays as typed.
            expect(f.monthly).toBe("2000.00");
        });

        it("takes a month's worth of what a yearly member pays", () => {
            const f = planFigures(
                { price: money("12000"), currency: "INR", interval: "YEAR" },
                [group({ price: money("12000"), interval: "YEAR", count: 1 })],
                added18,
            );
            // ₹12,000 + ₹2,160 is ₹14,160 a year: ₹1,180 a month.
            expect(f.byPrice[0]!.pay).toBe("14160.00");
            expect(f.monthlyFromMembers).toBe("1180.00");
        });

        it("still matches the current price on what was typed", () => {
            const f = planFigures(
                GYM,
                [group({ price: money("2000"), count: 1 })],
                added18,
            );
            expect(f.byPrice[0]!.current).toBe(true);
        });
    });

    it("is empty for a plan nobody is on", () => {
        expect(planFigures(MONTHLY, [])).toEqual({
            subscriberCount: 0,
            byPrice: [],
            monthly: "1500.00",
            monthlyFromMembers: "0.00",
        });
    });
});
