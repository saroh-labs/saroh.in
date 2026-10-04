import type { TakingsPlaceKind, TakingsRead, TakingsWeek } from "./takings";

/**
 * Insights' figures (DEC-075): everything the page shows, worked out once
 * from the takings read, so the answers in words (`takings-words.ts`) and
 * the figures laid out under them are the same numbers and cannot drift.
 * Pure; tested in `takings-figures.test.ts`.
 *
 * The rules the design sets (Saroh Home Insights Patterns, 3d and 3f):
 *
 * - **Every figure carries its window.** The last four weeks, the four
 *   before them and the twelve are each a stated date range.
 * - **A delta needs a stated baseline.** The last four weeks are compared
 *   with the four before only when the business was taking money for all
 *   of them (`FIRST_WEEKS` otherwise) and they hold at least
 *   {@link MIN_PAYMENTS_TO_COMPARE} payments (`THIN` otherwise) — the same
 *   floor as Home's "This week". Never a 0% stand-in.
 * - **Flat is level**, not growth: a change that rounds to 0% is `LEVEL`.
 * - **A week before the first sale is not a quiet week.** The usual week,
 *   the quietest and the best are read over the weeks on record only.
 */

/** Fewer payments than this in the four weeks before, and there is no comparing. */
export const MIN_PAYMENTS_TO_COMPARE = 3;

/** A span of whole weeks, Monday to Sunday. */
export interface WeekSpan {
    /** Its first Monday, `2026-08-31`. */
    from: string;
    /** Its last Sunday, `2026-09-27`. */
    to: string;
}

/** The last four weeks against the four before. */
export type TakingsChange =
    | { kind: "UP" | "DOWN"; percent: number }
    | { kind: "LEVEL" }
    /** The business wasn't taking money for the whole of the four before. */
    | { kind: "FIRST_WEEKS" }
    /** Too few payments in the four before to say. */
    | { kind: "THIN" };

/** Darker is higher, as the design bands the bars. */
export type Band = 1 | 2 | 3;

/** One bar of the twelve. */
export interface WeekBar {
    start: string;
    end: string;
    takingsMinor: number;
    /** On or after the week of the business's first sale. */
    onRecord: boolean;
    /** The best week of the twelve, drawn in the accent. */
    peak: boolean;
    band: Band;
    /** Its height as a share of the best week, 0–100. */
    heightPercent: number;
}

/** One share of where the money came from. */
export interface PlaceShare {
    key: string;
    kind: TakingsPlaceKind;
    /** A location's name; null for online and invoices. */
    name: string | null;
    takingsMinor: number;
    /** Whole percent; the shares add up to 100. */
    percent: number;
}

/** What one span of weeks took. */
export interface SpanTotals {
    takingsMinor: number;
    orderTakingsMinor: number;
    orders: number;
    payments: number;
}

/**
 * - `NO_SALES`: the business has never taken money.
 * - `NOT_YET`: its first money came this week, which isn't whole yet.
 * - `SALES`: at least one whole week is on record.
 */
export type TakingsState = "NO_SALES" | "NOT_YET" | "SALES";

export interface TakingsFigures {
    state: TakingsState;
    currency: string | null;
    otherCurrencies: string[];
    /** The twelve weeks. */
    twelve: WeekSpan;
    /** The last four weeks of the twelve. */
    last4: WeekSpan & SpanTotals;
    /** The four weeks before those. */
    prior4: WeekSpan & SpanTotals;
    change: TakingsChange;
    bars: WeekBar[];
    /** How many of the twelve are on record. */
    weeksOnRecord: number;
    /** The best week on record; null when none took money. */
    best: { start: string; end: string; takingsMinor: number } | null;
    /** The average week on record. Null with fewer than two on record. */
    usualMinor: number | null;
    /** The best week against the usual one, whole percent; null without one. */
    bestAboveUsual: number | null;
    /** The quietest week on record; null with fewer than two on record. */
    quietest: { start: string; end: string; takingsMinor: number } | null;
    /** The last whole week. */
    lastWeek: { start: string; end: string; takingsMinor: number };
    /** Last week against the best, whole percent below it; null without a best. */
    lastBelowBest: number | null;
    /** Last week is the best one. */
    lastIsBest: boolean;
    /** Last week is the one straight after the best. */
    lastFollowsBest: boolean;
    /** Where the last four weeks' money came from, largest first. */
    places: PlaceShare[];
    /** The last four weeks' paid orders' average; null with none. */
    averageOrderMinor: number | null;
    /** Open locations the business has. */
    locations: number;
}

const sumSpan = (weeks: readonly TakingsWeek[]): SpanTotals => ({
    takingsMinor: weeks.reduce((s, w) => s + w.takingsMinor, 0),
    orderTakingsMinor: weeks.reduce((s, w) => s + w.orderTakingsMinor, 0),
    orders: weeks.reduce((s, w) => s + w.orders, 0),
    payments: weeks.reduce((s, w) => s + w.payments, 0),
});

const span = (weeks: readonly TakingsWeek[]): WeekSpan => ({
    from: weeks[0]?.start ?? "",
    to: weeks[weeks.length - 1]?.end ?? "",
});

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

/** The last four against the four before, by the rules above. */
export function compareSpans(
    last: SpanTotals,
    prior: SpanTotals,
    priorOnRecord: boolean,
): TakingsChange {
    if (!priorOnRecord) return { kind: "FIRST_WEEKS" };
    if (prior.payments < MIN_PAYMENTS_TO_COMPARE || prior.takingsMinor <= 0) {
        return { kind: "THIN" };
    }
    const percent = Math.round(
        ((last.takingsMinor - prior.takingsMinor) / prior.takingsMinor) * 100,
    );
    if (percent === 0) return { kind: "LEVEL" };
    return percent > 0
        ? { kind: "UP", percent }
        : { kind: "DOWN", percent: -percent };
}

/** Darker for the top third of the best week, lighter for the bottom. */
function bandOf(value: number, max: number): Band {
    if (max <= 0) return 3;
    const r = value / max;
    if (r >= 2 / 3) return 1;
    if (r >= 1 / 3) return 2;
    return 3;
}

function stateOf(read: TakingsRead): TakingsState {
    if (!read.firstSaleOn) return "NO_SALES";
    return read.firstSaleOn >= read.thisWeekStart ? "NOT_YET" : "SALES";
}

/** Everything the page shows, from the takings read. */
export function takingsFigures(read: TakingsRead): TakingsFigures {
    const weeks = read.weeks;
    const first = read.firstSaleOn;
    // A week is on record from the one the first sale fell in.
    const onRecord = (w: TakingsWeek) => first !== null && w.end >= first;

    const recorded = weeks.filter(onRecord);
    const best = recorded.reduce<TakingsWeek | null>(
        (top, w) =>
            w.takingsMinor > 0 && (!top || w.takingsMinor > top.takingsMinor)
                ? w
                : top,
        null,
    );
    const max = best?.takingsMinor ?? 0;
    const bars: WeekBar[] = weeks.map((w) => ({
        start: w.start,
        end: w.end,
        takingsMinor: w.takingsMinor,
        onRecord: onRecord(w),
        peak: best !== null && w.start === best.start,
        band: bandOf(w.takingsMinor, max),
        heightPercent:
            max > 0 ? Math.round((Math.max(0, w.takingsMinor) / max) * 100) : 0,
    }));

    const lastFour = weeks.slice(-4);
    const priorFour = weeks.slice(-8, -4);
    const last4 = { ...span(lastFour), ...sumSpan(lastFour) };
    const prior4 = { ...span(priorFour), ...sumSpan(priorFour) };
    const priorOnRecord =
        first !== null && priorFour.length === 4 && first <= priorFour[0].start;

    const usualMinor =
        recorded.length >= 2
            ? Math.round(
                  recorded.reduce((s, w) => s + w.takingsMinor, 0) /
                      recorded.length,
              )
            : null;
    const quietest =
        recorded.length >= 2
            ? recorded.reduce((low, w) =>
                  w.takingsMinor < low.takingsMinor ? w : low,
              )
            : null;
    const lastWeek = weeks.at(-1);
    const bestIndex = best ? weeks.indexOf(best) : -1;

    // Where the last four weeks' money came from.
    const byPlace = new Map<string, number>();
    for (const w of lastFour) {
        for (const p of w.places) {
            byPlace.set(p.key, (byPlace.get(p.key) ?? 0) + p.takingsMinor);
        }
    }
    const named = new Map(read.places.map((p) => [p.key, p]));
    const ordered = Array.from(byPlace.entries())
        .filter(([, minor]) => minor > 0)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const percents = shares(ordered.map(([, minor]) => minor));
    const places: PlaceShare[] = ordered.map(([key, takingsMinor], i) => ({
        key,
        kind: named.get(key)?.kind ?? "LOCATION",
        name: named.get(key)?.name ?? null,
        takingsMinor,
        percent: percents[i],
    }));

    return {
        state: stateOf(read),
        currency: read.currency,
        otherCurrencies: read.otherCurrencies,
        twelve: span(weeks),
        last4,
        prior4,
        change: compareSpans(last4, prior4, priorOnRecord),
        bars,
        weeksOnRecord: recorded.length,
        best: best
            ? {
                  start: best.start,
                  end: best.end,
                  takingsMinor: best.takingsMinor,
              }
            : null,
        usualMinor,
        bestAboveUsual:
            best && usualMinor && usualMinor > 0
                ? Math.round(
                      ((best.takingsMinor - usualMinor) / usualMinor) * 100,
                  )
                : null,
        quietest: quietest
            ? {
                  start: quietest.start,
                  end: quietest.end,
                  takingsMinor: quietest.takingsMinor,
              }
            : null,
        lastWeek: {
            start: lastWeek?.start ?? "",
            end: lastWeek?.end ?? "",
            takingsMinor: lastWeek?.takingsMinor ?? 0,
        },
        lastBelowBest:
            best && lastWeek
                ? Math.round(
                      ((best.takingsMinor - lastWeek.takingsMinor) /
                          best.takingsMinor) *
                          100,
                  )
                : null,
        lastIsBest: best !== null && lastWeek?.start === best.start,
        lastFollowsBest: bestIndex >= 0 && bestIndex === weeks.length - 2,
        places,
        averageOrderMinor:
            last4.orders > 0
                ? Math.round(last4.orderTakingsMinor / last4.orders)
                : null,
        locations: read.locations,
    };
}
