import {
    dueWindow,
    inSendingHours,
    overdueEventKey,
    overdueStage,
    reminderWindows,
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

describe("the business's own timing (DEC-178, #1169)", () => {
    const later = { firstDay: 5, secondDay: 8, fromHour: 7, untilHour: 11 };

    it("each reminder's window runs from its day to the day before the next, a week at most", () => {
        expect(reminderWindows()).toEqual({
            1: { from: 3, to: 9 },
            2: { from: 10, to: 16 },
        });
        expect(reminderWindows(later)).toEqual({
            1: { from: 5, to: 7 },
            2: { from: 8, to: 14 },
        });
        expect(
            reminderWindows({ ...later, firstDay: 1, secondDay: 30 }),
        ).toEqual({ 1: { from: 1, to: 7 }, 2: { from: 30, to: 36 } });
    });

    it.each([
        [4, null],
        [5, 1],
        [7, 1],
        [8, 2],
        [14, 2],
        [15, null],
    ])("%i days late → %p, with reminders on days 5 and 8", (days, stage) => {
        expect(overdueStage(dueDaysAgo(days), NOW, IST, later)).toBe(stage);
    });

    it("the read's bound follows the chosen days", () => {
        const { from, to } = dueWindow(NOW, IST, later);
        for (const days of [5, 7, 8, 14]) {
            const due = dueDaysAgo(days);
            expect(due >= from && due < to).toBe(true);
        }
        expect(dueDaysAgo(4) < to).toBe(false);
        expect(dueDaysAgo(15) >= from).toBe(false);
    });

    it.each([
        ["2026-10-21T01:29:00.000Z", false], // 06:59 India
        ["2026-10-21T01:30:00.000Z", true], // 07:00
        ["2026-10-21T05:29:00.000Z", true], // 10:59
        ["2026-10-21T05:30:00.000Z", false], // 11:00
    ])("%s → %p in India, from 7 to 11", (at, open) => {
        expect(inSendingHours(new Date(at), IST, later)).toBe(open);
    });

    it("until midnight takes the last hour of the day", () => {
        const allDay = { ...later, fromHour: 0, untilHour: 24 };
        // 23:30 and 00:10 India.
        expect(
            inSendingHours(new Date("2026-10-21T18:00:00.000Z"), IST, allDay),
        ).toBe(true);
        expect(
            inSendingHours(new Date("2026-10-20T18:40:00.000Z"), IST, allDay),
        ).toBe(true);
    });
});
