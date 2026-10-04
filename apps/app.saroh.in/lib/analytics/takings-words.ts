import { formatMoney } from "@/lib/format/money";

import type {
    PlaceShare,
    TakingsChange,
    TakingsFigures,
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
 * - Merchants read "location", never "storefront" (DEC-069).
 */

export interface TakingsAnswer {
    key: "month" | "best" | "where" | "watch";
    question: string;
    answer: string;
}

export interface TakingsTile {
    key: "takings" | "orders" | "best" | "average";
    label: string;
    value: string;
    note: string;
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
    const lead = `${capitalise(weekOf(f.best.start))}, at ${money(f.best.takingsMinor, f.currency)}`;
    const above = f.bestAboveUsual ?? 0;
    return above > 0
        ? `${lead} — about ${above}% above ${usual}.`
        : `${lead} — level with ${usual}.`;
}

function whereAnswer(f: TakingsFigures): string | null {
    if (f.places.length < 2) return null;
    const parts = f.places.map((p) => `${p.percent}% ${where(p)}`);
    return `Over the last four weeks, ${list(parts)}.`;
}

function watchAnswer(f: TakingsFigures): string | null {
    if (!f.best || !f.quietest || f.weeksOnRecord < 2) return null;
    const last = f.lastWeek;
    const quietIsLast = f.quietest.start === last.start;
    const quiet =
        f.quietest.takingsMinor <= 0
            ? `${capitalise(quietIsLast ? "last week" : weekOf(f.quietest.start))} took nothing`
            : `The quietest week was ${quietIsLast ? "last week" : weekOf(f.quietest.start)}, at ${money(f.quietest.takingsMinor, f.currency)}`;
    if (quietIsLast) {
        return `${quiet}${belowUsual(f, last.takingsMinor)}.`;
    }
    if (f.lastIsBest) {
        return `${quiet}. Last week was your best of the twelve.`;
    }
    const below = f.lastBelowBest ?? 0;
    const lastFigure = money(last.takingsMinor, f.currency);
    const versus =
        below <= 0
            ? "level with your best week"
            : f.lastFollowsBest
              ? `${below}% below your best week, the one before it`
              : `${below}% below your best week`;
    return `${quiet}. Last week took ${lastFigure}, ${versus}.`;
}

/** ", 30% below your usual week", or nothing when it isn't (or took nothing). */
function belowUsual(f: TakingsFigures, minor: number): string {
    if (!f.usualMinor || f.usualMinor <= 0 || minor <= 0) return "";
    const below = Math.round(((f.usualMinor - minor) / f.usualMinor) * 100);
    return below > 0 ? `, ${below}% below your usual week` : "";
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
    const month = "How was the last month?";
    if (f.state === "NO_SALES") {
        return [
            {
                key: "month",
                question: month,
                answer: "No money has come in yet. Paid orders and paid invoices show here from the week they're paid.",
            },
        ];
    }
    if (f.state === "NOT_YET") {
        return [
            {
                key: "month",
                question: month,
                answer: "Your first takings came in this week. Each week shows here once it ends, on Sunday.",
            },
        ];
    }
    const answers: TakingsAnswer[] = [
        { key: "month", question: month, answer: monthAnswer(f) },
    ];
    const best = bestAnswer(f);
    if (best) {
        answers.push({
            key: "best",
            question: "Which week was best?",
            answer: best,
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
    const watch = watchAnswer(f);
    if (watch) {
        answers.push({
            key: "watch",
            question: "Anything to watch?",
            answer: watch,
        });
    }
    return answers;
}

/** The four figures under the answers (1b), each with its window. */
export function takingsTiles(f: TakingsFigures): TakingsTile[] {
    // Where the orders were sold: locations and online, not invoices.
    const orderPlaces = f.places.filter((p) => p.kind !== "INVOICES").length;
    const top = f.places.at(0);
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
        },
        {
            key: "orders",
            label: "Orders, 4 weeks",
            value: String(f.last4.orders),
            note: ordersNote,
        },
        {
            key: "best",
            label: "Best week",
            value: f.best ? dayMonth(f.best.start) : "—",
            note: f.best
                ? `${money(f.best.takingsMinor, f.currency)} — the marked bar.`
                : "No week of the twelve took money.",
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
                    : `Across ${f.last4.orders} ${f.last4.orders === 1 ? "order" : "orders"}${orderPlaces > 1 ? `, from ${orderPlaces} places` : ""}.`,
        },
    ];
}

/** The twelve weeks' chart, said: "Twelve weeks of takings, highest in the week of 14 Sep." */
export function chartLabel(f: TakingsFigures): string {
    const weeks = `Takings for the twelve weeks ${spanLabel(f.twelve)}`;
    return f.best
        ? `${weeks}, highest in ${weekOf(f.best.start)} at ${money(f.best.takingsMinor, f.currency)}.`
        : `${weeks}: nothing taken.`;
}

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

/** Under the section's heading: which weeks, and how they are cut. */
export function takingsSubtitle(f: TakingsFigures): string {
    return `The twelve weeks ${spanLabel(f.twelve)}, Monday to Sunday in your time zone. A week counts once it ends.`;
}

/** Money in another currency, which the figures leave out. */
export function otherCurrencyNote(f: TakingsFigures): string | null {
    if (f.otherCurrencies.length === 0) return null;
    return `Money taken in ${list(f.otherCurrencies)} isn't counted here.`;
}
