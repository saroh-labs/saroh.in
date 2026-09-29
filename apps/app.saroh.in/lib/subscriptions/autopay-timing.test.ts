import { describe, expect, it } from "vitest";

import {
    autopayTimingSettingsOf,
    sampleRenewal,
    timelineText,
    timingOptions,
    timingTimeline,
    timingTitle,
} from "./autopay-timing";

/**
 * "When autopay charges" (round-2 D13B, DEC-065): the options' words and
 * the small timeline each one shows.
 */

const S = { leadDays: 2, dueDays: 7 };

describe("when autopay charges", () => {
    it("reads the API's block, and anything strange as none", () => {
        expect(
            autopayTimingSettingsOf({
                available: true,
                chargeTiming: "ON_DUE_DATE",
                leadDays: 2,
                noticeHours: 26,
                dueDays: 7,
            }),
        ).toEqual({
            available: true,
            chargeTiming: "ON_DUE_DATE",
            leadDays: 2,
            noticeHours: 26,
            dueDays: 7,
        });
        expect(autopayTimingSettingsOf(undefined)).toBeNull();
        expect(
            autopayTimingSettingsOf({ available: true, chargeTiming: "SOON" }),
        ).toBeNull();
        // Numbers missing: the API's defaults.
        expect(
            autopayTimingSettingsOf({
                available: false,
                chargeTiming: "DAY_AFTER_RENEWAL",
            }),
        ).toMatchObject({ leadDays: 2, noticeHours: 26, dueDays: 7 });
    });

    it("offers three, the day after as the default, and says when there's no time to Retry", () => {
        const options = timingOptions(S);
        expect(options.map((o) => o.title)).toEqual([
            "Charge on the renewal date",
            "Charge the day after renewal",
            "Charge on the due date",
        ]);
        expect(options.filter((o) => o.isDefault).map((o) => o.value)).toEqual([
            "DAY_AFTER_RENEWAL",
        ]);
        expect(options[0].consequence).toContain("2 days early");
        expect(options[0].consequence).toContain("cancel or pause");
        expect(options[2].consequence).toContain(
            "No time for a Retry before it's overdue",
        );
        expect(timingTitle("ON_DUE_DATE")).toBe("Charge on the due date");
    });

    it("draws each timeline for a renewal on 29 Sep", () => {
        const text = (t: Parameters<typeof timingTimeline>[0]) =>
            timelineText(timingTimeline(t, "2026-09-29", S));
        expect(text("ON_RENEWAL_DATE")).toBe(
            "Invoice + bank notice 27 Sep → charged 29 Sep (renewal)",
        );
        expect(text("DAY_AFTER_RENEWAL")).toBe(
            "Invoice + bank notice 29 Sep (renewal) → charged 30 Sep",
        );
        expect(text("ON_DUE_DATE")).toBe(
            "Invoice 29 Sep (renewal) → bank notice 4 Oct → charged 6 Oct (due date)",
        );
    });

    it("previews a renewal a week out", () => {
        expect(sampleRenewal(new Date("2026-09-29T10:00:00Z"))).toBe(
            "2026-10-06",
        );
    });
});
