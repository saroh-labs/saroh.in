import { ORDERS_RECORDED_FROM } from "@/lib/analytics/website-words";
import { formatDay } from "@/lib/format/datetime";
import {
    formatCompact,
    formatMoney,
    formatNumber,
    moneySign,
} from "@/lib/format/money";
import { count } from "@/lib/format/plural";
import { ordersHref } from "@/lib/insights/links";

import type { AnalyticsSummary } from "@/lib/analytics/summary";

import {
    ABOUT_SAME_PERCENT,
    capitalise,
    daysLabel,
    lastPeriod,
    TIMES_FROM_PERCENT,
} from "./compare-words";
import type { InsightsPeriod } from "./period";
import type { MoneyRead, MoneyWeekRead, SellsRead } from "./reads";

/**
 * The words of Insights' Overview (DEC-171, plan U10, #1089; boards
 * `IBOverviewD`, `IBPeriodD`, `IBThinD`, `IBNoSalesD`, `IBMemberD`,
 * `IBFailedD`): the three answers, each in one sentence written from the
 * same figures its card draws, the line under them that says what was
 * counted, and the one notice for a part that couldn't be read. Pure:
 * tested in `overview-words.test.ts`. The comparisons follow
 * `compare-words.ts` (#1081): zero said in words, never "100% below", a
 * percentage only as big as is true.
 */

/** Whole rupees, as a merchant reads a period's money: "₹1,84,600". */
export function rupees(minor: number, currency: string | null): string {
    return formatMoney(Math.round(minor / 100) * 100, currency);
}

/** "the 4 before", as the answer says it after "more than". */
const SHORT_BEFORE: Record<InsightsPeriod, string> = {
    "7d": "the 7 before",
    "4w": "the 4 before",
    "3m": "the 3 months before",
};

/** When a young business first has a whole period before to compare. */
const COMPARES_AFTER: Record<InsightsPeriod, string> = {
    "7d": "2 weeks",
    "4w": "8 weeks",
    "3m": "6 months",
};

/** "your first 3 weeks", "your first 10 days". */
function firstSpan(ageDays: number): string {
    const days = ageDays + 1;
    if (days < 14) return `your first ${count(days, "day")}`;
    return `your first ${count(Math.floor(days / 7), "week")}`;
}

/** An answer: the one word that answers the question, then why. */
export interface Answer {
    /** "Yes.", "No.", "About the same.", or nothing to say plainly. */
    lead: string | null;
    text: string;
}

/**
 * "Am I making more money?" (`IBOverviewD`): "Yes. ₹1,84,600 came in over
 * the last 4 weeks, ₹15,300 more than the 4 before (up 9%)." A business
 * too young for the period before says what came in and when comparing
 * starts (`IBThinD`).
 */
export function moneyAnswer(
    read: MoneyRead,
    /**
     * The Money tab leaves the percentage to its Money in figure, which
     * says it right under the sentence (`IBMoneyD`).
     */
    { percent = true }: { percent?: boolean } = {},
): Answer {
    const { amountMinor: now, beforeMinor: before, change } = read.moneyIn;
    const cur = read.currency;
    const last = lastPeriod(read.period);
    const was = SHORT_BEFORE[read.period];

    if (read.thin) {
        // Over the whole life of the business when the period covers it.
        const over =
            read.ageDays + 1 <= read.window.days
                ? `${firstSpan(read.ageDays)} on Saroh`
                : last;
        const took =
            now > 0
                ? `${rupees(now, cur)} came in over ${over}.`
                : `Nothing came in over ${over}.`;
        return {
            lead: null,
            text: `${took} There is nothing earlier to compare with yet. Comparing starts after ${COMPARES_AFTER[read.period]}.`,
        };
    }
    if (now <= 0 && before <= 0) {
        return {
            lead: null,
            text: `Nothing came in over ${last}, nor ${was}.`,
        };
    }
    if (now <= 0) {
        return {
            lead: "No.",
            text: `Nothing came in over ${last}, against ${rupees(before, cur)} in ${was}.`,
        };
    }
    const took = `${rupees(now, cur)} came in over ${last}`;
    if (before <= 0) {
        return { lead: "Yes.", text: `${took}. Nothing came in ${was}.` };
    }
    if (change.kind === "THIN") {
        return {
            lead: null,
            text: `${took}. Too little came in ${was} to compare.`,
        };
    }
    if (change.kind === "LEVEL" || change.percent <= ABOUT_SAME_PERCENT) {
        return {
            lead: "About the same.",
            text: `${took}, against ${rupees(before, cur)} in ${was}.`,
        };
    }
    if (change.kind === "UP") {
        const how =
            change.percent >= TIMES_FROM_PERCENT
                ? `about ${Math.round((100 + change.percent) / 100)} times as much`
                : `up ${change.percent}%`;
        return {
            lead: "Yes.",
            text: `${took}, ${rupees(now - before, cur)} more than ${was}${percent ? ` (${how})` : ""}.`,
        };
    }
    // Something came in, so it is never all gone.
    return {
        lead: "No.",
        text: `${took}, ${rupees(before - now, cur)} less than ${was}${percent ? ` (down ${Math.min(change.percent, 99)}%)` : ""}.`,
    };
}

/** One bar of the money card's picture. */
export interface MoneyBar {
    key: string;
    /** Share of the chart's height, 0 to 100. */
    heightPercent: number;
    tone: "now" | "before" | "old";
    best: boolean;
    /** "Week of 12 Oct, ₹50,000", "Tue 13 Oct, ₹6,200". */
    label: string;
    /** Its amount, compact, over the best week's bar: "₹50K". */
    short: string;
    /** Under the bar, when it carries one: "27 Jul", "Tue". */
    tick: string | null;
}

export interface MoneyChart {
    kind: "weeks" | "days";
    bars: MoneyBar[];
    /** The grid's three lines, top first: "₹50K", "₹25K", "₹0". */
    grid: [string, string, string];
    /** What the picture shows, for a screen reader. */
    label: string;
    /** The legend, in the order drawn; none for the days. */
    legend: { tone: MoneyBar["tone"]; label: string }[];
}

/** The smallest of 1, 2, 2.5 and 5 times a power of ten at or above `n`. */
export function niceCeiling(n: number): number {
    if (n <= 0) return 0;
    const power = 10 ** Math.floor(Math.log10(n));
    for (const step of [1, 2, 2.5, 5, 10]) {
        if (step * power >= n) return step * power;
    }
    return 10 * power;
}

/** "₹50K": a gridline's money, compact. Never for a sum someone owes. */
function gridMoney(minor: number, currency: string | null): string {
    const sign = currency ? moneySign(currency) : "";
    return `${sign}${formatCompact(Math.round(minor / 100))}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function weekday(day: string): string {
    return WEEKDAYS[new Date(`${day}T00:00:00.000Z`).getUTCDay()] ?? "";
}

function scaleOf(values: readonly number[]): number {
    return niceCeiling(Math.max(0, ...values));
}

const height = (minor: number, top: number) =>
    top > 0 ? Math.max(0, Math.min(100, (minor / top) * 100)) : 0;

/**
 * A weekly bar's name: "Week of 13 Oct" for seven days ending on today's
 * weekday; the days themselves, "20 to 27 Jul", for a 3-month window's
 * first bar, which holds the days over whole weeks.
 */
export function barName(w: Pick<MoneyWeekRead, "start" | "end" | "days">) {
    return w.days !== undefined && w.days !== 7
        ? daysLabel(w.start, w.end)
        : `Week of ${formatDay(w.start, { year: "never" })}`;
}

/** Four dates under a row of `n` bars: the first, two between, the last. */
export function tickIndexes(n: number): Set<number> {
    if (n <= 0) return new Set();
    return new Set([0, Math.round(n / 3), Math.round((2 * n) / 3), n - 1]);
}

/** The weeks a young business has had, oldest first (`IBThinD`). */
export function weeksSoFar(read: MoneyRead): MoneyWeekRead[] {
    return read.weeks.filter((w) => w.end >= read.startedOn);
}

/**
 * The money card's picture: the last 7 days a bar a day (`IBPeriodD`);
 * otherwise the twelve weeks, the period dark, the one before light, the
 * rest faint and the best week in Clay with its amount (`IBOverviewD`).
 */
export function moneyChart(read: MoneyRead): MoneyChart {
    const cur = read.currency;
    if (read.period === "7d" && read.days && read.days.length > 0) {
        const top = scaleOf(read.days.map((d) => d.amountMinor));
        return {
            kind: "days",
            bars: read.days.map((d) => ({
                key: d.date,
                heightPercent: height(d.amountMinor, top),
                tone: "now",
                best: false,
                label: `${weekday(d.date)} ${formatDay(d.date, { year: "never" })}, ${d.amountMinor > 0 ? rupees(d.amountMinor, cur) : "nothing"}`,
                short: gridMoney(d.amountMinor, cur),
                tick: weekday(d.date),
            })),
            grid: [
                gridMoney(top, cur),
                gridMoney(top / 2, cur),
                gridMoney(0, cur),
            ],
            label: `Money in each of the last 7 days, ${formatDay(read.window.from, { year: "never" })} to ${formatDay(read.window.to, { year: "never" })}.`,
            legend: [],
        };
    }
    return weeksChart(read);
}

/**
 * The weekly bars (`IBOverviewD`, `IBMoneyD`): the period dark, the one
 * before light, earlier faint, the best week in Clay with its amount over
 * it. The Money tab draws these whatever the period.
 */
export function weeksChart(read: MoneyRead): MoneyChart {
    const cur = read.currency;
    const weeks = read.weeks;
    const top = scaleOf(weeks.map((w) => w.takingsMinor));
    const best = read.bestWeek?.start ?? null;
    const ticks = tickIndexes(weeks.length);
    const bars: MoneyBar[] = weeks.map((w, i) => ({
        key: w.start,
        heightPercent: height(w.takingsMinor, top),
        tone: w.in === "PERIOD" ? "now" : w.in === "BEFORE" ? "before" : "old",
        best: w.start === best,
        label: `${barName(w)}, ${w.takingsMinor > 0 ? rupees(w.takingsMinor, cur) : "nothing"}`,
        short: gridMoney(w.takingsMinor, cur),
        tick: ticks.has(i) ? formatDay(w.start, { year: "never" }) : null,
    }));
    const legend: MoneyChart["legend"] = [];
    const has = (tone: MoneyBar["tone"]) => bars.some((b) => b.tone === tone);
    const name = capitalise(lastPeriod(read.period).replace(/^the /, ""));
    if (has("now")) legend.push({ tone: "now", label: name });
    if (has("before")) {
        legend.push({
            tone: "before",
            label: capitalise(SHORT_BEFORE[read.period]),
        });
    }
    if (has("old")) legend.push({ tone: "old", label: "Earlier" });
    const first = weeks.length > 0 ? weeks[0] : null;
    const lastWeek = weeks.length > 0 ? weeks[weeks.length - 1] : null;
    const bestNote = read.bestWeek
        ? ` The best, the week of ${formatDay(read.bestWeek.start, { year: "never" })}, took ${rupees(read.bestWeek.takingsMinor, cur)}.`
        : "";
    return {
        kind: "weeks",
        bars,
        grid: [gridMoney(top, cur), gridMoney(top / 2, cur), gridMoney(0, cur)],
        label:
            first && lastWeek
                ? `Money in each of the last ${weeks.length} weeks, from the week of ${formatDay(first.start, { year: "never" })} to the week of ${formatDay(lastWeek.start, { year: "never" })}.${bestNote}`
                : "Money in each week.",
        legend,
    };
}

/** A young business's weeks, each with its start under it (`IBThinD`). */
export function thinBars(read: MoneyRead): MoneyBar[] {
    const weeks = weeksSoFar(read);
    const top = scaleOf(weeks.map((w) => w.takingsMinor));
    return weeks.map((w) => ({
        key: w.start,
        heightPercent: height(w.takingsMinor, top),
        tone: "now",
        best: false,
        label: `Week of ${formatDay(w.start, { year: "never" })}, ${w.takingsMinor > 0 ? rupees(w.takingsMinor, read.currency) : "nothing"}`,
        short: gridMoney(w.takingsMinor, read.currency),
        tick: formatDay(w.start, { year: "never" }),
    }));
}

/** A young business's link: every order since it started. */
export function thinOrdersHref(read: MoneyRead): string {
    return ordersHref(read.startedOn, read.window.to);
}

/** One row of the What sells card's top three. */
export interface SellsRow {
    key: string;
    name: string;
    /** "412 sold", "38 bookings". */
    qty: string;
    /** "₹74,160"; null without `payment:read`, or for a service. */
    amount: string | null;
}

/**
 * "What sells, who books?" (`IBOverviewD`): "Sourdough loaf sells most.
 * Saturday sourdough class is almost always full." In the first weeks the
 * leader is named with how many sold, and bookings wait until there are
 * enough to say (`IBThinD`).
 */
export function sellsAnswer(read: SellsRead): string {
    const top =
        read.bestSellers.rows.length > 0 ? read.bestSellers.rows[0] : null;
    const { booked } = read;
    const parts: string[] = [];
    if (top) {
        parts.push(
            read.thin
                ? `${top.name} leads with ${formatNumber(top.sold)} sold.`
                : `${top.name} sells most.`,
        );
    }
    if (booked.bookings > 0) {
        const classes = booked.rows.some((r) => r.kind === "CLASS");
        if (!booked.enough) {
            parts.push(
                classes
                    ? "Too few bookings yet to say which class is busiest."
                    : "Too few bookings yet to say which service is booked most.",
            );
        } else {
            const full = booked.rows.find(
                (r) =>
                    r.kind === "CLASS" &&
                    r.fullPercent !== null &&
                    r.fullPercent >= 90,
            );
            const most = booked.rows.length > 0 ? booked.rows[0] : null;
            if (full) parts.push(`${full.name} is almost always full.`);
            else if (most) parts.push(`${most.name} is booked most.`);
        }
    }
    if (parts.length === 0) {
        return `Nothing sold or booked in ${lastPeriod(read.period)}.`;
    }
    return parts.join(" ");
}

/**
 * The card's top three: best sellers, or for a business that only takes
 * bookings, what is booked most. None in the first weeks (`IBThinD`).
 */
export function sellsRows(read: SellsRead): SellsRow[] {
    if (read.thin) return [];
    if (read.bestSellers.rows.length > 0) {
        return read.bestSellers.rows.slice(0, 3).map((r) => ({
            key: r.productId,
            name: r.name,
            qty: `${formatNumber(r.sold)} sold`,
            amount:
                read.money && r.amountMinor !== null
                    ? rupees(r.amountMinor, read.currency)
                    : null,
        }));
    }
    if (!read.booked.enough) return [];
    return read.booked.rows.slice(0, 3).map((r) => ({
        key: r.serviceId,
        name: r.name,
        qty: count(r.bookings, "booking"),
        amount: null,
    }));
}

/**
 * "Where do customers come from?" until sources are tracked (U16): "1,689
 * visits from 1,109 visitors, 23 enquiries and 159 online orders." Before the
 * first sale it adds that no order has come yet (`IBNoSalesD`).
 */
export function fromAnswer(
    summary: AnalyticsSummary,
    period: InsightsPeriod,
    noSalesYet = false,
): string {
    if (summary.siteViews <= 0) {
        return `No visits to your website in ${lastPeriod(period)}.`;
    }
    const visits = `${count(summary.siteViews, "visit")} from ${count(summary.uniqueVisitors, "visitor")}`;
    if (noSalesYet) return `${visits}. No orders yet.`;
    const enquiries =
        summary.enquiries > 0
            ? count(summary.enquiries, "enquiry", "enquiries")
            : "no enquiries";
    const orders =
        summary.orders > 0
            ? count(summary.orders, "online order")
            : "no online orders";
    return `${visits}, ${enquiries} and ${orders}.`;
}

/** The line under the cards: what the money was counted from. */
export function sourceLine(read: MoneyRead): string {
    const { payments, orders, bills } = read.moneyIn;
    const counted =
        payments > 0
            ? `From ${count(payments, "payment")}: ${count(orders, "paid order")} and ${count(bills, "paid invoice")}, less refunds.`
            : `No payments in ${lastPeriod(read.period)}.`;
    return read.window.from < ORDERS_RECORDED_FROM
        ? `${counted} Orders on the website are counted from October 2026.`
        : counted;
}

/** "How these are counted", on every tab's foot. */
export const HOW_INSIGHTS_ARE_COUNTED: readonly string[] = [
    "Money in is money actually taken: paid orders, and paid invoices that aren't an order's own, less refunds and credit notes. Each rupee is counted once.",
    "A period ends today in your business's time zone, and is compared with as many days just before it.",
    "The weekly bars are seven days at a time, back from today, so a period's bars add up to its money in.",
    "What sells counts what was paid for, and bookings that weren't cancelled.",
    "Your website's visits, enquiries and online orders are updated every hour.",
    "Visitors are counted each day: a visitor who comes back on another day is counted again.",
    "Where visits come from counts each visit once, by the site or app it came from, and by the links made here. Nothing about the visitor is kept.",
    "A visit is counted as paid when it paid online there and then. A refund later isn't taken off where it came from.",
];

/** A part of the Overview that couldn't be read. */
export type OverviewPart = "money" | "sells" | "website";

const PART_NAME: Record<OverviewPart, string> = {
    money: "money",
    sells: "what sells",
    website: "your website's figures",
};

function list(items: readonly string[]): string {
    if (items.length <= 1) return items[0] ?? "";
    return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/**
 * The one notice for what couldn't be read (`IBFailedD`): what is missing,
 * then what is complete. `shown` is what was read and is on the page.
 */
export function partialWords(
    failed: readonly OverviewPart[],
    shown: readonly OverviewPart[],
): { things: string; so?: string } {
    const things = list(failed.map((p) => PART_NAME[p]));
    if (shown.length === 0) return { things };
    const ok = shown.map((p) => PART_NAME[p]);
    return {
        things,
        // "Your website's figures are", "Money is".
        so: `${capitalise(list(ok))} ${ok.length === 1 && shown[0] !== "website" ? "is" : "are"} complete.`,
    };
}
