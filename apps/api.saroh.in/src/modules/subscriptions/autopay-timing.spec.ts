// When autopay debits (round-2 D13B, DEC-065): the pure rules.
import {
    AUTOPAY_LEAD_DAYS,
    chargePlan,
    earliestDebit,
    earlyIssueAt,
    isAutopayChargeTiming,
    keptPlan,
    needsNotice,
    projectedCharge,
    timingOf,
} from "./autopay-timing";

const ZONE = "Asia/Kolkata";
const HOUR = 60 * 60 * 1000;
// A renewal at the start of 29 Sep in Kolkata.
const RENEWAL = new Date("2026-09-28T18:30:00Z");

describe("autopay timing", () => {
    it("rounds the 26-hour notice up to two whole days", () => {
        expect(AUTOPAY_LEAD_DAYS).toBe(2);
        expect(earlyIssueAt(RENEWAL, ZONE).toISOString()).toBe(
            "2026-09-26T18:30:00.000Z",
        );
    });

    it("reads anything strange as the default", () => {
        expect(timingOf("ON_DUE_DATE")).toBe("ON_DUE_DATE");
        expect(timingOf("SOON")).toBe("DAY_AFTER_RENEWAL");
        expect(timingOf(null)).toBe("DAY_AFTER_RENEWAL");
        expect(isAutopayChargeTiming("ON_RENEWAL_DATE")).toBe(true);
        expect(isAutopayChargeTiming(3)).toBe(false);
    });

    it("UPI (or an unknown method) waits on the notice; a card or eMandate doesn't", () => {
        const now = new Date("2026-09-26T19:00:00Z");
        expect(needsNotice("UPI")).toBe(true);
        expect(needsNotice(null)).toBe(true);
        expect(needsNotice("CARD")).toBe(false);
        expect(earliestDebit(now, "UPI").getTime()).toBe(
            now.getTime() + 26 * HOUR,
        );
        expect(earliestDebit(now, "EMANDATE")).toBe(now);
    });

    it("DAY_AFTER_RENEWAL plans nothing: D13's timing", () => {
        expect(
            chargePlan("DAY_AFTER_RENEWAL", {
                now: RENEWAL,
                periodStart: RENEWAL,
                timezone: ZONE,
                method: "UPI",
            }),
        ).toBeNull();
    });

    it("ON_RENEWAL_DATE: two days early, the debit on the renewal date, prepared now", () => {
        const now = new Date(RENEWAL.getTime() - 2 * 24 * HOUR + HOUR);
        const plan = chargePlan("ON_RENEWAL_DATE", {
            now,
            periodStart: RENEWAL,
            timezone: ZONE,
            method: "UPI",
        });
        expect(plan).toEqual({ debitAt: RENEWAL, prepareAt: now });
        // Late (on the day): as soon as the notice allows.
        const late = new Date(RENEWAL.getTime() + HOUR);
        expect(
            chargePlan("ON_RENEWAL_DATE", {
                now: late,
                periodStart: RENEWAL,
                timezone: ZONE,
                method: "UPI",
            })?.debitAt.getTime(),
        ).toBe(late.getTime() + 26 * HOUR);
        // A card on the day: at once.
        expect(
            chargePlan("ON_RENEWAL_DATE", {
                now: late,
                periodStart: RENEWAL,
                timezone: ZONE,
                method: "CARD",
            })?.debitAt,
        ).toBe(late);
    });

    it("ON_DUE_DATE: the start of the due date, the notice two days before", () => {
        const now = new Date(RENEWAL.getTime() + HOUR);
        const plan = chargePlan("ON_DUE_DATE", {
            now,
            periodStart: RENEWAL,
            timezone: ZONE,
            method: "UPI",
        });
        // Issued 29 Sep (Kolkata), due 6 Oct.
        expect(plan?.debitAt.toISOString()).toBe("2026-10-05T18:30:00.000Z");
        expect(plan?.prepareAt.toISOString()).toBe("2026-10-03T18:30:00.000Z");
    });

    it("a charge queued again keeps its planned debit; its notice goes two days before, or now (review 3)", () => {
        const debitAt = new Date("2026-10-05T18:30:00Z");
        const early = keptPlan(debitAt, new Date("2026-10-01T00:00:00Z"));
        expect(early.debitAt).toBe(debitAt);
        expect(early.prepareAt.toISOString()).toBe("2026-10-03T18:30:00.000Z");
        const late = new Date("2026-10-04T12:00:00Z");
        expect(keptPlan(debitAt, late).prepareAt).toBe(late);
    });

    it("projects the next renewal's charge for the customer", () => {
        const at = (t: Parameters<typeof projectedCharge>[0], m = "UPI") =>
            projectedCharge(t, {
                renewal: RENEWAL,
                timezone: ZONE,
                method: m,
            }).toISOString();
        expect(at("ON_RENEWAL_DATE")).toBe(RENEWAL.toISOString());
        expect(at("DAY_AFTER_RENEWAL")).toBe(
            new Date(RENEWAL.getTime() + 26 * HOUR).toISOString(),
        );
        expect(at("DAY_AFTER_RENEWAL", "CARD")).toBe(RENEWAL.toISOString());
        expect(at("ON_DUE_DATE")).toBe("2026-10-05T18:30:00.000Z");
    });
});
