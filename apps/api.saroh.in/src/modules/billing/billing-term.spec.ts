/**
 * How long what a business approved runs (DEC-093, DEC-161, #803): when its
 * autopay runs out, and when the request to approve the next opens. The
 * count one autopay covers is its catalogue version's setting, 12 today.
 * Made-up dates.
 */
import { addMonthsUtc } from "@saroh/pricing-catalog";

import {
    autopayChargesOfVersion,
    isOneTime,
    ONE_TIME_PAYMENT,
    termCheckoutOf,
    termOf,
} from "./billing-term";
import { catalogueOfVersion } from "./offers";

jest.mock("./offers", () => ({ catalogueOfVersion: jest.fn() }));
const catalogueOf = catalogueOfVersion as unknown as jest.Mock;

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2027-03-10T00:00:00Z");

const checkout = (over: Partial<Parameters<typeof termOf>[1]> = {}) => ({
    providerPlanId: "plan_b",
    cycle: "month",
    startAt: null,
    completedAt: new Date("2026-04-01T00:00:00Z"),
    createdAt: new Date("2026-04-01T00:00:00Z"),
    autopayCharges: 12,
    ...over,
});

describe("termOf", () => {
    it("monthly runs out 12 charges after its charges start", () => {
        const t = termOf({ currentPeriodEnd: null }, checkout(), NOW);
        expect(t).toEqual({
            payment: "AUTOPAY",
            endsAt: addMonthsUtc(new Date("2026-04-01T00:00:00Z"), 12),
            renewOpen: true,
            charges: 12,
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

    it("runs out after as many charges as its autopay was made for (DEC-161)", () => {
        const t = termOf(
            { currentPeriodEnd: null },
            checkout({ autopayCharges: 60 }),
            NOW,
        );
        expect(t?.endsAt).toEqual(
            addMonthsUtc(new Date("2026-04-01T00:00:00Z"), 60),
        );
        expect(t?.charges).toBe(60);
        expect(t?.renewOpen).toBe(false);
    });

    it("a year paid once ends with the year", () => {
        const end = new Date(NOW.getTime() + 90 * DAY);
        const c = checkout({ providerPlanId: ONE_TIME_PAYMENT, cycle: "year" });
        expect(isOneTime(c)).toBe(true);
        expect(termOf({ currentPeriodEnd: end }, c, NOW)).toEqual({
            payment: "ONE_TIME",
            endsAt: end,
            renewOpen: false,
            charges: 1,
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

describe("the count a checkout's autopay was made for (DEC-161)", () => {
    const db = {} as never;
    beforeEach(() => catalogueOf.mockReset());

    it("is its plan's version's setting", async () => {
        catalogueOf.mockResolvedValue({ autopay: { charges: 60 } });
        expect(await autopayChargesOfVersion(db, 3)).toBe(60);
        expect(catalogueOf).toHaveBeenCalledWith(db, 3);
    });

    it("is 12 for a version without it, or one that can't be read", async () => {
        catalogueOf.mockResolvedValueOnce({});
        expect(await autopayChargesOfVersion(db, 1)).toBe(12);
        catalogueOf.mockResolvedValueOnce(null);
        expect(await autopayChargesOfVersion(db, 2)).toBe(12);
    });

    it("is read onto a checkout row, so one made on 12 keeps 12 after a change", async () => {
        catalogueOf.mockImplementation(async (_db, v: number) =>
            v === 1
                ? { autopay: { charges: 12 } }
                : { autopay: { charges: 60 } },
        );
        const { autopayCharges: _, ...row } = checkout();
        const old = await termCheckoutOf(db, { ...row, plan: { version: 1 } });
        const made = await termCheckoutOf(db, { ...row, plan: { version: 2 } });
        expect(old?.autopayCharges).toBe(12);
        expect(made?.autopayCharges).toBe(60);
        expect(await termCheckoutOf(db, null)).toBeNull();
    });
});
