import { formatDay } from "@/lib/format/datetime";
import { count } from "@/lib/format/plural";
import type { ComparePeriod } from "@/lib/insights/compare-words";
import { countChangeLine, lastPeriod } from "@/lib/insights/compare-words";

/**
 * The words of Insights' website half (audit F3, F10): a day the way the
 * takings say one ("4 Sep", never "09-04"), a day's readout, and a page by
 * the name a merchant gave it rather than its address. Pure; tested in
 * `website-words.test.ts`.
 */

/** The axis label under a day: "4 Sep". */
export function dayTick(date: string): string {
    return formatDay(date, { year: "never" });
}

/**
 * A day's readout: "Thursday 1 Oct · 412 visits · 280 visitors", and a day
 * nobody came "Thursday 1 Oct · no visits" (zero said in words).
 */
export function dayReadout(point: {
    date: string;
    views: number;
    uniques: number;
}): string {
    const day = formatDay(point.date, { weekday: "long", year: "never" });
    if (point.views <= 0) return `${day} · no visits`;
    return `${day} · ${count(point.views, "visit", "visits")} · ${count(point.uniques, "visitor")}`;
}

/**
 * The sentence above the visits chart (`IBFromD`): "1,689 visits from
 * 1,109 visitors. Busiest on Saturday 17 Oct. On 1 Oct nobody visited."
 * Days nobody came are named (one) or counted (more), never left out.
 */
export function visitsLine(
    daily: readonly { date: string; views: number; uniques: number }[],
    period: ComparePeriod,
): string {
    const views = daily.reduce((n, d) => n + d.views, 0);
    if (views <= 0)
        return `No visits to your website in ${lastPeriod(period)}.`;
    const visitors = daily.reduce((n, d) => n + d.uniques, 0);
    const busiest = daily.reduce((top, d) => (d.views > top.views ? d : top));
    const empty = daily.filter((d) => d.views <= 0);
    const head = `${count(views, "visit")} from ${count(visitors, "visitor")}. Busiest on ${formatDay(busiest.date, { weekday: "long", year: "never" })}`;
    if (empty.length === 0) return `${head}.`;
    if (empty.length === 1) {
        return `${head}. On ${dayTick(empty[0].date)} nobody visited.`;
    }
    return `${head}. Nobody visited on ${count(empty.length, "day")}.`;
}

/**
 * A figure's names on the tab (`IBFromD`), in its order. Visitors, not
 * People (owner, 21 Oct): a visitor who comes back another day is counted
 * again, so it is never a count of people.
 */
export const WEBSITE_FIGURE = {
    visits: "Visits",
    visitors: "Visitors",
    enquiries: "Enquiries",
    orders: "Paid orders and bookings",
} as const;

/**
 * The line under a figure: how it moved on the period before, as a count
 * ("14 more than the 4 weeks before"), and whether that is up. Null when
 * the period before couldn't be read: the page says so once instead.
 */
export function figureChange(
    now: number,
    before: number | null,
    period: ComparePeriod,
): { line: string; up: boolean } | null {
    if (before === null) return null;
    return {
        line: countChangeLine(now, before, period),
        up: before > 0 && now > before,
    };
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
    oneSite = false,
}: {
    orders: number;
    from: string;
    rangeLabel: string;
    /**
     * One website is chosen: paid orders are still the whole business's
     * (they aren't recorded by website), and the line says so.
     */
    oneSite?: boolean;
}): string | null {
    const before = from < ORDERS_RECORDED_FROM;
    const line =
        orders <= 0
            ? before
                ? `No paid orders recorded in the last ${rangeLabel}. Insights began recording them in October 2026, so earlier ones aren't counted.`
                : `No paid orders in the last ${rangeLabel}.`
            : before
              ? "Orders counts from October 2026, when Insights began recording paid orders. Earlier ones aren't counted."
              : null;
    const whole = oneSite
        ? "Paid orders and bookings are counted for your whole business, not one website."
        : null;
    return [line, whole].filter(Boolean).join(" ") || null;
}

/** Which days of `days` carry a label: about `ticks` of them, evenly. */
export function tickEvery(days: number, ticks: number): number {
    return Math.max(1, Math.ceil(days / Math.max(1, ticks)));
}
