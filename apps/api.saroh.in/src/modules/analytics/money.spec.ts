/**
 * Insights' Money folds (DEC-171), pure: the period against the one before,
 * places left out at nothing, a young business never compared, the best
 * week, the usual order, and today against the same weekday last week.
 */
import {
    bestWeek,
    foldPeriod,
    markWeeks,
    moneyIn,
    moneyPlaces,
    moneyToday,
    usualOrder,
} from "./money";
import { periodWindows } from "./period";
import type { TakingsDayRow, TakingsWeek } from "./takings";
import {
    INVOICES_PLACE,
    locationPlace,
    ONLINE_PLACE,
    placeKind,
} from "./takings";

const ZONE = "Asia/Kolkata";
const MONDAY = new Date("2026-10-19T03:30:00.000Z");
const W = periodWindows("7d", MONDAY, ZONE);
const HILL = locationPlace("hill");

function row(
    day: string,
    place: string,
    amount: string,
    extra: Partial<TakingsDayRow> = {},
): TakingsDayRow {
    return {
        day,
        place,
        currency: "INR",
        amount,
        orders: place === INVOICES_PLACE ? 0 : 1,
        payments: 1,
        ...extra,
    };
}

const named = (key: string) => ({
    kind: placeKind(key),
    name: key === HILL ? "Hill Road" : null,
});

const ROWS: TakingsDayRow[] = [
    // The last 7 days, 13 – 19 Oct.
    row("2026-10-13", HILL, "1000"),
    row("2026-10-15", ONLINE_PLACE, "500", { orders: 2, payments: 2 }),
    row("2026-10-19", INVOICES_PLACE, "3000"),
    // The 7 before, 6 – 12 Oct.
    row("2026-10-06", HILL, "400"),
    row("2026-10-08", HILL, "1300", { orders: 2, payments: 2 }),
    row("2026-10-12", INVOICES_PLACE, "200"),
    // Another currency, and a day outside both.
    row("2026-10-14", HILL, "90", { currency: "USD" }),
    row("2026-10-05", HILL, "9999"),
];

describe("Insights money folds", () => {
    it("sums the period and the one before, in the business's currency only", () => {
        const fold = foldPeriod(ROWS, "INR", W);
        expect(moneyIn(fold, false)).toEqual({
            amountMinor: 450_000,
            beforeMinor: 190_000,
            change: { kind: "UP", percent: 137 },
            payments: 4,
            paymentsBefore: 4,
            orders: 3,
            ordersBefore: 3,
            bills: 1,
            billsBefore: 1,
        });
    });

    it("never compares a business too young for the period before", () => {
        const fold = foldPeriod(ROWS, "INR", W);
        expect(moneyIn(fold, true).change).toEqual({ kind: "THIN" });
        expect(
            moneyPlaces(fold, named, true).every(
                (p) => p.change.kind === "THIN",
            ),
        ).toBe(true);
    });

    it("says THIN, not a percentage, when the period before is too small", () => {
        const fold = foldPeriod(
            [row("2026-10-13", HILL, "1000"), row("2026-10-07", HILL, "10")],
            "INR",
            W,
        );
        expect(moneyIn(fold, false).change).toEqual({ kind: "THIN" });
    });

    it("lists places largest first, leaving out a place that took nothing now", () => {
        const fold = foldPeriod(ROWS, "INR", W);
        const places = moneyPlaces(fold, named, false);
        expect(places.map((p) => p.key)).toEqual([
            INVOICES_PLACE,
            HILL,
            ONLINE_PLACE,
        ]);
        expect(places[1]).toMatchObject({
            kind: "LOCATION",
            name: "Hill Road",
            amountMinor: 100_000,
            beforeMinor: 170_000,
        });
        // Online took nothing before: never "up from nothing" as a percent.
        expect(places[2]).toMatchObject({
            kind: "ONLINE",
            beforeMinor: 0,
            change: { kind: "THIN" },
        });

        const quiet = foldPeriod(
            [row("2026-10-07", ONLINE_PLACE, "500")],
            "INR",
            W,
        );
        expect(moneyPlaces(quiet, named, false)).toEqual([]);
    });

    it("marks the weeks and finds the best, the earlier on a tie", () => {
        const week = (
            start: string,
            end: string,
            minor: number,
        ): TakingsWeek => ({
            start,
            end,
            takingsMinor: minor,
            orderTakingsMinor: minor,
            orders: 1,
            payments: 1,
            places: [],
        });
        const weeks = [
            week("2026-09-28", "2026-10-04", 5_000),
            week("2026-10-05", "2026-10-11", 9_000),
            week("2026-10-12", "2026-10-18", 9_000),
        ];
        expect(markWeeks(weeks, W).map((w) => w.in)).toEqual([
            null,
            "BEFORE",
            "PERIOD",
        ]);
        expect(bestWeek(weeks)).toEqual({
            start: "2026-10-05",
            end: "2026-10-11",
            takingsMinor: 9_000,
        });
        expect(bestWeek([week("2026-10-05", "2026-10-11", 0)])).toBeNull();
    });

    it("reads the usual order for the period and the one before", () => {
        const usual = usualOrder(
            [
                { window: "PERIOD", currency: "INR", amount: "999", orders: 5 },
                {
                    window: "BEFORE",
                    currency: "INR",
                    amount: "1000",
                    orders: 3,
                },
                { window: "PERIOD", currency: "USD", amount: "50", orders: 1 },
            ],
            "INR",
        );
        expect(usual).toEqual({
            amountMinor: 99_900,
            beforeMinor: 100_000,
            orders: 5,
            ordersBefore: 3,
        });
        expect(usualOrder([], "INR")).toEqual({
            amountMinor: null,
            beforeMinor: null,
            orders: 0,
            ordersBefore: 0,
        });
    });

    it("reads today against the same weekday last week so far", () => {
        const today = moneyToday(
            ROWS,
            [
                row("2026-10-12", HILL, "400"),
                row("2026-10-12", HILL, "5", { currency: "USD" }),
            ],
            "INR",
            "2026-10-19",
        );
        expect(today).toEqual({
            date: "2026-10-19",
            amountMinor: 300_000,
            payments: 1,
            sameWeekdayLastWeekMinor: 40_000,
            sameWeekdayLastWeekPayments: 1,
            change: { kind: "THIN" },
        });
    });
});
