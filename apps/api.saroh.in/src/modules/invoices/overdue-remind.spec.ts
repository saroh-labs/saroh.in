import {
    dueWindow,
    inSendingHours,
    overdueEventKey,
    overdueStage,
} from "./overdue-remind";

const IST = "Asia/Kolkata";
// 21 Oct 2026, 12:00 in India.
const NOW = new Date("2026-10-21T06:30:00.000Z");
/** Due at noon in India, `days` days before NOW's day. */
const dueDaysAgo = (days: number) =>
    new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

describe("overdueStage", () => {
    it.each([
        [0, null],
        [1, null],
        [2, null],
        [3, 1],
        [6, 1],
        [9, 1],
        [10, 2],
        [16, 2],
        [17, null],
        [40, null],
    ])("%i days late → %p", (days, stage) => {
        expect(overdueStage(dueDaysAgo(days), NOW, IST)).toBe(stage);
    });

    it("not yet due is never a reminder", () => {
        expect(overdueStage(new Date(NOW.getTime() + 1000), NOW, IST)).toBe(
            null,
        );
    });

    it("counts days in the business's zone, not UTC", () => {
        // 18 Oct 20:00 UTC is 19 Oct in India but 18 Oct in London.
        const due = new Date("2026-10-18T20:00:00.000Z");
        const at = new Date("2026-10-21T10:00:00.000Z");
        expect(overdueStage(due, at, IST)).toBeNull();
        expect(overdueStage(due, at, "Europe/London")).toBe(1);
    });
});

describe("dueWindow", () => {
    it("spans the due days that can be in a reminder's week", () => {
        const { from, to } = dueWindow(NOW, IST);
        // Start of 5 Oct and start of 19 Oct, India.
        expect(from.toISOString()).toBe("2026-10-04T18:30:00.000Z");
        expect(to.toISOString()).toBe("2026-10-18T18:30:00.000Z");
        for (const days of [3, 9, 10, 16]) {
            const due = dueDaysAgo(days);
            expect(due >= from && due < to).toBe(true);
        }
        expect(dueDaysAgo(2) < to).toBe(false);
        expect(dueDaysAgo(17) >= from).toBe(false);
    });
});

describe("inSendingHours", () => {
    it.each([
        ["2026-10-21T03:29:00.000Z", false], // 08:59 India
        ["2026-10-21T03:30:00.000Z", true], // 09:00
        ["2026-10-21T14:29:00.000Z", true], // 19:59
        ["2026-10-21T14:30:00.000Z", false], // 20:00
        ["2026-10-20T21:30:00.000Z", false], // 03:00
    ])("%s → %p in India", (at, open) => {
        expect(inSendingHours(new Date(at), IST)).toBe(open);
    });
});

it("one claim per invoice and reminder", () => {
    expect(overdueEventKey("inv_1", 1)).toBe("invoice-overdue:inv_1:1");
    expect(overdueEventKey("inv_1", 2)).toBe("invoice-overdue:inv_1:2");
});
