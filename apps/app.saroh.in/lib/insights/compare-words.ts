import { formatDay } from "@/lib/format/datetime";
import { formatMoney, formatNumber } from "@/lib/format/money";
import { count } from "@/lib/format/plural";

/**
 * Comparisons in words, for Home and Insights (DEC-171, Home and Insights
 * plan U4, #1081): "Up 12% on the 7 days before", "4 more than the 7 days
 * before", "About the same as the 7 days before", "₹1,090 last week, your
 * lowest in 12 weeks", and the phone's one sentence, "Last 7 days: ₹48,250,
 * up 12% on the 7 days before."
 *
 * The API decides the figures and the change (`home-going.ts`,
 * `compareTakings`); this only says them. Pure, so it is tested without a
 * page (`compare-words.test.ts`). The rules, in `saroh-product.md` →
 * Comparisons:
 *
 * - A period is named with its days: "13 to 19 Oct", "28 Sep to 4 Oct".
 * - Zero is said in words: "Nothing came in", "No bookings", "None in the
 *   7 days before". Never "₹0, down 100%".
 * - A change needs something to compare with. With nothing before it says
 *   so; with too little before, it says that, never a percent.
 * - A small change (2% or less) is "About the same".
 * - A percent is only as big as is true: down never reaches 100% while
 *   anything came in, and three times as much is "About 3 times", not
 *   "Up 200%".
 * - Counts say the difference, not a percent: "4 more", "3 fewer".
 * - One thing is "1 booking", many "22 bookings".
 */

/** Insights' periods (`period=7d|4w|3m`); Home always compares 7 days. */
export type ComparePeriod = "7d" | "4w" | "3m";

/** A money change as the API decides it (`HomeWeekChange`). */
export type CompareChange =
    { kind: "UP" | "DOWN" | "LEVEL"; percent: number } | { kind: "THIN" };

/** A change this small or smaller reads "About the same". */
export const ABOUT_SAME_PERCENT = 2;

/** At this much up or more, a change reads "About N times". */
export const TIMES_FROM_PERCENT = 200;

const PERIODS: Record<ComparePeriod, { last: string; before: string }> = {
    "7d": { last: "the last 7 days", before: "the 7 days before" },
    "4w": { last: "the last 4 weeks", before: "the 4 weeks before" },
    "3m": { last: "the last 3 months", before: "the 3 months before" },
};

/** "the last 7 days". */
export function lastPeriod(period: ComparePeriod = "7d"): string {
    return PERIODS[period].last;
}

/** "the 7 days before". */
export function beforePeriod(period: ComparePeriod = "7d"): string {
    return PERIODS[period].before;
}

/** "Last 7 days", as a heading or the start of a sentence. */
export function periodHeading(period: ComparePeriod = "7d"): string {
    return capitalise(PERIODS[period].last.replace(/^the /, ""));
}

export function capitalise(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Two days, as a range: "14 to 20 Sep", "28 Sep to 4 Oct", and with the
 * years when it crosses one: "29 Dec 2025 to 4 Jan 2026".
 */
export function daysLabel(from: string, to: string): string {
    if (!DAY.test(from) || !DAY.test(to)) return "";
    if (from.slice(0, 4) !== to.slice(0, 4)) {
        return `${formatDay(from, { year: "always" })} to ${formatDay(to, { year: "always" })}`;
    }
    const end = formatDay(to, { year: "never" });
    if (from === to) return end;
    if (from.slice(0, 7) === to.slice(0, 7)) {
        return `${Number(from.slice(8, 10))} to ${end}`;
    }
    return `${formatDay(from, { year: "never" })} to ${end}`;
}

/** The two windows a comparison reads, as `HomeGoing` sends them. */
export interface CompareWindows {
    from: string;
    to: string;
    beforeFrom: string;
    beforeTo: string;
}

/** "13 to 19 Oct, against 6 to 12 Oct." Which days are set against which. */
export function comparesLine(w: CompareWindows): string {
    return `${daysLabel(w.from, w.to)}, against ${daysLabel(w.beforeFrom, w.beforeTo)}.`;
}

/** "No bookings", "1 booking", "22 bookings". Zero is said in words. */
export function countWords(n: number, one: string, many = `${one}s`): string {
    return n === 0 ? `no ${many}` : count(n, one, many);
}

/** The change in money, mid-sentence: "up 12% on the 7 days before". */
function moneyClause(
    nowMinor: number,
    beforeMinor: number,
    currency: string,
    change: CompareChange,
    period: ComparePeriod,
): string {
    const before = PERIODS[period].before;
    if (nowMinor <= 0) {
        return beforeMinor > 0
            ? `down from ${formatMoney(beforeMinor, currency)} in ${before}`
            : `nothing came in ${before} either`;
    }
    if (beforeMinor <= 0) return `nothing came in ${before}`;
    if (change.kind === "THIN")
        return `too little came in ${before} to compare`;
    if (change.kind === "LEVEL" || change.percent <= ABOUT_SAME_PERCENT) {
        return `about the same as ${before}`;
    }
    if (change.kind === "UP") {
        return change.percent >= TIMES_FROM_PERCENT
            ? `about ${Math.round((100 + change.percent) / 100)} times ${before}`
            : `up ${change.percent}% on ${before}`;
    }
    // Something came in, so it is never all gone.
    return `down ${Math.min(change.percent, 99)}% on ${before}`;
}

export interface MoneyCompare {
    nowMinor: number;
    beforeMinor: number;
    currency: string;
    change: CompareChange;
    period?: ComparePeriod;
}

/**
 * The line under a money figure: "Up 12% on the 7 days before", "Down from
 * ₹4,000 in the 7 days before", "Nothing came in the 7 days before".
 */
export function moneyChangeLine(m: MoneyCompare): string {
    return capitalise(
        moneyClause(
            m.nowMinor,
            m.beforeMinor,
            m.currency,
            m.change,
            m.period ?? "7d",
        ),
    );
}

/** Whether the money line reads as bad news (the danger colour). */
export function moneyFell(m: MoneyCompare): boolean {
    if (m.beforeMinor <= 0) return false;
    if (m.nowMinor <= 0) return true;
    return m.change.kind === "DOWN" && m.change.percent > ABOUT_SAME_PERCENT;
}

/**
 * The line under a count: "4 more than the 7 days before", "3 fewer than
 * the 7 days before", "Same as the 7 days before", "None in the 7 days
 * before".
 */
export function countChangeLine(
    now: number,
    before: number,
    period: ComparePeriod = "7d",
): string {
    const was = PERIODS[period].before;
    if (before === 0) {
        return now === 0 ? `None in ${was} either` : `None in ${was}`;
    }
    const d = now - before;
    if (d === 0) return `Same as ${was}`;
    return `${formatNumber(Math.abs(d))} ${d > 0 ? "more" : "fewer"} than ${was}`;
}

/**
 * A week marked as the highest or lowest of those shown: "₹1,090 last
 * week, your lowest in 12 weeks", "Nothing came in last week, your lowest
 * in 12 weeks". Said only when there are at least two weeks to set it
 * against; null otherwise.
 */
export function markNote(m: {
    amountMinor: number;
    currency: string;
    /** "last week", "the week of 14 Sep". */
    when: string;
    weeks: number;
    mark: "HIGHEST" | "LOWEST";
}): string | null {
    if (m.weeks < 2) return null;
    const what =
        m.amountMinor > 0
            ? `${formatMoney(m.amountMinor, m.currency)} ${m.when}`
            : `Nothing came in ${m.when}`;
    return `${what}, your ${m.mark === "HIGHEST" ? "highest" : "lowest"} in ${m.weeks} weeks`;
}

/** A count over two windows, as `HomeGoing` sends bookings and orders. */
export interface CountPair {
    count: number;
    before: number;
}

/** Money over two windows in one currency, as `HomeGoing.sales` sends it. */
export interface MoneyPair {
    currency: string;
    amountMinor: number;
    beforeMinor: number;
    change: CompareChange;
}

/**
 * What the phone's sentence reads: `HomeGoing`'s fields. Each figure is
 * present only for someone who may read it; `sales` only with
 * `payment:read` (DEC-098).
 */
export interface GoingFigures {
    sales?: readonly MoneyPair[];
    bookings?: CountPair;
    orders?: CountPair;
}

type Way = "UP" | "DOWN" | "SAME";

function way(p: CountPair): Way {
    if (p.count === p.before) return "SAME";
    return p.count > p.before ? "UP" : "DOWN";
}

/** One count's own change, mid-sentence: "up from 18", "up from none". */
function countClause(p: CountPair): string {
    const w = way(p);
    if (w === "SAME") return "the same as before";
    if (p.before === 0) return "up from none";
    return `${w === "UP" ? "up" : "down"} from ${formatNumber(p.before)}`;
}

/** Bookings and orders said together, or null when neither may be read. */
function countsSentence(f: GoingFigures, period: ComparePeriod): string | null {
    const named: [CountPair, string, string][] = [];
    if (f.bookings) named.push([f.bookings, "booking", "bookings"]);
    if (f.orders) named.push([f.orders, "order", "orders"]);
    if (named.length === 0) return null;
    const head = periodHeading(period);
    const last = PERIODS[period].last;
    const before = PERIODS[period].before;

    if (named.length === 1) {
        const [[p, one, many]] = named;
        if (p.count === 0) {
            return p.before === 0
                ? `No ${many} in ${last}.`
                : `No ${many} in ${last}. ${capitalise(before)} had ${count(p.before, one, many)}.`;
        }
        const said = count(p.count, one, many);
        if (p.before === 0) return `${head}: ${said}. None in ${before}.`;
        return `${head}: ${said}, ${countChangeLine(p.count, p.before, period).toLowerCase()}.`;
    }

    const [[a, aOne, aMany], [b, bOne, bMany]] = named;
    if (a.count === 0 && b.count === 0) {
        const none = `No ${aMany} or ${bMany} in ${last}.`;
        if (a.before === 0 && b.before === 0) return none;
        const had = [
            a.before > 0 ? count(a.before, aOne, aMany) : null,
            b.before > 0 ? count(b.before, bOne, bMany) : null,
        ].filter(Boolean);
        return `${none} ${capitalise(before)} had ${had.join(" and ")}.`;
    }
    const both = `${countWords(a.count, aOne, aMany)} and ${countWords(b.count, bOne, bMany)}`;
    if (a.before === 0 && b.before === 0) {
        return `${head}: ${both}. None in ${before}.`;
    }
    const wa = way(a);
    if (wa === way(b) && a.before > 0 && b.before > 0) {
        const how =
            wa === "SAME"
                ? `both the same as ${before}`
                : `both ${wa === "UP" ? "up" : "down"} on ${before}`;
        return `${head}: ${both}, ${how}.`;
    }
    return `${head}: ${countWords(a.count, aOne, aMany)}, ${countClause(a)}, and ${countWords(b.count, bOne, bMany)}, ${countClause(b)}.`;
}

/**
 * How it's going in one sentence, for the phone's Home (R9):
 *
 * - with money: "Last 7 days: ₹48,250, up 12% on the 7 days before."
 * - without (a role without `payment:read`): "Last 7 days: 22 bookings and
 *   41 orders, both up on the 7 days before."
 * - nothing came in, but there were bookings: the counts' sentence.
 *
 * Null when the person may read none of the figures: the phone then
 * leaves the line out.
 */
export function goingSentence(
    f: GoingFigures,
    period: ComparePeriod = "7d",
): string | null {
    const head = periodHeading(period);
    const last = PERIODS[period].last;
    const before = PERIODS[period].before;
    const counts = countsSentence(f, period);
    const sales = f.sales ?? [];
    if (sales.length === 0) return counts;

    const moved = sales.filter((s) => s.amountMinor > 0);
    if (moved.length > 1) {
        // Several currencies can't be added together or set against one
        // change, so each amount is said once.
        const amounts = moved.map((s) =>
            formatMoney(s.amountMinor, s.currency),
        );
        return `${head}: ${amounts.slice(0, -1).join(", ")} and ${amounts.at(-1)}.`;
    }
    if (moved.length === 1) {
        const [s] = moved;
        const amount = formatMoney(s.amountMinor, s.currency);
        const clause = moneyClause(
            s.amountMinor,
            s.beforeMinor,
            s.currency,
            s.change,
            period,
        );
        // With nothing (or too little) to set it against, that is its own
        // sentence, not a change.
        return s.beforeMinor <= 0 || s.change.kind === "THIN"
            ? `${head}: ${amount}. ${capitalise(clause)}.`
            : `${head}: ${amount}, ${clause}.`;
    }

    // Nothing came in. Bookings or orders, if any, are the news.
    const anyCounted = [f.bookings, f.orders].some((p) => p && p.count > 0);
    if (counts && anyCounted) return counts;
    const was = sales.find((s) => s.beforeMinor > 0);
    return was
        ? `Nothing came in ${last}, against ${formatMoney(was.beforeMinor, was.currency)} in ${before}.`
        : `Nothing came in ${last}.`;
}

/** Places whose share rounds to under 1% are left out: no "0% online". */
export function shownShares<T extends { percent: number }>(
    places: readonly T[],
): T[] {
    return places.filter((p) => p.percent >= 1);
}
