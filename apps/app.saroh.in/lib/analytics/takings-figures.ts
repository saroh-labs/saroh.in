import type {
    TakingsPlaceKind,
    TakingsRead,
    TakingsSoFar,
    TakingsWeek,
} from "./takings";

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
 * - **The week in progress is never a whole week.** It is compared only
 *   with the same days of the week before, and drawn hatched beside the
 *   twelve, never ranked among them.
 * - **"Anything to watch?" speaks only on a signal** ({@link TakingsSignal});
 *   otherwise it says nothing unusual happened, rather than restating records.
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

/** A week falling this far below the usual one is worth a look. */
export const DIP_PERCENT = 30;
/** A place whose takings fell this far on the four weeks before. */
export const PLACE_DROP_PERCENT = 30;
/** A place this small a share of the four before is too small to call. */
export const PLACE_MIN_SHARE = 10;
/** Weeks on record before "Anything to watch?" has a usual week to judge by. */
export const WATCH_MIN_WEEKS = 4;

/** The week in progress against the same days of last week. */
export type SoFarChange =
    | { kind: "AHEAD" | "BEHIND"; percent: number }
    | { kind: "LEVEL" }
    /** Too few payments on the same days last week to say. */
    | { kind: "THIN" };

/** The week in progress, so far. */
export interface SoFarFigures extends TakingsSoFar {
    change: SoFarChange;
    /** Its height on the twelve weeks' scale, 0–100 (it may pass the best). */
    heightPercent: number;
}

/**
 * Something in the last four weeks worth a look, worst first:
 * - `SLIDE`: each of the last three weeks took less than the one before,
 *   and last week ended below the usual week;
 * - `DIP`: a week of the last four took {@link DIP_PERCENT}% or more below
 *   the usual week (the most recent such);
 * - `PLACE_DROP`: one place took {@link PLACE_DROP_PERCENT}% or more less
 *   than in the four weeks before.
 */
export type TakingsSignal =
    | {
          kind: "SLIDE";
          from: { start: string; end: string; takingsMinor: number };
          to: { start: string; end: string; takingsMinor: number };
          percent: number;
      }
    | {
          kind: "DIP";
          week: { start: string; end: string; takingsMinor: number };
          percent: number;
      }
    | {
          kind: "PLACE_DROP";
          key: string;
          placeKind: TakingsPlaceKind;
          name: string | null;
          percent: number;
      };

/** Which comparison a bar belongs to, for the first answer's spark. */
export type BarWindow = "LAST4" | "PRIOR4" | "EARLIER";

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
    /** Its height as a share of the scale (the best week, or this week if higher), 0–100. */
    heightPercent: number;
    /** The last four weeks, the four before, or earlier. */
    window: BarWindow;
    /** Paid orders that week. */
    orders: number;
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
    /** The week in progress so far. */
    soFar: SoFarFigures;
    /** What "Anything to watch?" speaks about; null for nothing unusual. */
    signal: TakingsSignal | null;
    /** Enough weeks on record to judge what is unusual. */
    canWatch: boolean;
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

/** This week so far against the same days of last week. */
export function compareSoFar(so: TakingsSoFar): SoFarChange {
    if (
        so.sameDaysLastWeekPayments < MIN_PAYMENTS_TO_COMPARE ||
        so.sameDaysLastWeekMinor <= 0
    ) {
        return { kind: "THIN" };
    }
    const percent = Math.round(
        ((so.takingsMinor - so.sameDaysLastWeekMinor) /
            so.sameDaysLastWeekMinor) *
            100,
    );
    if (percent === 0) return { kind: "LEVEL" };
    return percent > 0
        ? { kind: "AHEAD", percent }
        : { kind: "BEHIND", percent: -percent };
}

const pick = (w: TakingsWeek) => ({
    start: w.start,
    end: w.end,
    takingsMinor: w.takingsMinor,
});

/** The worst thing worth a look in the last four weeks, else null. */
export function watchSignal(
    weeks: readonly TakingsWeek[],
    usualMinor: number | null,
    placesBefore: ReadonlyMap<string, number>,
    placesNow: ReadonlyMap<string, number>,
    named: ReadonlyMap<string, { kind: TakingsPlaceKind; name: string | null }>,
): TakingsSignal | null {
    const lastFour = weeks.slice(-4);
    const lastThree = weeks.slice(-3);
    const [a, b, c] = lastThree;
    if (
        lastThree.length === 3 &&
        usualMinor &&
        a.takingsMinor > b.takingsMinor &&
        b.takingsMinor > c.takingsMinor &&
        c.takingsMinor < usualMinor &&
        a.takingsMinor > 0
    ) {
        return {
            kind: "SLIDE",
            from: pick(a),
            to: pick(c),
            percent: Math.round(
                ((a.takingsMinor - c.takingsMinor) / a.takingsMinor) * 100,
            ),
        };
    }
    if (usualMinor && usualMinor > 0) {
        const dips = lastFour.filter(
            (w) =>
                ((usualMinor - w.takingsMinor) / usualMinor) * 100 >=
                DIP_PERCENT,
        );
        const dip = dips.at(-1);
        if (dip) {
            return {
                kind: "DIP",
                week: pick(dip),
                percent: Math.round(
                    ((usualMinor - dip.takingsMinor) / usualMinor) * 100,
                ),
            };
        }
    }
    const before = Array.from(placesBefore.values()).reduce((s, v) => s + v, 0);
    if (before > 0) {
        const drops = Array.from(placesBefore.entries())
            .filter(([, minor]) => (minor / before) * 100 >= PLACE_MIN_SHARE)
            .map(([key, minor]) => ({
                key,
                percent: Math.round(
                    ((minor - (placesNow.get(key) ?? 0)) / minor) * 100,
                ),
            }))
            .filter((d) => d.percent >= PLACE_DROP_PERCENT)
            .sort(
                (x, y) => y.percent - x.percent || x.key.localeCompare(y.key),
            );
        const drop = drops.at(0);
        if (drop) {
            return {
                kind: "PLACE_DROP",
                key: drop.key,
                placeKind: named.get(drop.key)?.kind ?? "LOCATION",
                name: named.get(drop.key)?.name ?? null,
                percent: drop.percent,
            };
        }
    }
    return null;
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
    const peakMinor = best?.takingsMinor ?? 0;
    // The scale: the best week, or this week so far when it has passed it.
    const max = Math.max(peakMinor, read.thisWeek.takingsMinor);
    const height = (minor: number) =>
        max > 0 ? Math.round((Math.max(0, minor) / max) * 100) : 0;
    const bars: WeekBar[] = weeks.map((w, i) => ({
        start: w.start,
        end: w.end,
        takingsMinor: w.takingsMinor,
        onRecord: onRecord(w),
        peak: best !== null && w.start === best.start,
        band: bandOf(w.takingsMinor, peakMinor),
        heightPercent: height(w.takingsMinor),
        window:
            i >= weeks.length - 4
                ? "LAST4"
                : i >= weeks.length - 8
                  ? "PRIOR4"
                  : "EARLIER",
        orders: w.orders,
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

    // Where the last four weeks' money came from, and the four before's.
    const placeTotals = (span: readonly TakingsWeek[]) => {
        const totals = new Map<string, number>();
        for (const w of span) {
            for (const p of w.places) {
                totals.set(p.key, (totals.get(p.key) ?? 0) + p.takingsMinor);
            }
        }
        return totals;
    };
    const byPlace = placeTotals(lastFour);
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
        soFar: {
            ...read.thisWeek,
            change: compareSoFar(read.thisWeek),
            heightPercent: height(read.thisWeek.takingsMinor),
        },
        signal:
            recorded.length >= WATCH_MIN_WEEKS
                ? watchSignal(
                      weeks,
                      usualMinor,
                      placeTotals(priorFour),
                      byPlace,
                      named,
                  )
                : null,
        canWatch: recorded.length >= WATCH_MIN_WEEKS,
    };
}
