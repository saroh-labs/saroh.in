/**
 * A paid plan's term (DEC-093, #803): when it ends, and when its one-tap
 * renewal opens. Made-up dates.
 */
import { addMonthsUtc } from "@saroh/pricing-catalog";

import { isOneTime, ONE_TIME_PAYMENT, termOf } from "./billing-term";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2027-03-10T00:00:00Z");

const checkout = (over: Partial<Parameters<typeof termOf>[1]> = {}) => ({
    providerPlanId: "plan_b",
    cycle: "month",
    startAt: null,
    completedAt: new Date("2026-04-01T00:00:00Z"),
    createdAt: new Date("2026-04-01T00:00:00Z"),
    ...over,
});

describe("termOf", () => {
    it("monthly ends 12 charges after its charges start", () => {
        const t = termOf({ currentPeriodEnd: null }, checkout(), NOW);
        expect(t).toEqual({
            payment: "AUTOPAY",
            endsAt: addMonthsUtc(new Date("2026-04-01T00:00:00Z"), 12),
            renewOpen: true,
        });
        // A trial's or a scheduled change's charges start on its date.
        const later = new Date("2026-05-01T00:00:00Z");
        expect(
            termOf(
                { currentPeriodEnd: null },
                checkout({ startAt: later }),
                NOW,
            )?.endsAt,
        ).toEqual(addMonthsUtc(later, 12));
    });

    it("a year paid once ends with the year", () => {
        const end = new Date(NOW.getTime() + 90 * DAY);
        const c = checkout({ providerPlanId: ONE_TIME_PAYMENT, cycle: "year" });
        expect(isOneTime(c)).toBe(true);
        expect(termOf({ currentPeriodEnd: end }, c, NOW)).toEqual({
            payment: "ONE_TIME",
            endsAt: end,
            renewOpen: false,
        });
    });

    it("has none without a checkout, or for a yearly autopay made before DEC-093", () => {
        expect(termOf({ currentPeriodEnd: NOW }, null, NOW)).toBeNull();
        expect(
            termOf({ currentPeriodEnd: NOW }, checkout({ cycle: "year" }), NOW),
        ).toBeNull();
    });

    it("opens the renewal in the last 30 days, and never after the end", () => {
        const ends = (days: number) =>
            termOf(
                { currentPeriodEnd: new Date(NOW.getTime() + days * DAY) },
                checkout({ providerPlanId: ONE_TIME_PAYMENT, cycle: "year" }),
                NOW,
            )?.renewOpen;
        expect(ends(31)).toBe(false);
        expect(ends(30)).toBe(true);
        expect(ends(1)).toBe(true);
        expect(ends(-1)).toBe(false);
    });
});
