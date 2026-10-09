import { NUMBER_LOCALE } from "@/lib/format/locale";

import { dayMonth, weekdayDayMonth } from "./takings-words";

/**
 * The words of Insights' website half (audit F3, F10): a day the way the
 * takings say one ("4 Sep", never "09-04"), a day's readout, and a page by
 * the name a merchant gave it rather than its address. Pure; tested in
 * `website-words.test.ts`.
 */

/** "1 visit", "412 visits". */
function count(n: number, one: string, many: string): string {
    return `${n.toLocaleString(NUMBER_LOCALE)} ${n === 1 ? one : many}`;
}

/** The axis label under a day: "4 Sep". */
export function dayTick(date: string): string {
    return dayMonth(date);
}

/** A day's readout: "Thursday 1 Oct · 412 visits · 280 visitors". */
export function dayReadout(point: {
    date: string;
    views: number;
    uniques: number;
}): string {
    return `${weekdayDayMonth(point.date)} · ${count(point.views, "visit", "visits")} · ${count(point.uniques, "visitor", "visitors")}`;
}

/**
 * A page's name from its address: "/" is the home page, and the last part
 * of any other, de-slugged — "/products/kraft-mailer-box" is "Kraft mailer
 * box". The address stays beside it, so two pages that read alike are
 * still told apart.
 */
export function pageTitle(path: string): string {
    const clean = path.split(/[?#]/)[0] ?? path;
    const last = clean
        .split("/")
        .filter((part) => part.length > 0)
        .at(-1);
    if (!last) return "Home page";
    let words: string;
    try {
        words = decodeURIComponent(last);
    } catch {
        words = last;
    }
    words = words.replace(/[-_]+/g, " ").trim();
    if (!words) return path;
    return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The day by which every business's paid orders are recorded. `order.paid`
 * is written from #867, which reached production in October 2026; nothing
 * before it is made up from the orders table (DEC-012), so a range that
 * reaches back past this day counts fewer orders than were paid. Set at the
 * month's end, so the note says so for as long as it might be true.
 */
export const ORDERS_RECORDED_FROM = "2026-10-31";

/**
 * The line under the website's figures about Orders (#919), or nothing
 * when the figure needs no words: whether none were paid, and whether the
 * range reaches back before orders were recorded. `from` is the range's
 * first day (`YYYY-MM-DD`), `rangeLabel` its name ("30 days").
 */
export function ordersLine({
    orders,
    from,
    rangeLabel,
}: {
    orders: number;
    from: string;
    rangeLabel: string;
}): string | null {
    const before = from < ORDERS_RECORDED_FROM;
    if (orders <= 0) {
        return before
            ? `No paid orders recorded in the last ${rangeLabel}. Insights began recording them in October 2026, so earlier ones aren't counted.`
            : `No paid orders in the last ${rangeLabel}.`;
    }
    return before
        ? "Orders counts from October 2026, when Insights began recording paid orders; earlier ones aren't counted."
        : null;
}

/** Which days of `days` carry a label: about `ticks` of them, evenly. */
export function tickEvery(days: number, ticks: number): number {
    return Math.max(1, Math.ceil(days / Math.max(1, ticks)));
}
