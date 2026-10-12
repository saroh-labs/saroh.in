import { describe, expect, it } from "vitest";

import type { BillingAccessView } from "@/lib/billing/access";

import { pickOfferedDay } from "./offered";
import { seatNote } from "./seat-note";
import type { OfferedDay } from "./types";

const start = {
    startAt: "2026-10-08T03:30:00.000Z",
    endAt: "2026-10-08T04:00:00.000Z",
    staffId: null,
    staffName: null,
    placesLeft: null,
};
const day = (date: string, times = 0, closed = false): OfferedDay => ({
    date,
    open: !closed,
    closed,
    starts: Array.from({ length: times }, () => start),
});

describe("which day the preview shows", () => {
    const days = [
        day("2026-10-07"),
        day("2026-10-08", 2),
        day("2026-10-09", 1),
    ];

    it("is today when today has a time", () => {
        expect(
            pickOfferedDay(
                [day("2026-10-07", 1), ...days.slice(1)],
                null,
                "2026-10-07",
            )?.date,
        ).toBe("2026-10-07");
    });

    it("is the next day with a time when today has none", () => {
        expect(pickOfferedDay(days, null, "2026-10-07")?.date).toBe(
            "2026-10-08",
        );
    });

    it("is the day picked by hand, with times or without", () => {
        expect(pickOfferedDay(days, "2026-10-07", "2026-10-07")?.date).toBe(
            "2026-10-07",
        );
        // A picked day the page no longer lists falls back.
        expect(pickOfferedDay(days, "2026-12-01", "2026-10-07")?.date).toBe(
            "2026-10-08",
        );
    });

    it("is today when nothing is offered at all, and null with no days", () => {
        const none = [day("2026-10-06"), day("2026-10-07", 0, true)];
        expect(pickOfferedDay(none, null, "2026-10-07")?.date).toBe(
            "2026-10-07",
        );
        expect(pickOfferedDay([], null, "2026-10-07")).toBeNull();
    });
});

describe("the add-person dialog's seat line", () => {
    const view = (
        over: Partial<BillingAccessView>,
        row: Record<string, unknown> | null = { limit: 3, usage: 2 },
    ) =>
        ({
            source: "catalogue",
            enforced: true,
            modules: row ? [{ moduleId: "members", state: "on", ...row }] : [],
            ...over,
        }) as unknown as BillingAccessView;

    it("is said when the plan counts seats and enforces the count", () => {
        expect(seatNote(view({}))).toBe(
            "They use a team seat: 2 of 3 are taken.",
        );
    });

    it("is not said when nothing would be used up or refused", () => {
        expect(seatNote(null)).toBeNull();
        expect(seatNote(view({ enforced: false }))).toBeNull();
        expect(seatNote(view({ source: "legacy" }))).toBeNull();
        // A plan with no limit on the team.
        expect(seatNote(view({}, { limit: null, usage: 2 }))).toBeNull();
        expect(seatNote(view({}, null))).toBeNull();
    });
});
