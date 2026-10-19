import { formatDay } from "@/lib/format/datetime";
import { formatMoney, formatNumber } from "@/lib/format/money";
import { count } from "@/lib/format/plural";

import type { CompareChange } from "./compare-words";
import {
    ABOUT_SAME_PERCENT,
    beforePeriod,
    countChangeLine,
    daysLabel,
    lastPeriod,
    moneyChangeLine,
    moneyFell,
} from "./compare-words";
import { ordersHref, PAID_INVOICES_HREF, placeStoreId } from "./links";
import type { Answer, MoneyBar } from "./overview-words";
import { barName, moneyAnswer, rupees, weeksChart } from "./overview-words";
import type {
    MoneyPlaceRead,
    MoneyRead,
    MoneyWeekRead,
    OwedAge,
    OwedBucketRead,
    OwedRead,
} from "./reads";

/**
 * The words of Insights' Money tab (DEC-171, plan U12, #1093; boards
 * `IBMoneyD`/`P`, `IBWeekD`/`P`, `IBOwedD`/`P`), each written from the same
 * figures the tab draws, so a sentence and its picture never disagree:
 *
 * - "Am I making more money?", with the best week said after it;
 * - four figures, each opening the rows it counts: Money in, Paid orders
 *   and bills, An order is usually, Best week;
 * - "How were the last 7 days?", the last bar against the one before;
 * - "Where does the money come from?", in rupees, each place opening its
 *   own orders (no place at 0%);
 * - "Who owes me?", by how late, each age opening its bills.
 *
 * Pure: tested in `money-words.test.ts`. The comparisons are
 * `compare-words.ts`'s (#1081).
 */

/** One of the four figures under the chart. */
export interface MoneyTile {
    key: "in" | "payments" | "usual" | "best";
    label: string;
    value: string;
    sub: string;
    /** `up` reads green with a chevron; `bad`, red. */
    tone: "up" | "bad" | null;
    href: string;
}

/** A change worth a colour: more than "about the same". */
function upOf(change: CompareChange): boolean {
    return change.kind === "UP" && change.percent > ABOUT_SAME_PERCENT;
}

/** The period's paid orders: every figure that counts orders opens them. */
function periodOrders(read: MoneyRead): string {
    return ordersHref(read.window.from, read.window.to);
}

/** "₹1,84,600 … Your best week was the week of 12 Oct, at ₹50,100." */
export function moneyTabAnswer(read: MoneyRead): Answer {
    const answer = moneyAnswer(read, { percent: false });
    const best = read.bestWeek;
    if (read.thin || !best) return answer;
    return {
        lead: answer.lead,
        text: `${answer.text} Your best week was the week of ${formatDay(best.start, { year: "never" })}, at ${rupees(best.takingsMinor, read.currency)}.`,
    };
}

/** The four figures (`IBMoneyD`), each opening the rows behind it. */
export function moneyTiles(read: MoneyRead): MoneyTile[] {
    const cur = read.currency;
    const m = read.moneyIn;
    const href = periodOrders(read);
    const nothingBefore = "Nothing earlier to compare with yet";
    const compare = {
        nowMinor: m.amountMinor,
        beforeMinor: m.beforeMinor,
        currency: cur ?? "INR",
        change: m.change,
        period: read.period,
    };
    const tiles: MoneyTile[] = [
        {
            key: "in",
            label: "Money in",
            value: m.amountMinor > 0 ? rupees(m.amountMinor, cur) : "Nothing",
            sub: read.thin ? nothingBefore : moneyChangeLine(compare),
            tone: read.thin
                ? null
                : moneyFell(compare)
                  ? "bad"
                  : m.amountMinor > 0 && upOf(m.change)
                    ? "up"
                    : null,
            href,
        },
        {
            key: "payments",
            label: "Paid orders and bills",
            value: formatNumber(m.payments),
            sub: read.thin
                ? nothingBefore
                : countChangeLine(m.payments, m.paymentsBefore, read.period),
            tone: !read.thin && m.payments > m.paymentsBefore ? "up" : null,
            href,
        },
        usualTile(read, href),
    ];
    const best = read.bestWeek;
    tiles.push({
        key: "best",
        label: "Best week",
        value: best ? formatDay(best.start, { year: "never" }) : "None",
        sub: best
            ? `${rupees(best.takingsMinor, cur)}, the most in ${count(read.weeks.length, "week")}`
            : `No week took money in the last ${count(read.weeks.length, "week")}`,
        tone: null,
        href: best ? ordersHref(best.start, best.end) : href,
    });
    return tiles;
}

/** "An order is usually": the middle paid order, against the one before. */
function usualTile(read: MoneyRead, href: string): MoneyTile {
    const usual = read.usualOrder;
    const cur = read.currency;
    const base = { key: "usual" as const, label: "An order is usually", href };
    if (usual?.amountMinor == null) {
        return {
            ...base,
            value: "None",
            sub: `No paid orders in ${lastPeriod(read.period)}`,
            tone: null,
        };
    }
    const value = rupees(usual.amountMinor, cur);
    if (read.thin || usual.beforeMinor === null || usual.beforeMinor <= 0) {
        return {
            ...base,
            value,
            sub: read.thin
                ? "Nothing earlier to compare with yet"
                : `No paid orders in ${beforePeriod(read.period)}`,
            tone: null,
        };
    }
    const percent = Math.round(
        ((usual.amountMinor - usual.beforeMinor) / usual.beforeMinor) * 100,
    );
    if (Math.abs(percent) <= ABOUT_SAME_PERCENT) {
        return { ...base, value, sub: "About the same as before", tone: null };
    }
    const was = rupees(usual.beforeMinor, cur);
    return {
        ...base,
        value,
        sub: percent > 0 ? `Up from ${was}` : `Down from ${was}`,
        tone: percent > 0 ? "up" : null,
    };
}

/** One bar of the Money chart, with what reading it says and opens. */
export interface MoneyWeekBar extends MoneyBar {
    week: MoneyWeekRead;
    /** "Week of 12 Oct · ₹50,100 · 78 payments". */
    readout: string;
}

/** A bar, as its readout says it. */
export function weekReadout(w: MoneyWeekRead, currency: string | null): string {
    const took =
        w.takingsMinor > 0
            ? rupees(w.takingsMinor, currency)
            : "nothing came in";
    return w.payments > 0
        ? `${barName(w)} · ${took} · ${count(w.payments, "payment")}`
        : `${barName(w)} · ${took}`;
}

/** The weekly bars, each with its readout, and the picture's words. */
export function moneyWeekBars(read: MoneyRead): {
    bars: MoneyWeekBar[];
    chart: ReturnType<typeof weeksChart>;
    /** The bar the readout starts on: the best week, else the newest. */
    initial: string | null;
} {
    const chart = weeksChart(read);
    const bars = chart.bars.map((bar, i) => ({
        ...bar,
        week: read.weeks[i],
        readout: weekReadout(read.weeks[i], read.currency),
    }));
    return {
        bars,
        chart,
        initial: read.bestWeek?.start ?? bars.at(-1)?.key ?? null,
    };
}

/** What a week's sheet says above its orders (`IBWeekD`, `IBWeekP`). */
export function weekSheetWords(
    w: MoneyWeekRead,
    read: Pick<MoneyRead, "currency" | "bestWeek" | "weeks">,
): { title: string; big: string; note: string } {
    const best = read.bestWeek?.start === w.start;
    const days =
        w.days !== undefined && w.days !== 7
            ? `${count(w.days, "day")}, ${daysLabel(w.start, w.end)}.`
            : `${daysLabel(w.start, w.end)}, seven days.`;
    return {
        title: barName(w),
        big:
            w.takingsMinor > 0
                ? `${rupees(w.takingsMinor, read.currency)} from ${count(w.payments, "payment")}`
                : "Nothing came in",
        note: best ? `${days} Your best week in ${read.weeks.length}.` : days,
    };
}

/** "and 3 paid invoices", beside a week's orders: the rest of its payments. */
export function weekBills(w: MoneyWeekRead): number {
    return Math.max(0, w.payments - w.orders);
}

const WEEKDAY = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
] as const;

function weekdayName(day: string): string {
    return WEEKDAY[new Date(`${day}T00:00:00.000Z`).getUTCDay()] ?? "";
}

/** Fewer payments than this the 7 days before, and there is no comparing. */
const MIN_PAYMENTS_TO_COMPARE = 3;

/**
 * "How were the last 7 days?" (`IBMoneyD`): "₹48,250 from 13 to 19 Oct, up
 * 12% on the 7 days before. Saturday brought in the most, ₹11,900." The
 * newest bar against the one before it, both seven days.
 */
export function lastSevenDays(
    read: MoneyRead,
): { text: string; href: string } | null {
    const now = read.weeks.at(-1);
    if (!now) return null;
    const before = read.weeks.at(-2);
    const cur = read.currency;
    const days = daysLabel(now.start, now.end);
    const href = ordersHref(now.start, now.end);
    if (now.takingsMinor <= 0) {
        return {
            text:
                before && before.takingsMinor > 0
                    ? `Nothing came in from ${days}, against ${rupees(before.takingsMinor, cur)} the 7 days before.`
                    : `Nothing came in from ${days}.`,
            href,
        };
    }
    const beforeMinor = before?.takingsMinor ?? 0;
    const change: CompareChange =
        !before || before.payments < MIN_PAYMENTS_TO_COMPARE || beforeMinor <= 0
            ? { kind: "THIN" }
            : (() => {
                  const percent = Math.round(
                      ((now.takingsMinor - beforeMinor) / beforeMinor) * 100,
                  );
                  if (percent === 0) return { kind: "LEVEL", percent: 0 };
                  return percent > 0
                      ? { kind: "UP", percent }
                      : { kind: "DOWN", percent: -percent };
              })();
    const clause = moneyChangeLine({
        nowMinor: now.takingsMinor,
        beforeMinor,
        currency: cur ?? "INR",
        change,
        period: "7d",
    });
    const lead = `${rupees(now.takingsMinor, cur)} from ${days}`;
    const said =
        beforeMinor <= 0 || change.kind === "THIN"
            ? `${lead}. ${clause}.`
            : `${lead}, ${clause.charAt(0).toLowerCase()}${clause.slice(1)}.`;
    // The day that brought in most, from the period's days when they
    // cover the last seven.
    const inWeek = (read.days ?? []).filter(
        (d) => d.date >= now.start && d.date <= now.end,
    );
    const top = inWeek.reduce<(typeof inWeek)[number] | null>(
        (best, d) =>
            d.amountMinor > 0 && (!best || d.amountMinor > best.amountMinor)
                ? d
                : best,
        null,
    );
    const most =
        top && inWeek.filter((d) => d.amountMinor > 0).length > 1
            ? ` ${weekdayName(top.date)} brought in the most, ${rupees(top.amountMinor, cur)}.`
            : "";
    return { text: `${said}${most}`, href };
}

/** One place in "Where does the money come from?". */
export interface PlaceShareView {
    key: string;
    /** "Hill Road", "Online", "Invoices". */
    name: string;
    amount: string;
    /** Whole percent of the period's money; the shown ones add up to 100. */
    percent: number;
    /** The rows it counted: that location's or the period's orders, or paid invoices. */
    href: string;
}

function placeName(p: Pick<MoneyPlaceRead, "kind" | "name">): string {
    if (p.kind === "ONLINE") return "Online";
    if (p.kind === "INVOICES") return "Invoices";
    return p.name ?? "A location";
}

/** Where, mid-sentence: "at Hill Road", "online", "by invoice". */
function placeWhere(p: Pick<MoneyPlaceRead, "kind" | "name">): string {
    if (p.kind === "ONLINE") return "online";
    if (p.kind === "INVOICES") return "by invoice";
    return p.name ? `at ${p.name}` : "at a location";
}

/** What grew, as a sentence's subject: "Online orders", "Hill Road". */
function placeSubject(p: Pick<MoneyPlaceRead, "kind" | "name">): string {
    if (p.kind === "ONLINE") return "Online orders";
    if (p.kind === "INVOICES") return "Invoices";
    return p.name ?? "A location";
}

/** Whole percents of `parts` that add up to 100 (largest remainder). */
export function shares(parts: readonly number[]): number[] {
    const total = parts.reduce((s, p) => s + p, 0);
    if (total <= 0) return parts.map(() => 0);
    const exact = parts.map((p) => (p * 100) / total);
    const out = exact.map(Math.floor);
    let left = 100 - out.reduce((s, p) => s + p, 0);
    const order = exact
        .map((e, i) => ({ i, frac: e - Math.floor(e) }))
        .sort((a, b) => b.frac - a.frac || a.i - b.i);
    for (const { i } of order) {
        if (left <= 0) break;
        out[i] += 1;
        left -= 1;
    }
    return out;
}

/**
 * "Where does the money come from?" (`IBMoneyD`): "More than half comes in
 * at Hill Road. Online orders grew the most, up 18%." Places in rupees,
 * none at 0%, each opening its own rows. Null when nothing came in.
 */
export function placesView(
    read: MoneyRead,
): { text: string; places: PlaceShareView[]; label: string } | null {
    const all = (read.places ?? []).filter((p) => p.amountMinor > 0);
    if (all.length === 0) return null;
    const percents = shares(all.map((p) => p.amountMinor));
    const places = all
        .map((p, i) => ({
            key: p.key,
            name: placeName(p),
            amount: rupees(p.amountMinor, read.currency),
            percent: percents[i],
            href:
                p.kind === "INVOICES"
                    ? PAID_INVOICES_HREF
                    : ordersHref(
                          read.window.from,
                          read.window.to,
                          placeStoreId(p.key),
                      ),
        }))
        // Under 1%, it's left out: no "0% online".
        .filter((p) => p.percent >= 1);
    const [top] = all;
    const share = percents[0];
    const lead =
        all.length === 1
            ? `All of it came in ${placeWhere(top)}.`
            : share > 50
              ? `More than half comes in ${placeWhere(top)}.`
              : share === 50
                ? `Half comes in ${placeWhere(top)}.`
                : `Most comes in ${placeWhere(top)}.`;
    const grew =
        all.length > 1 && !read.thin
            ? all
                  .filter(
                      (p) =>
                          p.change.kind === "UP" &&
                          p.change.percent > ABOUT_SAME_PERCENT,
                  )
                  .sort(
                      (a, b) =>
                          (b.change.kind === "UP" ? b.change.percent : 0) -
                          (a.change.kind === "UP" ? a.change.percent : 0),
                  )[0]
            : undefined;
    const growth =
        grew?.change.kind === "UP"
            ? ` ${placeSubject(grew)} grew the most, up ${grew.change.percent}%.`
            : "";
    return {
        text: `${lead}${growth}`,
        places,
        label: `${places.map((p) => `${p.name} ${p.amount}, ${p.percent} per cent`).join("; ")}.`,
    };
}

/** The ages, in the order drawn. */
export const OWED_AGES: readonly OwedAge[] = [
    "notDue",
    "late1to30",
    "lateOver30",
];

export const OWED_AGE_LABEL: Record<OwedAge, string> = {
    notDue: "Not due yet",
    late1to30: "1 to 30 days late",
    lateOver30: "More than 30 days late",
};

/** A total in the business's currency, or the first there is. */
function owedMinor(
    totals: OwedBucketRead["totals"],
    currency: string | null,
): { minor: number; currency: string } | null {
    if (!totals || totals.length === 0) return null;
    const mine = totals.find((t) => t.currency === currency) ?? totals[0];
    return { minor: mine.amountMinor, currency: mine.currency };
}

/** One age of "Who owes me?". */
export interface OwedRowView {
    age: OwedAge;
    label: string;
    /** "₹14,040"; null for a role that may not see money. */
    amount: string | null;
    /** "8 bills". */
    bills: string;
    count: number;
    /** Its share of what is owed, 0 to 100, for the bar. */
    percent: number;
    href: string;
}

/**
 * "Who owes me?" (`IBMoneyD`): "₹32,970 on 16 bills. ₹12,530 of it is more
 * than a month late." Each age with its amount and a bar of its share, and
 * opening its bills. Null for a business that has never billed (no "₹0
 * owed" for a shop) or a role that doesn't read invoices.
 */
export function owedView(
    read: Pick<MoneyRead, "owed" | "currency">,
): { text: string; rows: OwedRowView[]; href: string } | null {
    const owed: OwedRead | null | undefined = read.owed;
    if (!owed) return null;
    const total = owedMinor(owed.totals, read.currency);
    const rows = OWED_AGES.map((age) => {
        const bucket = owed.byAge[age];
        const minor = owedMinor(bucket.totals, read.currency);
        const of = total && total.minor > 0 ? total.minor : 0;
        return {
            age,
            label: OWED_AGE_LABEL[age],
            amount: minor ? formatMoney(minor.minor, minor.currency) : null,
            bills: count(bucket.count, "bill"),
            count: bucket.count,
            percent:
                of > 0 && minor
                    ? Math.round((minor.minor / of) * 100)
                    : owed.bills > 0
                      ? Math.round((bucket.count / owed.bills) * 100)
                      : 0,
            href: bucket.href,
        };
    });
    if (owed.bills === 0) {
        return {
            text: "Nobody owes you anything right now.",
            rows,
            href: owed.href,
        };
    }
    const bills = count(owed.bills, "bill");
    const head = total
        ? `${formatMoney(total.minor, total.currency)} on ${bills}.`
        : `${bills} not paid yet.`;
    const old = owed.byAge.lateOver30;
    const oldMinor = owedMinor(old.totals, read.currency);
    const late = owed.byAge.late1to30;
    const tail =
        old.count > 0
            ? oldMinor
                ? ` ${formatMoney(oldMinor.minor, oldMinor.currency)} of it is more than a month late.`
                : ` ${count(old.count, "bill")} ${old.count === 1 ? "is" : "are"} more than a month late.`
            : late.count > 0
              ? ` ${count(late.count, "bill")} ${late.count === 1 ? "is" : "are"} late, none by more than a month.`
              : " None of it is late.";
    return { text: `${head}${tail}`, rows, href: owed.href };
}

/** Money taken in another currency, which the figures leave out. */
export function otherCurrencyNote(
    read: Pick<MoneyRead, "otherCurrencies">,
): string | null {
    const others = read.otherCurrencies;
    if (others.length === 0) return null;
    const named =
        others.length === 1
            ? others[0]
            : `${others.slice(0, -1).join(", ")} and ${others.at(-1)}`;
    return `Money taken in ${named} isn't counted here.`;
}
