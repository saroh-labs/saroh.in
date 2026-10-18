/**
 * When a change of plan takes effect (DEC-159): the pure rules the quote,
 * the change and the provider's events share. Made-up prices (222 and 333
 * rupees in paise) — never a real plan.
 */
import type { TimedSubscription } from "./change-timing";
import {
    billedByProvider,
    firstMonthEnd,
    firstMonthMove,
    leavesWithCycle,
    paidUntil,
    PERIOD_END_SLACK_MS,
    runsToMoveDate,
} from "./change-timing";

const NOW = new Date("2026-03-11T00:00:00Z");
const END = new Date("2026-03-21T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function sub(over: Partial<TimedSubscription> = {}): TimedSubscription {
    return {
        status: "ACTIVE",
        provider: "RAZORPAY",
        providerSubscriptionId: "sub_1",
        currentPeriodEnd: END,
        plan: { priceCents: 22_200 },
        ...over,
    };
}

describe("paidUntil", () => {
    it("is the period's end at the provider, a first month's included", () => {
        expect(paidUntil(sub(), NOW)).toEqual(END);
        expect(paidUntil(sub({ status: "TRIALING" }), NOW)).toEqual(END);
    });

    it("is nothing when nothing is paid ahead", () => {
        expect(paidUntil(null, NOW)).toBeNull();
        expect(paidUntil(sub({ status: "CANCELLED" }), NOW)).toBeNull();
        expect(paidUntil(sub({ plan: { priceCents: 0 } }), NOW)).toBeNull();
        expect(
            paidUntil(
                sub({ provider: null, providerSubscriptionId: null }),
                NOW,
            ),
        ).toBeNull();
        // A period that is over (a charge that failed) pays for nothing.
        expect(paidUntil(sub({ currentPeriodEnd: NOW }), NOW)).toBeNull();
        expect(paidUntil(sub({ currentPeriodEnd: null }), NOW)).toBeNull();
    });

    it("agrees with billedByProvider on who is billed", () => {
        expect(billedByProvider(sub())).toBe(true);
        expect(billedByProvider(sub({ status: "CANCELLED" }))).toBe(false);
        expect(billedByProvider(null)).toBe(false);
    });
});

describe("firstMonthEnd", () => {
    it("is the month's end only while the first month runs at the provider", () => {
        expect(firstMonthEnd(sub({ status: "TRIALING" }), NOW)).toEqual(END);
        expect(firstMonthEnd(sub(), NOW)).toBeNull();
        expect(firstMonthEnd(null, NOW)).toBeNull();
        expect(
            firstMonthEnd(
                sub({ status: "TRIALING", currentPeriodEnd: NOW }),
                NOW,
            ),
        ).toBeNull();
    });
});

describe("firstMonthMove", () => {
    it("a plan that costs more a month starts now; the same price or less waits for the month's end", () => {
        const from = 22_200;
        expect(
            firstMonthMove({ fromMonthlyPaise: from, toMonthlyPaise: 33_300 }),
        ).toBe("NOW");
        expect(
            firstMonthMove({ fromMonthlyPaise: from, toMonthlyPaise: from }),
        ).toBe("AT_END");
        expect(
            firstMonthMove({ fromMonthlyPaise: from, toMonthlyPaise: 11_100 }),
        ).toBe("AT_END");
        expect(
            firstMonthMove({ fromMonthlyPaise: from, toMonthlyPaise: 0 }),
        ).toBe("AT_END");
    });
});

describe("leavesWithCycle", () => {
    it("a paid period's provider subscription ends with its cycle; a first month's at once", () => {
        expect(leavesWithCycle({ status: "ACTIVE" })).toBe(true);
        expect(leavesWithCycle({ status: "PAST_DUE" })).toBe(true);
        expect(leavesWithCycle({ status: "TRIALING" })).toBe(false);
    });

    it("ends at once a provider subscription whose first charge is still ahead (an upgrade's)", () => {
        const now = new Date("2026-10-17T00:00:00Z");
        const ahead = new Date("2026-10-30T00:00:00Z");
        const past = new Date("2026-10-01T00:00:00Z");
        expect(leavesWithCycle({ status: "ACTIVE" }, ahead, now)).toBe(false);
        expect(leavesWithCycle({ status: "ACTIVE" }, past, now)).toBe(true);
        expect(leavesWithCycle({ status: "ACTIVE" }, null, now)).toBe(true);
    });
});

describe("runsToMoveDate", () => {
    const waiting = (over: Partial<Parameters<typeof runsToMoveDate>[0]>) => ({
        status: "ACTIVE",
        cancelAtPeriodEnd: true,
        pendingFrom: END,
        currentPeriodEnd: END,
        ...over,
    });

    it("a first month ended at the provider runs to the month's end, however close", () => {
        expect(runsToMoveDate(waiting({ status: "TRIALING" }), NOW)).toBe(true);
        const lastMinute = new Date(END.getTime() - 60_000);
        expect(
            runsToMoveDate(waiting({ status: "TRIALING" }), lastMinute),
        ).toBe(true);
    });

    it("a paid period ended clearly early runs to its end; at its end the move is due", () => {
        expect(runsToMoveDate(waiting({}), NOW)).toBe(true);
        expect(
            runsToMoveDate(
                waiting({}),
                new Date(END.getTime() - PERIOD_END_SLACK_MS - 1),
            ),
        ).toBe(true);
        // The provider's own end of the cycle, a little off Saroh's date.
        expect(
            runsToMoveDate(waiting({}), new Date(END.getTime() - 60_000)),
        ).toBe(false);
        expect(runsToMoveDate(waiting({}), END)).toBe(false);
        expect(runsToMoveDate(waiting({}), new Date(END.getTime() + DAY))).toBe(
            false,
        );
    });

    it("never for a move that doesn't end the plan it's on, or with nothing paid ahead", () => {
        // A "move them" from a publish: the plan was never paid up to it.
        expect(runsToMoveDate(waiting({ cancelAtPeriodEnd: false }), NOW)).toBe(
            false,
        );
        expect(runsToMoveDate(waiting({ pendingFrom: null }), NOW)).toBe(false);
        expect(runsToMoveDate(waiting({ currentPeriodEnd: null }), NOW)).toBe(
            false,
        );
        expect(
            runsToMoveDate(
                waiting({ status: "TRIALING", currentPeriodEnd: NOW }),
                NOW,
            ),
        ).toBe(false);
    });
});
