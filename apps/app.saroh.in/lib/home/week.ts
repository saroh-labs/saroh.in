import { formatMoney } from "@/lib/format/money";

import type {
    HomeWeek,
    HomeWeekChange,
    HomeWeekOwed,
    HomeWeekTakings,
} from "./service";

/**
 * Home's "This week" (round 2, F7), in words, as the Home design writes
 * them: "Sales so far · ₹18,450 · Up 12% on the same days last week".
 * The API sends each figure only to someone who may read it, and decides
 * the comparison; this says it. Pure, so it is tested without a page.
 */

export interface WeekRow {
    key: string;
    label: string;
    value: string;
    sub: string;
    /** Said in the danger colour: takings down, or a bill overdue. */
    bad: boolean;
    href: string;
}

const plural = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;

/** "Up 12% on the same days last week", or why there's no comparing. */
export function changeLine(change: HomeWeekChange): string {
    switch (change.kind) {
        case "THIN":
            return "Not enough last week to compare";
        case "LEVEL":
            return "Level with last week";
        case "UP":
            return `Up ${change.percent}% on the same days last week`;
        case "DOWN":
            return `Down ${change.percent}% on the same days last week`;
    }
}

/** "3 more than last week", "Same as last week". */
export function bookingsLine(count: number, lastWeek: number): string {
    if (lastWeek === 0) return "Nothing booked last week to compare";
    const d = count - lastWeek;
    if (d === 0) return "Same as last week";
    return `${Math.abs(d)} ${d > 0 ? "more" : "fewer"} than last week`;
}

// Spelt out rather than `Intl`'s short month, which some ICU builds write
// "Sept" and the design doesn't.
const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
];

/** "Since Monday 14 Sep", from the business's Monday (`2026-09-14`). */
export function sinceMonday(startDate: string): string {
    const [, month, day] = startDate.split("-").map(Number);
    const name = month ? MONTHS[month - 1] : undefined;
    return name && day ? `Since Monday ${day} ${name}` : "Since Monday";
}

/** "3 bills · 1 overdue", or "Nothing unpaid". */
export function owedLine(owed: HomeWeekOwed): string {
    if (owed.bills === 0) return "Nothing unpaid";
    const bills = plural(owed.bills, "bill", "bills");
    return owed.overdue > 0 ? `${bills} · ${owed.overdue} overdue` : bills;
}

function takingsRow(t: HomeWeekTakings): WeekRow {
    return {
        key: `takings:${t.currency}`,
        label: "Sales so far",
        value: formatMoney(t.amountMinor, t.currency) ?? "",
        sub: changeLine(t.change),
        bad: t.change.kind === "DOWN",
        href: t.href,
    };
}

/**
 * The panel's rows in the design's order: takings, bookings, orders, owed.
 * The design draws takings only once money has come in this week, and
 * orders only once one is placed; bookings and owed show at zero, since
 * "0 bookings, 3 fewer than last week" is itself the news.
 */
export function weekRows(week: HomeWeek | null): WeekRow[] {
    if (!week) return [];
    const rows: WeekRow[] = [];
    for (const t of week.takings ?? []) {
        if (t.amountMinor > 0) rows.push(takingsRow(t));
    }
    if (week.bookings) {
        rows.push({
            key: "bookings",
            label: "Bookings this week",
            value: String(week.bookings.count),
            sub: bookingsLine(week.bookings.count, week.bookings.lastWeek),
            bad: false,
            href: week.bookings.href,
        });
    }
    if (week.orders && week.orders.count > 0) {
        rows.push({
            key: "orders",
            label: "Orders this week",
            value: String(week.orders.count),
            sub: sinceMonday(week.startDate),
            bad: false,
            href: week.orders.href,
        });
    }
    if (week.owed) {
        const { owed } = week;
        rows.push({
            key: "owed",
            label: "Owed to you",
            value:
                owed.totals.length > 0
                    ? owed.totals
                          .map((t) => formatMoney(t.amountMinor, t.currency))
                          .join(" + ")
                    : // Invoices only: a booking paid at the desk is no
                      // invoice until it's taken (UX-083).
                      "All invoices paid",
            sub: owedLine(owed),
            bad: owed.overdue > 0,
            href: owed.href,
        });
    }
    return rows;
}

/**
 * Whether Home draws the panel: never for a business with nothing sold,
 * booked or paid yet (it has "Get ready to take money" instead), nor when
 * there's no row to show.
 */
export function showsWeek(week: HomeWeek | null, fresh: boolean): boolean {
    return !fresh && weekRows(week).length > 0;
}
