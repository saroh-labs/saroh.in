import type { InsightsPeriod } from "./period";
import { periodWindow } from "./period";
import type { MoneyRead, MoneyWeekRead } from "./reads";

/**
 * A Money read as the API sends it (`GET analytics/money`, #1079, #1093),
 * for Rye & Co. on Monday 19 Oct 2026, the last 4 weeks: rolling weeks
 * ending today, the best the newest. For the words' and the tab's tests.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function iso(at: number): string {
    return new Date(at).toISOString().slice(0, 10);
}

/** `n` rolling seven-day bars ending on `to`, oldest first. */
export function rollingWeeks(
    to: string,
    takings: readonly number[],
    marks: readonly MoneyWeekRead["in"][],
): MoneyWeekRead[] {
    const end = Date.parse(`${to}T00:00:00.000Z`);
    const n = takings.length;
    return takings.map((minor, i) => {
        const last = end - (n - 1 - i) * 7 * DAY_MS;
        return {
            start: iso(last - 6 * DAY_MS),
            end: iso(last),
            takingsMinor: minor,
            orders: minor > 0 ? 60 : 0,
            payments: minor > 0 ? 64 : 0,
            in: marks[i] ?? null,
            days: 7,
        };
    });
}

const TAKINGS = [38, 41, 36, 44, 40, 43, 45, 41, 44, 47, 43, 50.1].map((r) =>
    Math.round(r * 100_000),
);

const MARKS: MoneyWeekRead["in"][] = [
    ...Array<null>(4).fill(null),
    ...Array<"BEFORE">(4).fill("BEFORE"),
    ...Array<"PERIOD">(4).fill("PERIOD"),
];

export function moneyRead(
    over: Partial<MoneyRead> = {},
    period: InsightsPeriod = "4w",
): MoneyRead {
    const weeks = rollingWeeks("2026-10-19", TAKINGS, MARKS);
    const best = weeks[11];
    return {
        period,
        zone: "Asia/Kolkata",
        currency: "INR",
        otherCurrencies: [],
        window: periodWindow(period, "2026-10-19"),
        startedOn: "2025-01-06",
        ageDays: 651,
        thin: false,
        hasSales: true,
        firstSaleOn: "2025-01-10",
        moneyIn: {
            amountMinor: 18_460_000,
            beforeMinor: 16_930_000,
            change: { kind: "UP", percent: 9 },
            payments: 288,
            paymentsBefore: 267,
            orders: 271,
            ordersBefore: 255,
            bills: 17,
            billsBefore: 12,
        },
        usualOrder: {
            amountMinor: 64_000,
            beforeMinor: 63_500,
            orders: 271,
            ordersBefore: 255,
        },
        bestWeek: {
            start: best.start,
            end: best.end,
            takingsMinor: best.takingsMinor,
        },
        weeks,
        days: [
            { date: "2026-10-13", amountMinor: 520_000, payments: 9 },
            { date: "2026-10-14", amountMinor: 610_000, payments: 10 },
            { date: "2026-10-15", amountMinor: 700_000, payments: 11 },
            { date: "2026-10-16", amountMinor: 650_000, payments: 10 },
            { date: "2026-10-17", amountMinor: 1_190_000, payments: 14 },
            { date: "2026-10-18", amountMinor: 900_000, payments: 6 },
            { date: "2026-10-19", amountMinor: 440_000, payments: 4 },
        ],
        places: [
            {
                key: "location:hill",
                kind: "LOCATION",
                name: "Hill Road",
                amountMinor: 10_707_000,
                beforeMinor: 10_400_000,
                change: { kind: "UP", percent: 3 },
            },
            {
                key: "online",
                kind: "ONLINE",
                name: null,
                amountMinor: 6_276_000,
                beforeMinor: 5_320_000,
                change: { kind: "UP", percent: 18 },
            },
            {
                key: "invoices",
                kind: "INVOICES",
                name: null,
                amountMinor: 1_477_000,
                beforeMinor: 1_320_000,
                change: { kind: "UP", percent: 12 },
            },
        ],
        owed: {
            totals: [{ currency: "INR", amountMinor: 3_297_000 }],
            bills: 16,
            overdue: 10,
            byAge: {
                notDue: {
                    count: 6,
                    totals: [{ currency: "INR", amountMinor: 640_000 }],
                    href: "/billing/invoices?view=issued",
                },
                late1to30: {
                    count: 8,
                    totals: [{ currency: "INR", amountMinor: 1_404_000 }],
                    href: "/billing/invoices?view=overdue",
                },
                lateOver30: {
                    count: 2,
                    totals: [{ currency: "INR", amountMinor: 1_253_000 }],
                    href: "/billing/invoices?view=overdue",
                },
            },
            href: "/billing/invoices?view=overdue",
        },
        ...over,
    };
}
