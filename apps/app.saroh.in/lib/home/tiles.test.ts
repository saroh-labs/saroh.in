import { describe, expect, it } from "vitest";

import type { HomeTiles, HomeUnavailable } from "./service";
import { bookingsSub, cameSub, nextBookingSentence, tileViews } from "./tiles";

const TODAY = "2026-10-19";

/** Rye & Co.'s busy Monday afternoon (board `HAPageD`). */
const BUSY: HomeTiles = {
    bookingsToday: {
        count: 6,
        next: {
            startAt: "2026-10-19T06:00:00.000Z",
            date: TODAY,
            time: "11:30",
            what: "Sourdough basics",
        },
        laterToday: 3,
        href: "/calendar",
    },
    toPack: {
        count: 7,
        dueToday: 3,
        late: 3,
        inProgress: 1,
        href: "/commerce/orders",
    },
    moneyIn: {
        totals: [
            {
                currency: "INR",
                amountMinor: 824_000,
                lastWeekMinor: 700_000,
                change: { kind: "UP", percent: 18 },
            },
        ],
        payments: 14,
        href: "/billing/invoices?since=x",
    },
    came: {
        came: 3,
        due: 4,
        total: 6,
        next: {
            time: "12:00",
            person: "Kavya Iyer",
            startAt: "2026-10-19T06:30:00.000Z",
        },
        href: "/bookings",
    },
};

const views = (
    tiles: HomeTiles | null,
    over: { unavailable?: HomeUnavailable[]; fresh?: boolean } = {},
) =>
    tileViews({
        tiles,
        unavailable: over.unavailable ?? [],
        today: TODAY,
        fresh: over.fresh ?? false,
    });

describe("tileViews", () => {
    it("draws the busy day's four tiles, in the board's order", () => {
        expect(
            views(BUSY).map((t) => [t.label, t.value, t.sub, t.href]),
        ).toEqual([
            [
                "Bookings today",
                "6",
                "Next at 11:30 am, Sourdough basics",
                "/calendar",
            ],
            [
                "To pack or hand over",
                "7 orders",
                "3 due today",
                "/commerce/orders",
            ],
            [
                "Money in today",
                "₹8,240",
                "14 payments so far today",
                "/billing/invoices?since=x",
            ],
            ["Came", "3 of 6", "Kavya is next, at 12:00 pm", "/bookings"],
        ]);
    });

    it("says a quiet day in words, never 0 (board `HAQuietD`)", () => {
        const quiet: HomeTiles = {
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
            toPack: {
                count: 0,
                dueToday: 0,
                late: 0,
                inProgress: 2,
                href: "/commerce/orders",
            },
            moneyIn: {
                totals: [],
                payments: 0,
                href: "/billing/invoices",
            },
        };
        const tiles = views(quiet);
        expect(tiles.map((t) => [t.value, t.sub])).toEqual([
            ["None", "Next: Wed 21 Oct, 10:00 am, Sourdough basics"],
            ["Nothing", "All orders are on their way"],
            ["Nothing", "No payments yet today"],
            // Bookings were read and nobody is booked one to one: the dash.
            [null, "No bookings to mark today"],
        ]);
        expect(tiles[3].absent).toBe("None");
    });

    it("says a Monday's first booking is the first (board `HAMondayD`)", () => {
        const monday: HomeTiles = {
            bookingsToday: {
                count: 4,
                next: {
                    startAt: "2026-10-19T04:30:00.000Z",
                    date: TODAY,
                    time: "10:00",
                    what: "Sourdough basics",
                },
                laterToday: 3,
                href: "/calendar",
            },
            came: {
                came: 0,
                due: 0,
                total: 4,
                next: {
                    time: "10:00",
                    person: "Farah Khan",
                    startAt: "2026-10-19T04:30:00.000Z",
                },
                href: "/bookings",
            },
        };
        const [bookings, came] = views(monday);
        expect(bookings.sub).toBe("First at 10:00 am, Sourdough basics");
        expect(came.value).toBe("0 of 4");
        expect(came.sub).toBe("First at 10:00 am");
    });

    it("leaves money out for a role without it: three tiles (board `HAMemberD`)", () => {
        const { moneyIn: _money, ...member } = BUSY;
        const tiles = views(member);
        expect(tiles.map((t) => t.key)).toEqual(["bookings", "toPack", "came"]);
        expect(tiles.some((t) => t.value?.includes("₹"))).toBe(false);
    });

    it("shows a failed part as a dash with why, never 0 (board `HAFailedD`)", () => {
        const { moneyIn: _money, toPack: _pack, ...rest } = BUSY;
        const tiles = views(rest, {
            unavailable: [
                { moduleKey: "PAYMENTS", label: "Money in today" },
                { moduleKey: "COMMERCE", label: "Open orders" },
            ],
        });
        const pack = tiles.find((t) => t.key === "toPack");
        const money = tiles.find((t) => t.key === "moneyIn");
        expect(pack).toMatchObject({
            value: null,
            absent: "Not known",
            sub: "Couldn't check orders",
        });
        expect(money).toMatchObject({
            value: null,
            sub: "Couldn't check payments",
        });
        // Still in the board's order.
        expect(tiles.map((t) => t.key)).toEqual([
            "bookings",
            "toPack",
            "moneyIn",
            "came",
        ]);
    });

    it("says what will show for a business with nothing yet (board `HAGettingSetUpD`)", () => {
        const fresh: HomeTiles = {
            bookingsToday: {
                count: 0,
                next: null,
                laterToday: 0,
                href: "/calendar",
            },
            toPack: {
                count: 0,
                dueToday: 0,
                late: 0,
                inProgress: 0,
                href: "/commerce/orders",
            },
            moneyIn: { totals: [], payments: 0, href: "/billing/invoices" },
        };
        expect(
            views(fresh, { fresh: true }).map((t) => [t.value, t.sub]),
        ).toEqual([
            ["None yet", "Share your booking page to get the first"],
            ["None yet", "Orders show here as they come in"],
            ["Nothing yet", "Payments show here as they come in"],
            [null, "Shows once people book"],
        ]);
    });

    it("draws nothing from an API before Home A", () => {
        expect(views(null)).toEqual([]);
    });
});

describe("the lines under the figures", () => {
    it("names the next booking on another day", () => {
        expect(
            bookingsSub(
                {
                    count: 2,
                    next: {
                        startAt: "x",
                        date: "2026-10-20",
                        time: "09:00",
                        what: "Cleaning",
                    },
                    laterToday: 0,
                    href: "/calendar",
                },
                TODAY,
            ),
        ).toBe("Next: Tomorrow, 9:00 am, Cleaning");
    });

    it("says when nobody is left to mark", () => {
        expect(
            cameSub({ came: 6, due: 6, total: 6, next: null, href: "/b" }),
        ).toBe("Everyone due today is marked");
        expect(
            cameSub({
                came: 1,
                due: 2,
                total: 3,
                next: { time: "15:00", person: null, startAt: "x" },
                href: "/b",
            }),
        ).toBe("The next is at 3:00 pm");
    });

    it("says the next booking as a sentence for an empty day", () => {
        expect(
            nextBookingSentence(
                {
                    count: 0,
                    next: {
                        startAt: "x",
                        date: "2026-10-21",
                        time: "10:00",
                        what: "Sourdough basics",
                    },
                    laterToday: 0,
                    href: "/calendar",
                },
                TODAY,
            ),
        ).toBe("Next: Wednesday 21 Oct at 10:00 am, Sourdough basics.");
        expect(nextBookingSentence(undefined, TODAY)).toBeNull();
    });
});
