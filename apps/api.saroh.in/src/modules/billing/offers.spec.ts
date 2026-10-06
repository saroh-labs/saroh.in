/**
 * The offers' pure rules (pricing catalogue U16): which add-ons a plan can
 * hold, what an add-on costs for a period or part of one, and when a
 * trial's email goes. The made-up catalogue (`fakeCatalog`: Plan A/B/C,
 * 111) — never a real plan.
 */
import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import {
    addonPeriodLine,
    addonProblem,
    addonProratedLine,
    planTrialDays,
    TRIAL_ENDING_NOTICE_DAYS,
    trialNoticeAt,
} from "./offers";

const DAY = 24 * 60 * 60 * 1000;

describe("addonProblem", () => {
    const catalog = fakeCatalog((c) => {
        c.modules[1]!.cells.b = { inc: false, off: "locked" };
    });
    const addon = (id: string) => catalog.addons.find((a) => a.id === id)!;

    it("a pack raises a capped row on the plan; not a row with no cap", () => {
        expect(addonProblem(catalog, "b", addon("things-pack"), 3)).toBeNull();
        expect(addonProblem(catalog, "c", addon("things-pack"), 1)).toBe(
            "Plan C has no cap on Things.",
        );
    });

    it("a module add-on only where the plan leaves the module out, and one of it", () => {
        expect(addonProblem(catalog, "b", addon("bills"), 1)).toBeNull();
        expect(addonProblem(catalog, "b", addon("bills"), 2)).toBe(
            "Bills on their own is one per business.",
        );
        expect(addonProblem(catalog, "c", addon("bills"), 1)).toBe(
            "Plan C already includes Bills.",
        );
    });

    it("refuses a quantity out of range", () => {
        expect(addonProblem(catalog, "b", addon("things-pack"), 100)).toMatch(
            /^Choose from 0 to 99/,
        );
        expect(addonProblem(catalog, "b", addon("things-pack"), -1)).toMatch(
            /^Choose from 0/,
        );
    });
});

describe("add-on charges", () => {
    const catalog = fakeCatalog();
    const pack = catalog.addons.find((a) => a.id === "things-pack")!;
    const start = new Date("2026-03-01T00:00:00Z");
    const end = new Date("2026-03-31T00:00:00Z");

    it("a whole period is its price per pack, a year twelve months of it", () => {
        expect(addonPeriodLine(pack, 2, "month", start, end)).toMatchObject({
            quantity: 2,
            unitPaise: 111,
        });
        expect(addonPeriodLine(pack, 2, "year", start, end).unitPaise).toBe(
            111 * 12,
        );
    });

    it("more bought part-way through owes what is left of the period, rounded once", () => {
        const now = new Date(start.getTime() + 20 * DAY);
        // 3 packs × 111 for 10 of 30 days = 111.
        expect(
            addonProratedLine({
                addon: pack,
                added: 3,
                cycle: "month",
                periodStart: start,
                periodEnd: end,
                now,
            }),
        ).toMatchObject({
            quantity: 1,
            unitPaise: 111,
            periodStart: now,
            periodEnd: end,
        });
        expect(
            addonProratedLine({
                addon: pack,
                added: 3,
                cycle: "month",
                periodStart: start,
                periodEnd: end,
                now: end,
            }),
        ).toBeNull();
    });
});

describe("trials", () => {
    it("only a paid plan with its trial on has one", () => {
        const catalog = fakeCatalog((c) => {
            c.plans[1]!.trial = { on: true, days: 9 };
            c.plans[2]!.trial = { on: false, days: 9 };
        });
        expect(planTrialDays(catalog, "b")).toBe(9);
        expect(planTrialDays(catalog, "c")).toBeNull();
        expect(planTrialDays(catalog, "free")).toBeNull();
    });

    it("the ending email goes some days ahead, never in the past", () => {
        const now = new Date("2026-03-01T00:00:00Z");
        const far = new Date(now.getTime() + 20 * DAY);
        expect(trialNoticeAt(far, now)).toEqual(
            new Date(far.getTime() - TRIAL_ENDING_NOTICE_DAYS * DAY),
        );
        const soon = new Date(now.getTime() + DAY);
        expect(trialNoticeAt(soon, now)).toEqual(now);
    });
});
