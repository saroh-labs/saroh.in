import { describe, expect, it } from "vitest";

import { pinClock } from "@/lib/format/test-clock";

import {
    couldntCheckLine,
    daySheetTitle,
    PHONE_LINES,
    phoneFigures,
    phoneLines,
    phoneNext,
} from "./phone-home";
import type {
    HomeNeedGroup,
    HomeNeedKind,
    HomeTiles,
    HomeToday,
} from "./service";

/**
 * The simplified phone Home's words (DEC-171, plan U17): A1's three
 * figures by role, the Next line, A2's order and cap of five, and the one
 * line naming what couldn't be checked.
 */

pinClock("2026-10-19T09:00:00.000Z");
const NOW = new Date("2026-10-19T05:00:00.000Z");

const BOOKINGS: NonNullable<HomeTiles["bookingsToday"]> = {
    count: 6,
    next: {
        startAt: "2026-10-19T06:00:00.000Z",
        date: "2026-10-19",
        time: "11:30",
        what: "Sourdough basics",
    },
    laterToday: 4,
    href: "/calendar?view=day",
};
const TO_PACK: NonNullable<HomeTiles["toPack"]> = {
    count: 7,
    dueToday: 0,
    late: 3,
    inProgress: 1,
    href: "/commerce/orders?needs=1",
};

const TILES: HomeTiles = {
    bookingsToday: {
        count: 6,
        next: {
            startAt: "2026-10-19T06:00:00.000Z",
            date: "2026-10-19",
            time: "11:30",
            what: "Sourdough basics",
        },
        laterToday: 4,
        href: "/calendar?view=day",
    },
    toPack: {
        count: 7,
        dueToday: 0,
        late: 3,
        inProgress: 1,
        href: "/commerce/orders?needs=1",
    },
    moneyIn: {
        totals: [
            {
                currency: "INR",
                amountMinor: 824_000,
                lastWeekMinor: 0,
                change: { kind: "THIN" },
            },
        ],
        payments: 3,
        href: "/billing/invoices?paid=today",
    },
    came: {
        came: 3,
        due: 4,
        total: 6,
        next: null,
        href: "/bookings?came=1",
    },
};

const TODAY: HomeToday = {
    zone: "Asia/Kolkata",
    date: "2026-10-19",
    bookings: true,
    items: [
        {
            id: "c1",
            kind: "CLASS",
            startAt: "2026-10-19T06:00:00.000Z",
            time: "11:30",
            what: "Sourdough basics",
            who: "8 booked",
            person: null,
            outcome: null,
            outcomeTime: null,
            stage: null,
            flags: [],
            href: "/bookings/c1",
            markable: true,
        },
    ],
};

function group(kind: HomeNeedKind, over: Partial<HomeNeedGroup> = {}) {
    return {
        kind,
        count: 1,
        late: 0,
        totals: null,
        oldest: null,
        rows: [],
        more: 0,
        href: `/${kind.toLowerCase()}`,
        codes: [],
        ...over,
    } satisfies HomeNeedGroup;
}

describe("phoneFigures (A1)", () => {
    it("gives an owner Money in today, Bookings and To pack, each to its screen", () => {
        const figures = phoneFigures({ tiles: TILES, unavailable: [] });
        expect(figures.map((f) => [f.label, f.value, f.href])).toEqual([
            ["in today", "₹8,240", "/billing/invoices?paid=today"],
            ["bookings", "6", "/calendar?view=day"],
            ["to pack", "7", "/commerce/orders?needs=1"],
        ]);
    });

    it("gives a role without money Bookings, Came and To pack, no amount", () => {
        const { moneyIn: _m, ...tiles } = TILES;
        const figures = phoneFigures({ tiles, unavailable: [] });
        expect(figures.map((f) => [f.label, f.value])).toEqual([
            ["bookings", "6"],
            ["came", "3 of 6"],
            ["to pack", "7"],
        ]);
        expect(JSON.stringify(figures)).not.toContain("₹");
    });

    it("says nothing came in in words, and zero bookings as 0 (HPHome quiet)", () => {
        const figures = phoneFigures({
            tiles: {
                ...TILES,
                moneyIn: { totals: [], payments: 0, href: "/x" },
                bookingsToday: { ...BOOKINGS, count: 0 },
                toPack: { ...TO_PACK, count: 0 },
            },
            unavailable: [],
        });
        expect(figures.map((f) => f.value)).toEqual(["Nothing", "0", "0"]);
    });

    it("says one booking in the singular", () => {
        const figures = phoneFigures({
            tiles: { ...TILES, bookingsToday: { ...BOOKINGS, count: 1 } },
            unavailable: [],
        });
        expect(figures.find((f) => f.key === "bookings")).toMatchObject({
            value: "1",
            label: "booking",
        });
    });

    it("draws a dash, never 0, for a figure whose read failed", () => {
        const { moneyIn: _m, ...tiles } = TILES;
        const figures = phoneFigures({
            tiles,
            unavailable: [{ moduleKey: "PAYMENTS", label: "Money in today" }],
        });
        expect(figures[0]).toMatchObject({
            key: "moneyIn",
            value: null,
            absent: "Not known",
            href: "/billing/invoices",
        });
    });

    it("leaves out a figure whose module is off, and draws none from an old API", () => {
        const { bookingsToday: _b, came: _c, ...tiles } = TILES;
        expect(
            phoneFigures({ tiles, unavailable: [] }).map((f) => f.key),
        ).toEqual(["moneyIn", "toPack"]);
        expect(phoneFigures({ tiles: null, unavailable: [] })).toEqual([]);
    });

    it("says no one to mark with a dash when nobody is booked one to one", () => {
        const { moneyIn: _m, came: _c, ...tiles } = TILES;
        const came = phoneFigures({ tiles, unavailable: [] })[1];
        expect(came).toMatchObject({
            key: "came",
            value: null,
            absent: "None",
        });
    });
});

describe("phoneNext", () => {
    it("names what is next and how much is after it (HPHome busy)", () => {
        expect(phoneNext({ tiles: TILES, today: TODAY, now: NOW })).toEqual({
            title: "Next: 11:30 am Sourdough basics",
            sub: "8 booked · then 4 more today",
        });
    });

    it("says nothing is booked and when the next booking is (HPHome quiet)", () => {
        const next = phoneNext({
            tiles: {
                bookingsToday: {
                    count: 0,
                    next: {
                        startAt: "2026-10-21T04:30:00.000Z",
                        date: "2026-10-21",
                        time: "10:00",
                        what: "Sourdough basics",
                    },
                    laterToday: 0,
                    href: "/calendar",
                },
            },
            today: { ...TODAY, items: [] },
            now: NOW,
        });
        expect(next?.title).toBe("Nothing booked today");
        expect(next?.sub).toMatch(
            /^Next: .*21 Oct, 10:00 am Sourdough basics$/,
        );
    });

    it("says the day is done, not that nothing was booked, once it is over", () => {
        const next = phoneNext({
            tiles: {
                bookingsToday: {
                    count: 3,
                    next: null,
                    laterToday: 0,
                    href: "/calendar",
                },
            },
            today: TODAY,
            now: NOW,
        });
        expect(next).toEqual({ title: "Nothing more today", sub: null });
    });

    it("names the next pick-up when bookings aren't read", () => {
        const pickups: HomeToday = {
            ...TODAY,
            bookings: false,
            items: [
                {
                    ...TODAY.items[0],
                    id: "p1",
                    kind: "PICKUP",
                    what: "Order #1084 pick-up",
                    who: "Neha Joshi",
                },
            ],
        };
        expect(phoneNext({ tiles: {}, today: pickups, now: NOW })).toEqual({
            title: "Next: 11:30 am Order #1084 pick-up",
            sub: "Neha Joshi",
        });
    });

    it("has no line when neither bookings nor the day can be read", () => {
        expect(phoneNext({ tiles: {}, today: null, now: NOW })).toBeNull();
    });
});

describe("phoneLines (A2)", () => {
    const busy = [
        group("STOCK", { count: 2 }),
        group("REVIEWS"),
        group("PAYMENTS", { count: 2 }),
        group("ENQUIRIES", { count: 3, late: 1 }),
        group("AWAITING_PAYMENT", { count: 2 }),
        group("BILLS", { count: 10, late: 10 }),
        group("ORDERS", { count: 7, late: 3 }),
    ];

    it("puts late first, then money, then the rest, five at most", () => {
        const lines = phoneLines(busy);
        expect(lines.shown.map((g) => g.kind)).toEqual([
            "ORDERS",
            "BILLS",
            "AWAITING_PAYMENT",
            "PAYMENTS",
            "ENQUIRIES",
        ]);
        expect(lines.shown).toHaveLength(PHONE_LINES);
        expect(lines.folded.map((g) => g.kind)).toEqual(["REVIEWS", "STOCK"]);
        expect(lines.more).toBe("Show 2 more · review, low stock");
    });

    it("lifts a late group over money it would follow on the board", () => {
        const lines = phoneLines([
            group("BILLS", { count: 2 }),
            group("ORDERS", { count: 1, late: 1 }),
        ]);
        expect(lines.shown.map((g) => g.kind)).toEqual(["ORDERS", "BILLS"]);
        // Orders not late keep the board's place, after money.
        expect(
            phoneLines([group("ORDERS"), group("BILLS")]).shown.map(
                (g) => g.kind,
            ),
        ).toEqual(["BILLS", "ORDERS"]);
    });

    it("shows every line with nothing folded at five or fewer", () => {
        const lines = phoneLines(busy.slice(0, 4));
        expect(lines.folded).toEqual([]);
        expect(lines.more).toBe("");
        expect(phoneLines([]).shown).toEqual([]);
    });
});

describe("couldntCheckLine", () => {
    it("says what couldn't be checked, once, however many parts", () => {
        expect(
            couldntCheckLine([
                { moduleKey: "PAYMENTS", label: "Overdue invoices" },
                { moduleKey: "PAYMENTS", label: "Money in today" },
            ]),
        ).toBe("Couldn't check overdue invoices and money in today just now");
        expect(couldntCheckLine([])).toBeNull();
    });
});

describe("daySheetTitle", () => {
    it("names the day", () => {
        expect(daySheetTitle("2026-10-19")).toBe("Today, Mon 19 Oct");
        expect(daySheetTitle(null)).toBe("Today");
    });
});
