/**
 * Insights' takings, the pure half (DEC-075): the twelve whole weeks in the
 * business's zone, the fold of day rows into them, and the one currency the
 * figures are in. The read itself is `takings.db.spec.ts`.
 */
import type { TakingsDayRow } from "./takings";
import {
    foldSoFar,
    foldTakings,
    INVOICES_PLACE,
    locationPlace,
    ONLINE_PLACE,
    pickCurrency,
    placeKind,
    placeStoreId,
    takingsWeeks,
    todayIn,
    weekInProgress,
} from "./takings";

const ZONE = "Asia/Kolkata";
// Sunday 4 Oct 2026, 23:00 in Mumbai — still the week of Monday 28 Sep.
const NOW = new Date("2026-10-04T17:30:00.000Z");

function row(day: string, place: string, rupees: string, orders = 1) {
    return {
        day,
        place,
        currency: "INR",
        amount: rupees,
        orders,
        payments: 1,
    } satisfies TakingsDayRow;
}

describe("takingsWeeks", () => {
    it("is the twelve whole weeks before this one, Monday to Sunday, oldest first", () => {
        const weeks = takingsWeeks(NOW, ZONE);
        expect(weeks).toHaveLength(12);
        expect(weeks[0].startDate).toBe("2026-07-06");
        expect(weeks[11]).toMatchObject({
            startDate: "2026-09-21",
            endDate: "2026-09-27",
        });
        // Monday 00:00 in Mumbai is Sunday 18:30 UTC.
        expect(weeks[11].start.toISOString()).toBe("2026-09-20T18:30:00.000Z");
        expect(weeks[11].end.toISOString()).toBe("2026-09-27T18:30:00.000Z");
        expect(weekInProgress(NOW, ZONE)).toBe("2026-09-28");
    });

    it("turns over at the business's midnight, not UTC's", () => {
        // 19:00 UTC Sunday is already Monday 00:30 in Mumbai.
        const monday = new Date("2026-10-04T19:00:00.000Z");
        expect(weekInProgress(monday, ZONE)).toBe("2026-10-05");
        expect(takingsWeeks(monday, ZONE)[11].startDate).toBe("2026-09-28");
    });

    it("keeps a week a clock change falls in whole, as the business lived it", () => {
        // London goes back an hour on Sunday 25 Oct 2026.
        const weeks = takingsWeeks(
            new Date("2026-11-04T12:00:00.000Z"),
            "Europe/London",
        );
        const changed = weeks.find((w) => w.startDate === "2026-10-19");
        expect(changed).toBeDefined();
        const hours =
            ((changed?.end.getTime() ?? 0) - (changed?.start.getTime() ?? 0)) /
            3_600_000;
        expect(hours).toBe(169);
    });
});

describe("foldTakings", () => {
    const windows = takingsWeeks(NOW, ZONE);

    it("puts each day in its week and splits it by place, largest first", () => {
        const weeks = foldTakings(
            windows,
            [
                row("2026-09-21", locationPlace("s1"), "1000.50"),
                row("2026-09-27", ONLINE_PLACE, "2500"),
                row("2026-09-27", INVOICES_PLACE, "400", 0),
                row("2026-09-20", locationPlace("s1"), "100"),
            ],
            "INR",
        );
        expect(weeks[11]).toEqual({
            start: "2026-09-21",
            end: "2026-09-27",
            takingsMinor: 390_050,
            orderTakingsMinor: 350_050,
            orders: 2,
            payments: 3,
            places: [
                { key: ONLINE_PLACE, takingsMinor: 250_000 },
                { key: "location:s1", takingsMinor: 100_050 },
                { key: INVOICES_PLACE, takingsMinor: 40_000 },
            ],
        });
        expect(weeks[10].takingsMinor).toBe(10_000);
    });

    it("keeps a week with no sales, at zero, and drops what is outside the twelve", () => {
        const weeks = foldTakings(
            windows,
            [
                row("2026-09-28", ONLINE_PLACE, "999"),
                row("2026-07-05", ONLINE_PLACE, "999"),
            ],
            "INR",
        );
        expect(weeks).toHaveLength(12);
        expect(weeks.every((w) => w.takingsMinor === 0)).toBe(true);
        expect(weeks.every((w) => w.places.length === 0)).toBe(true);
    });

    it("leaves out another currency rather than adding it in", () => {
        const weeks = foldTakings(
            windows,
            [
                row("2026-09-22", ONLINE_PLACE, "100"),
                { ...row("2026-09-22", ONLINE_PLACE, "50"), currency: "USD" },
            ],
            "INR",
        );
        expect(weeks[11].takingsMinor).toBe(10_000);
    });
});

describe("pickCurrency", () => {
    it("is the business's own, naming the others", () => {
        expect(
            pickCurrency("INR", [
                row("2026-09-22", ONLINE_PLACE, "1"),
                { ...row("2026-09-22", ONLINE_PLACE, "900"), currency: "USD" },
            ]),
        ).toEqual({ currency: "INR", others: ["USD"] });
    });

    it("falls back to the one most money was taken in, then to none", () => {
        expect(
            pickCurrency(null, [
                { ...row("2026-09-22", ONLINE_PLACE, "1"), currency: "EUR" },
                { ...row("2026-09-22", ONLINE_PLACE, "900"), currency: "USD" },
            ]),
        ).toEqual({ currency: "USD", others: ["EUR"] });
        expect(pickCurrency(null, [])).toEqual({ currency: null, others: [] });
    });
});

describe("places", () => {
    it("names the kind and the location behind a key", () => {
        expect(placeKind(ONLINE_PLACE)).toBe("ONLINE");
        expect(placeKind(INVOICES_PLACE)).toBe("INVOICES");
        expect(placeKind(locationPlace("s1"))).toBe("LOCATION");
        expect(placeStoreId(locationPlace("s1"))).toBe("s1");
        expect(placeStoreId(ONLINE_PLACE)).toBeNull();
    });
});

describe("foldSoFar", () => {
    it("is Monday to today, beside Monday to the same weekday last week", () => {
        // Wednesday 30 Sep: last week's Monday to Wednesday compares.
        const soFar = foldSoFar(
            [
                row("2026-09-28", ONLINE_PLACE, "100"),
                row("2026-09-30", ONLINE_PLACE, "50.50"),
                row("2026-09-21", ONLINE_PLACE, "80"),
                row("2026-09-23", ONLINE_PLACE, "20"),
                // Last Thursday is after the same weekday: left out.
                row("2026-09-24", ONLINE_PLACE, "999"),
                // A whole week of the twelve, not this one or the same days.
                row("2026-09-14", ONLINE_PLACE, "777"),
            ],
            "INR",
            "2026-09-28",
            "2026-09-30",
        );
        expect(soFar).toEqual({
            start: "2026-09-28",
            through: "2026-09-30",
            takingsMinor: 15_050,
            orders: 2,
            payments: 2,
            sameDaysLastWeekMinor: 10_000,
            sameDaysLastWeekPayments: 2,
        });
    });

    it("counts only the figures' currency", () => {
        const soFar = foldSoFar(
            [
                row("2026-09-28", ONLINE_PLACE, "100"),
                { ...row("2026-09-28", ONLINE_PLACE, "40"), currency: "USD" },
            ],
            "INR",
            "2026-09-28",
            "2026-09-28",
        );
        expect(soFar.takingsMinor).toBe(10_000);
        expect(soFar.payments).toBe(1);
    });

    it("is today in the business's zone", () => {
        // 23:00 Sunday in Mumbai is still Sunday; 00:15 Monday is the next day.
        expect(todayIn(NOW, ZONE)).toBe("2026-10-04");
        expect(todayIn(new Date("2026-10-04T18:45:00.000Z"), ZONE)).toBe(
            "2026-10-05",
        );
    });
});
