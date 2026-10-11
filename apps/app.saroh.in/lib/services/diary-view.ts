import type { DiaryBooking } from "./booking-calendar";
import type { Block, Column, PersonDay, Span } from "./diary";
import {
    isLive,
    liveSeats,
    mergeSpans,
    MIN_FREE_MINUTES,
    subtractSpans,
} from "./diary";
import type { Laned } from "./diary-lanes";
import { bookingLanes } from "./diary-lanes";

/**
 * What the diary draws, worked out from its geometry (`diary.ts`): closed
 * time and time off inside the hours shown, who still owes, where a tap in a
 * free gap starts, the lanes of what is drawn, and what the legend names.
 *
 * Pure: no clock, no fetch, no markup. The day and the week both read from
 * here, so they agree.
 */

// ── Closed time and time off ────────────────────────────────────────────────

/** The part of `spans` inside `range`. */
function within(spans: readonly Span[], [from, to]: Span): Span[] {
    return mergeSpans(
        spans.map(([a, b]): Span => [Math.max(a, from), Math.min(b, to)]),
    );
}

/** Time off inside the hours shown. */
export function offSpans(day: Pick<PersonDay, "off">, range: Span): Span[] {
    return within(day.off, range);
}

/**
 * Closed time inside the hours shown: what is neither working hours nor
 * time off. Time off is drawn in its own hatch, so it is not closed too.
 */
export function closedSpans(
    day: Pick<PersonDay, "windows" | "off">,
    range: Span,
): Span[] {
    return subtractSpans([range], [...day.windows, ...day.off]);
}

/** When anybody works on a day, and when nobody does because they are off. */
export interface DayHours {
    windows: Span[];
    off: Span[];
}

/**
 * A day's hours across everyone on the diary, for the week: open while
 * anybody works, off only while somebody is off and nobody works. Null when
 * no column knows its hours (the staff read failed), so nothing is hatched
 * on a guess.
 */
export function hoursAcross(columns: readonly Column[]): DayHours | null {
    const days = columns.flatMap((c) => (c.day ? [c.day] : []));
    if (days.length === 0) return null;
    const windows = mergeSpans(days.flatMap((d) => d.windows));
    return {
        windows,
        off: subtractSpans(
            days.flatMap((d) => d.off),
            windows,
        ),
    };
}

// ── Who still owes ──────────────────────────────────────────────────────────

/**
 * Whether a booking still has money to take: what the API says "Take" would
 * take now (`take`), or for a viewer who reads no money, that there is
 * something (`toTake`). From an API before either, one that pays at the
 * session and has not been taken at the desk. Never a cancelled one.
 */
export function toPay(b: DiaryBooking): boolean {
    if (b.status === "CANCELLED") return false;
    if (b.take !== undefined || b.toTake !== undefined) {
        return (b.take?.cents ?? 0) > 0 || b.toTake === true;
    }
    return b.paidWith === "DESK" && !b.paidAtDesk;
}

/**
 * The mark a block wears while money is still to take: "To pay" on a
 * booking, "2 to pay" on a class with two places that owe. Null when
 * nothing is owed.
 */
export function toPayText(block: Block): string | null {
    if (!isLive(block)) return null;
    if (block.kind === "one") return toPay(block.booking) ? "To pay" : null;
    const n = liveSeats(block.session).filter(toPay).length;
    return n > 0 ? `${n} to pay` : null;
}

// ── What is drawn ───────────────────────────────────────────────────────────

/**
 * The least a live booking is drawn at, in minutes: one readable line at the
 * desk (22px) and a 44px touch target on a phone, where a minute is twice as
 * tall. A 15 minute booking keeps its name.
 */
export const MIN_BLOCK_MINUTES = 28;

/** Under this a block has room for one line only: the name, then the time. */
export const ONE_LINE_UNDER_MINUTES = 45;

/** What a cancelled booking's thin line takes of the diary, in minutes. */
export const CANCELLED_LINE_MINUTES = 24;

/**
 * Side by side, never on top: the lanes of everything drawn in one column.
 * A cancelled booking is a thin line at its start, so it takes a lane only
 * from whatever starts beside that line, not for its whole length.
 */
export function drawnLanes(blocks: readonly Block[]): Map<string, Laned> {
    return bookingLanes(
        blocks.map((b) => ({
            key: b.key,
            start: b.start,
            end: isLive(b) ? b.end : b.start + CANCELLED_LINE_MINUTES,
        })),
        MIN_BLOCK_MINUTES,
    );
}

/** Starts are offered on the quarter hour. */
const SLOT_MINUTES = 15;

/**
 * Where a booking started from a point in a free gap begins: the nearest
 * quarter hour to `minute`, never before the gap opens and never so late
 * that the shortest thing bookable no longer fits before it closes.
 */
export function slotIn(
    free: Span,
    minute: number,
    shortest: number = MIN_FREE_MINUTES,
): number {
    const slot = Math.round(minute / SLOT_MINUTES) * SLOT_MINUTES;
    const last = Math.max(free[0], free[1] - shortest);
    return Math.max(free[0], Math.min(slot, last));
}

/**
 * What to bring into view when the diary is first drawn: now on today,
 * else the first booking that still happens, else when the day opens. Null
 * when there is nothing to aim at.
 */
export function firstSight(
    nowMinute: number | null,
    blocks: readonly Block[],
    open: readonly Span[],
    [from, to]: Span,
): number | null {
    const aim =
        nowMinute ??
        blocks
            .filter(isLive)
            .reduce<number | null>(
                (first, b) =>
                    first === null ? b.start : Math.min(first, b.start),
                null,
            ) ??
        mergeSpans(open).at(0)?.[0] ??
        null;
    return aim === null ? null : Math.max(from, Math.min(to, aim));
}

// ── The legend ──────────────────────────────────────────────────────────────

export type LegendKey = "one" | "class" | "closed" | "off" | "cancelled";

/**
 * What the legend names: only what is drawn on the view, and only what
 * needs telling apart. Bookings alone need no key. One-to-one and Class are
 * named when both are on the view, since they differ by colour.
 */
export function legendOf(drawn: {
    blocks: readonly Block[];
    closed: boolean;
    off: boolean;
}): LegendKey[] {
    const live = drawn.blocks.filter(isLive);
    const both =
        live.some((b) => b.kind === "one") &&
        live.some((b) => b.kind === "class");
    const keys: LegendKey[] = [];
    if (both) keys.push("one", "class");
    if (drawn.closed) keys.push("closed");
    if (drawn.off) keys.push("off");
    if (drawn.blocks.some((b) => !isLive(b))) keys.push("cancelled");
    return keys;
}
