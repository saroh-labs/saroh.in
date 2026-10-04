import { NUMBER_LOCALE } from "@/lib/format/locale";
import { formatMoney } from "@/lib/format/money";

import type {
    PlaceShare,
    SoFarFigures,
    TakingsChange,
    TakingsFigures,
    TakingsSignal,
    WeekBar,
    WeekSpan,
} from "./takings-figures";

/**
 * Insights' answers in words (DEC-075, design 1a "Answers, in words") and
 * the notes under the figures (1b), written from `takings-figures.ts` and
 * nothing else — never typed, so a sentence can't say what the figures
 * don't. Pure; tested in `takings-words.test.ts`.
 *
 * - Every figure carries its window: "in the last four weeks (31 Aug –
 *   27 Sep)", "the week of 14 Sep".
 * - A change needs a baseline: without one the sentence says why ("your
 *   first weeks on record", "too little came in … to compare") and the
 *   figure reads "N/A", never 0%. A change that rounds to nothing is
 *   "level".
 * - A business that has never taken money, or only this week, gets one
 *   honest sentence instead of four about ₹0.
 * - Money from only one place has no "where is it coming from".
 * - The week in progress is said on its own, against the same days of
 *   last week, never as a whole week.
 * - "Anything to watch?" names a real signal or says nothing unusual
 *   happened; it never restates the best week.
 * - Every figure that has rows behind it says where to read them: the
 *   Orders list, filtered to the days (orders placed in them, paid).
 * - Merchants read "location", never "storefront" (DEC-069).
 */

/** Where an answer or a figure's rows are read, and what the link says. */
export interface RowsLink {
    href: string;
    label: string;
}

export interface TakingsAnswer {
    key: "now" | "month" | "best" | "where" | "watch";
    question: string;
    answer: string;
    link?: RowsLink;
}

export interface TakingsTile {
    key: "takings" | "orders" | "best" | "average";
    label: string;
    value: string;
    note: string;
    href: string;
}

/**
 * The paid orders placed between two days, inclusive, on the Orders list.
 * The list filters by the day an order was placed, and takings count the
 * day it was paid; the two are the same day for almost every order, and
 * the link says "placed" so it never claims more.
 */
export function ordersHref(from: string, to: string): string {
    const q = new URLSearchParams({
        date: "custom",
        from,
        to,
        payment: "paid",
    });
    return `/commerce/orders?${q.toString()}`;
}

// Spelt out rather than `Intl`'s short month, which some ICU builds write
// "Sept" (as Home's week does, `lib/home/week.ts`).
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

/** "14 Sep", from `2026-09-14`. */
export function dayMonth(date: string): string {
    const [, month, day] = date.split("-").map(Number);
    const name = month ? MONTHS[month - 1] : undefined;
    return name && day ? `${day} ${name}` : date;
}

/** "31 Aug – 27 Sep". */
export function spanLabel(s: WeekSpan): string {
    return `${dayMonth(s.from)} – ${dayMonth(s.to)}`;
}

const WEEKDAYS = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];

/** "Monday 28 Sep", from `2026-09-28`. */
export function weekdayDayMonth(date: string): string {
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    const name = WEEKDAYS[day];
    return name ? `${name} ${dayMonth(date)}` : dayMonth(date);
}

/** "1 payment", "41 payments". */
function count(n: number, one: string, many: string): string {
    return `${n.toLocaleString(NUMBER_LOCALE)} ${n === 1 ? one : many}`;
}

/** "the week of 14 Sep". */
export function weekOf(start: string): string {
    return `the week of ${dayMonth(start)}`;
}

/** Whole money, as a merchant reads a week's takings: "₹48,250". */
export function money(minor: number, currency: string | null): string {
    return formatMoney(Math.round(minor / 100) * 100, currency) ?? "";
}

/** How a share of the money is placed in a sentence. */
function where(place: PlaceShare): string {
    if (place.kind === "ONLINE") return "online";
    if (place.kind === "INVOICES") return "by invoice";
    return place.name ? `at ${place.name}` : "at a location";
}

/** "a, b and c". */
function list(items: readonly string[]): string {
    if (items.length <= 1) return items[0] ?? "";
    return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The change, as the end of the first answer's sentence. */
function changeClause(change: TakingsChange): string {
    switch (change.kind) {
        case "UP":
            return `, up ${change.percent}% on the four weeks before`;
        case "DOWN":
            return `, down ${change.percent}% on the four weeks before`;
        case "LEVEL":
            return ", level with the four weeks before";
        case "FIRST_WEEKS":
            return " — your first weeks on record, so there's nothing earlier to compare";
        case "THIN":
            return "; too little came in the four weeks before to compare";
    }
}

/** The change, as the note under "Takings, 4 weeks". */
export function changeNote(change: TakingsChange): string {
    switch (change.kind) {
        case "UP":
            return `Up ${change.percent}% on the four before.`;
        case "DOWN":
            return `Down ${change.percent}% on the four before.`;
        case "LEVEL":
            return "Level with the four before.";
        case "FIRST_WEEKS":
            return "N/A: your first weeks on record.";
        case "THIN":
            return "N/A: too little in the four before to compare.";
    }
}

function monthAnswer(f: TakingsFigures): string {
    const window = `the last four weeks (${spanLabel(f.last4)})`;
    if (f.last4.takingsMinor <= 0) {
        return f.prior4.takingsMinor > 0
            ? `Nothing came in during ${window}, against ${money(f.prior4.takingsMinor, f.currency)} in the four weeks before.`
            : `Nothing came in during ${window}.`;
    }
    return `You took ${money(f.last4.takingsMinor, f.currency)} in ${window}${changeClause(f.change)}.`;
}

function bestAnswer(f: TakingsFigures): string | null {
    if (!f.best || f.weeksOnRecord < 2) return null;
    const usual =
        f.weeksOnRecord === f.bars.length
            ? "your usual week (the twelve-week average)"
            : `your usual week (the average of your ${f.weeksOnRecord} weeks on record)`;
    const amount = money(f.best.takingsMinor, f.currency);
    // Said once: when last week is the best, the answer says it is last week.
    const lead = f.lastIsBest
        ? `Last week (${dayMonth(f.best.start)}) was your best of the twelve, at ${amount}`
        : `${capitalise(weekOf(f.best.start))}, at ${amount}`;
    const above = f.bestAboveUsual ?? 0;
    return above > 0
        ? `${lead} — about ${above}% above ${usual}.`
        : `${lead} — level with ${usual}.`;
}

/** "since Monday 28 Sep", or "today (Monday 28 Sep)" on the Monday itself. */
function soFarWindow(so: SoFarFigures): string {
    return so.through === so.start
        ? `today (${weekdayDayMonth(so.start)})`
        : `since ${weekdayDayMonth(so.start)}`;
}

function soFarAnswer(f: TakingsFigures): string {
    const so = f.soFar;
    const window = soFarWindow(so);
    if (so.takingsMinor <= 0) {
        const before =
            so.sameDaysLastWeekMinor > 0
                ? ` The same days last week took ${money(so.sameDaysLastWeekMinor, f.currency)}.`
                : "";
        return `Nothing has come in ${window}.${before}`;
    }
    const lead = `You've taken ${money(so.takingsMinor, f.currency)} ${window}, from ${count(so.payments, "payment", "payments")}`;
    switch (so.change.kind) {
        case "AHEAD":
            return `${lead} — ${so.change.percent}% ahead of the same days last week.`;
        case "BEHIND":
            return `${lead} — ${so.change.percent}% behind the same days last week.`;
        case "LEVEL":
            return `${lead} — level with the same days last week.`;
        case "THIN":
            return `${lead}.`;
    }
}

/** "Hill Road", "Online orders", "Invoices", as the subject of a sentence. */
function placeSubject(kind: PlaceShare["kind"], name: string | null): string {
    if (kind === "ONLINE") return "Online orders";
    if (kind === "INVOICES") return "Invoices";
    return name ?? "A location";
}

/** "the week of 14 Sep", or "last week" when it is. */
function weekOrLast(f: TakingsFigures, start: string): string {
    return start === f.lastWeek.start ? "last week" : weekOf(start);
}

function signalAnswer(
    f: TakingsFigures,
    signal: TakingsSignal,
): { answer: string; link?: RowsLink } {
    switch (signal.kind) {
        case "SLIDE":
            return {
                answer: `Takings have fallen three weeks running, from ${money(signal.from.takingsMinor, f.currency)} in ${weekOf(signal.from.start)} to ${money(signal.to.takingsMinor, f.currency)} last week — down ${signal.percent}%.`,
                link: {
                    href: ordersHref(signal.to.start, signal.to.end),
                    label: "See last week's orders",
                },
            };
        case "DIP": {
            const which = weekOrLast(f, signal.week.start);
            return {
                answer: `${capitalise(which)} took ${money(signal.week.takingsMinor, f.currency)}, about ${signal.percent}% below your usual week.`,
                link: {
                    href: ordersHref(signal.week.start, signal.week.end),
                    label: `See the orders placed ${which === "last week" ? "last week" : "that week"}`,
                },
            };
        }
        case "PLACE_DROP":
            return {
                answer: `${placeSubject(signal.placeKind, signal.name)} took ${signal.percent}% less than in the four weeks before.`,
            };
    }
}

function whereAnswer(f: TakingsFigures): string | null {
    if (f.places.length < 2) return null;
    const parts = f.places.map((p) => `${p.percent}% ${where(p)}`);
    return `Over the last four weeks, ${list(parts)}.`;
}

function capitalise(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The answers, in the design's order. A business with nothing on record
 * gets one, saying so; the others appear only when the figures can back
 * them.
 */
export function takingsAnswers(f: TakingsFigures): TakingsAnswer[] {
    const now = "How is this week going?";
    const soFarLink: RowsLink = {
        href: ordersHref(f.soFar.start, f.soFar.through),
        label: "See this week's orders",
    };
    // A business that has never taken money has no answers: the page says
    // so once, with what to do (`takings-section.tsx`).
    if (f.state === "NO_SALES") return [];
    if (f.state === "NOT_YET") {
        const so = f.soFar;
        return [
            {
                key: "now",
                question: now,
                answer: `Your first takings came in this week: ${money(so.takingsMinor, f.currency)} so far, from ${count(so.payments, "payment", "payments")}. Each week joins the figures once it ends, on Sunday.`,
                link: soFarLink,
            },
        ];
    }
    const answers: TakingsAnswer[] = [
        {
            key: "now",
            question: now,
            answer: soFarAnswer(f),
            ...(f.soFar.takingsMinor > 0 ? { link: soFarLink } : {}),
        },
        {
            key: "month",
            question: "How was the last month?",
            answer: monthAnswer(f),
        },
    ];
    const best = bestAnswer(f);
    if (best && f.best) {
        answers.push({
            key: "best",
            question: "Which week was best?",
            answer: best,
            link: {
                href: ordersHref(f.best.start, f.best.end),
                label: "See the orders placed that week",
            },
        });
    }
    const from = whereAnswer(f);
    if (from) {
        answers.push({
            key: "where",
            question: "Where is the money coming from?",
            answer: from,
        });
    }
    if (f.canWatch) {
        const said = f.signal
            ? signalAnswer(f, f.signal)
            : { answer: "Nothing unusual in the last four weeks." };
        answers.push({
            key: "watch",
            question: "Anything to watch?",
            ...said,
        });
    }
    return answers;
}

/** The four figures under the answers (1b), each with its window. */
export function takingsTiles(f: TakingsFigures): TakingsTile[] {
    // Where the orders were sold: locations and online, not invoices.
    const orderPlaces = f.places.filter((p) => p.kind !== "INVOICES").length;
    const top = f.places.at(0);
    const last4Orders = ordersHref(f.last4.from, f.last4.to);
    const ordersNote =
        f.last4.orders === 0
            ? "No paid orders in these four weeks."
            : top && f.places.length > 1
              ? `${top.percent}% of takings ${where(top)}.`
              : top
                ? `All of the takings ${where(top)}.`
                : "Paid in these four weeks.";
    return [
        {
            key: "takings",
            label: "Takings, 4 weeks",
            value: money(f.last4.takingsMinor, f.currency),
            note: changeNote(f.change),
            href: last4Orders,
        },
        {
            key: "orders",
            label: "Orders, 4 weeks",
            value: f.last4.orders.toLocaleString(NUMBER_LOCALE),
            note: ordersNote,
            href: last4Orders,
        },
        {
            key: "best",
            label: "Best week",
            value: f.best ? dayMonth(f.best.start) : "—",
            note: f.best
                ? `${money(f.best.takingsMinor, f.currency)} — the marked bar.`
                : "No week of the twelve took money.",
            href: f.best ? ordersHref(f.best.start, f.best.end) : last4Orders,
        },
        {
            key: "average",
            label: "Average order, 4 weeks",
            value:
                f.averageOrderMinor === null
                    ? "—"
                    : money(f.averageOrderMinor, f.currency),
            note:
                f.averageOrderMinor === null
                    ? "No paid orders to average."
                    : `Per paid order, last four weeks${orderPlaces > 1 ? `, from ${orderPlaces} places` : ""}.`,
            href: last4Orders,
        },
    ];
}

/** The twelve weeks' chart, said: "Takings for the twelve weeks …, highest in the week of 14 Sep at ₹…." */
export function chartLabel(f: TakingsFigures): string {
    const weeks = `Takings for the twelve weeks ${spanLabel(f.twelve)}`;
    return f.best
        ? `${weeks}, highest in ${weekOf(f.best.start)} at ${money(f.best.takingsMinor, f.currency)}.`
        : `${weeks}: nothing taken.`;
}

/** The first answer's spark, said: which four weeks were set against which. */
export function sparkLabel(f: TakingsFigures): string {
    return `${chartLabel(f)} The last four weeks (${spanLabel(f.last4)}) are drawn darkest, the four before them (${spanLabel(f.prior4)}) lighter.`;
}

/** One week of the chart, as its readout and its button say it. */
export function weekReadout(bar: WeekBar, currency: string | null): string {
    return `Week of ${dayMonth(bar.start)} · ${money(bar.takingsMinor, currency)} · ${count(bar.orders, "paid order", "paid orders")}`;
}

/** The week in progress, as the chart's readout says it. */
export function soFarReadout(f: TakingsFigures): string {
    const so = f.soFar;
    return `This week so far (${dayMonth(so.start)} – ${dayMonth(so.through)}) · ${money(so.takingsMinor, f.currency)} · ${count(so.orders, "paid order", "paid orders")}`;
}

/** Under the answers: what the last four weeks were counted from. */
export function sourceLine(f: TakingsFigures): string {
    const { payments, orders } = f.last4;
    if (payments <= 0) return "No payments in the last four weeks.";
    const invoices = Math.max(0, payments - orders);
    return `From ${count(payments, "payment", "payments")} in the last four weeks: ${count(orders, "paid order", "paid orders")} and ${count(invoices, "paid invoice", "paid invoices")}, less refunds.`;
}

/** "How takings are counted", in the merchant's words. */
export const HOW_TAKINGS_ARE_COUNTED: readonly string[] = [
    "Takings are money actually taken: paid orders, and paid invoices that aren't an order's own, less refunds and credit notes. Each rupee is counted once.",
    "A sale counts in the week it was paid, Monday to Sunday in your business's time zone.",
    "This week joins the twelve once it ends on Sunday. Until then it's shown on its own, against the same days of last week.",
    "The website's 7, 30 and 90 days below don't change these figures.",
];

/** A place's name on its own: "Hill Road", "Online", "By invoice". */
export function placeName(p: PlaceShare): string {
    if (p.kind === "ONLINE") return "Online";
    if (p.kind === "INVOICES") return "By invoice";
    return p.name ?? "A location";
}

/** The split bar, said: "Hill Road 66 per cent, online 34 per cent." */
export function splitLabel(places: readonly PlaceShare[]): string {
    const parts = places.map((p, i) => {
        const name = placeName(p);
        const said =
            i === 0 || p.kind === "LOCATION" ? name : name.toLowerCase();
        return `${said} ${p.percent} per cent`;
    });
    return `${parts.join(", ")}.`;
}

/** Under the section's heading: which weeks. How they are cut is in "How takings are counted". */
export function takingsSubtitle(f: TakingsFigures): string {
    return `This week so far, and the twelve whole weeks ${spanLabel(f.twelve)}.`;
}

/** Money in another currency, which the figures leave out. */
export function otherCurrencyNote(f: TakingsFigures): string | null {
    if (f.otherCurrencies.length === 0) return null;
    return `Money taken in ${list(f.otherCurrencies)} isn't counted here.`;
}
