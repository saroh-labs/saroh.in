import { boundary, nextPeriod, periodContaining } from "./periods";

const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("boundary", () => {
    it("clamps a month from the 31st to the end of a short month, then comes back", () => {
        const anchor = utc("2026-01-31");
        expect(iso(boundary(anchor, "MONTH", "UTC", 1))).toBe("2026-02-28");
        expect(iso(boundary(anchor, "MONTH", "UTC", 2))).toBe("2026-03-31");
        expect(iso(boundary(anchor, "MONTH", "UTC", 3))).toBe("2026-04-30");
    });

    it("gives February the 29th in a leap year", () => {
        expect(iso(boundary(utc("2028-01-31"), "MONTH", "UTC", 1))).toBe(
            "2028-02-29",
        );
    });

    it("steps weeks, quarters and years", () => {
        const anchor = utc("2026-01-31");
        expect(iso(boundary(anchor, "WEEK", "UTC", 2))).toBe("2026-02-14");
        expect(iso(boundary(anchor, "QUARTER", "UTC", 1))).toBe("2026-04-30");
        expect(iso(boundary(utc("2028-02-29"), "YEAR", "UTC", 1))).toBe(
            "2029-02-28",
        );
    });

    it("keeps local midnight in the subscription's timezone, not UTC", () => {
        // 1 Sep 00:00 in Kolkata is 31 Aug 18:30 UTC.
        const anchor = new Date("2026-08-31T18:30:00.000Z");
        expect(boundary(anchor, "MONTH", "Asia/Kolkata", 1).toISOString()).toBe(
            "2026-09-30T18:30:00.000Z",
        );
    });

    it("keeps the wall-clock time across a daylight-saving change", () => {
        // 1 Mar 09:00 in New York is 14:00 UTC (EST); 1 Apr 09:00 is 13:00 UTC (EDT).
        const anchor = new Date("2026-03-01T14:00:00.000Z");
        expect(
            boundary(anchor, "MONTH", "America/New_York", 1).toISOString(),
        ).toBe("2026-04-01T13:00:00.000Z");
    });
});

describe("periodContaining", () => {
    it("finds the period holding a moment six months after a backdated start", () => {
        const p = periodContaining(
            utc("2026-03-15"),
            "MONTH",
            "UTC",
            new Date("2026-09-22T10:00:00.000Z"),
        );
        expect([iso(p.start), iso(p.end)]).toEqual([
            "2026-09-15",
            "2026-10-15",
        ]);
    });

    it("counts a moment exactly on a boundary as the start of the next period", () => {
        const p = periodContaining(
            utc("2026-01-31"),
            "MONTH",
            "UTC",
            utc("2026-02-28"),
        );
        expect([iso(p.start), iso(p.end)]).toEqual([
            "2026-02-28",
            "2026-03-31",
        ]);
    });

    it("keeps month-end anchors on month ends across a long backdate", () => {
        const p = periodContaining(
            utc("2025-01-31"),
            "MONTH",
            "UTC",
            new Date("2026-05-10T00:00:00.000Z"),
        );
        expect([iso(p.start), iso(p.end)]).toEqual([
            "2026-04-30",
            "2026-05-31",
        ]);
    });

    it("starts at the anchor when the anchor is still ahead", () => {
        const p = periodContaining(
            utc("2026-10-01"),
            "MONTH",
            "UTC",
            utc("2026-09-22"),
        );
        expect([iso(p.start), iso(p.end)]).toEqual([
            "2026-10-01",
            "2026-11-01",
        ]);
    });

    it("uses the local day in the subscription's timezone", () => {
        // 30 Sep 20:00 UTC is already 1 Oct 01:30 in Kolkata.
        const anchor = new Date("2026-08-31T18:30:00.000Z"); // 1 Sep, Kolkata
        const p = periodContaining(
            anchor,
            "MONTH",
            "Asia/Kolkata",
            new Date("2026-09-30T20:00:00.000Z"),
        );
        expect(p.start.toISOString()).toBe("2026-09-30T18:30:00.000Z");
    });

    it("finds weekly periods far from the anchor", () => {
        const p = periodContaining(
            utc("2026-01-05"),
            "WEEK",
            "UTC",
            new Date("2026-09-22T12:00:00.000Z"),
        );
        expect([iso(p.start), iso(p.end)]).toEqual([
            "2026-09-21",
            "2026-09-28",
        ]);
    });
});

describe("nextPeriod", () => {
    it("runs from one period's end to the anchor's next boundary", () => {
        const p = nextPeriod(
            utc("2026-01-31"),
            "MONTH",
            "UTC",
            utc("2026-02-28"),
        );
        expect([iso(p.start), iso(p.end)]).toEqual([
            "2026-02-28",
            "2026-03-31",
        ]);
    });
});
