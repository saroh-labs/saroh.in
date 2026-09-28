/**
 * The Week hour grid's geometry (plan 005 E27, R17), after the "Saroh
 * Business Calendar" design: 06:00 to 22:00 at 44px an hour. Where a block
 * sits and how wide it is, which hours are shaded as outside working time,
 * and where the hour labels go. Pure numbers in, pure numbers out, so the
 * layout is tested without a browser.
 */

export const GRID_START_HOUR = 6;
export const GRID_END_HOUR = 22;
/** Pixels an hour. */
export const HOUR_PX = 44;
/** A short block still has room for its time. */
export const MIN_BLOCK_PX = 20;

const START = GRID_START_HOUR * 60;
const END = GRID_END_HOUR * 60;

/** The grid's full height in pixels. */
export const GRID_PX = (GRID_END_HOUR - GRID_START_HOUR) * HOUR_PX;

const px = (minutes: number) => (minutes / 60) * HOUR_PX;

/** Something timed on a day: minutes from local midnight, end exclusive. */
export interface Span {
    start: number;
    end: number;
}

export interface Placed<T extends Span> {
    span: T;
    /** From the grid's top, in pixels. */
    top: number;
    height: number;
    /** Which of `lanes` side-by-side places it takes, from the left. */
    lane: number;
    lanes: number;
    /** Began before 06:00, so its top is the grid's. */
    startsEarlier: boolean;
    /** Runs past 22:00, so its bottom is the grid's. */
    endsLater: boolean;
}

/**
 * Places a day's timed things. Things that overlap — directly or through a
 * chain of others — form a cluster and share its width in lanes, each taking
 * the first lane free when it starts; a thing on its own keeps the whole
 * width. A thing is clipped to the grid, and says so; one wholly outside it
 * sits against the edge it passed.
 */
export function placeBlocks<T extends Span>(spans: T[]): Placed<T>[] {
    const sorted = spans
        .map((span, i) => ({ span, i, end: Math.max(span.end, span.start) }))
        .sort((a, b) => a.span.start - b.span.start || a.i - b.i);

    // Back in the order given, so a caller can zip them with its items.
    const out: Placed<T>[] = new Array<Placed<T>>(spans.length);
    let cluster: { item: (typeof sorted)[number]; lane: number }[] = [];
    let laneEnds: number[] = [];
    let clusterEnd = -Infinity;

    const flush = () => {
        const lanes = Math.max(1, laneEnds.length);
        for (const { item, lane } of cluster) {
            out[item.i] = geometry(item.span, item.end, lane, lanes);
        }
        cluster = [];
        laneEnds = [];
        clusterEnd = -Infinity;
    };

    for (const item of sorted) {
        if (item.span.start >= clusterEnd) flush();
        let lane = laneEnds.findIndex((end) => end <= item.span.start);
        if (lane < 0) {
            lane = laneEnds.length;
            laneEnds.push(item.end);
        } else {
            laneEnds[lane] = item.end;
        }
        cluster.push({ item, lane });
        // A zero-length thing still takes its place for a moment.
        clusterEnd = Math.max(clusterEnd, item.end, item.span.start + 1);
    }
    flush();
    return out;
}

function geometry<T extends Span>(
    span: T,
    end: number,
    lane: number,
    lanes: number,
): Placed<T> {
    const startsEarlier = span.start < START;
    const endsLater = end > END;
    const from = Math.min(Math.max(span.start, START), END);
    const to = Math.max(Math.min(end, END), START);
    let top = px(from - START) + 1;
    const height = Math.max(MIN_BLOCK_PX, px(to - from) - 2);
    // Wholly after the grid: against its bottom edge, not below it.
    if (top + height > GRID_PX) top = Math.max(0, GRID_PX - height);
    return { span, top, height, lane, lanes, startsEarlier, endsLater };
}

/** A shaded stretch of a column, in pixels. */
export interface Band {
    top: number;
    height: number;
}

/**
 * The hours outside working time on one day, as the design shades them:
 * before the first stretch anyone works and after the last. `null`: nobody
 * works that day at all, so the whole day is drawn striped instead. No
 * stretches at all is `null` too — the caller decides whether that means a
 * day off or hours it was not told.
 */
export function workBands(
    windows: { startMinute: number; endMinute: number }[],
): Band[] | null {
    const worked = windows.filter((w) => w.endMinute > w.startMinute);
    if (worked.length === 0) return null;
    const lo = Math.min(...worked.map((w) => w.startMinute));
    const hi = Math.max(...worked.map((w) => w.endMinute));
    const bands: Band[] = [];
    if (lo > START) {
        bands.push({ top: 0, height: px(Math.min(lo, END) - START) });
    }
    if (hi < END) {
        const from = Math.max(hi, START);
        bands.push({ top: px(from - START), height: px(END - from) });
    }
    return bands;
}

/** "07:00" … "21:00", each at its line; 06:00 is the grid's top, unlabelled. */
export function hourLabels(): { text: string; top: number }[] {
    return Array.from(
        { length: GRID_END_HOUR - GRID_START_HOUR - 1 },
        (_, i) => {
            const h = GRID_START_HOUR + 1 + i;
            return {
                text: `${String(h).padStart(2, "0")}:00`,
                top: (h - GRID_START_HOUR) * HOUR_PX - 6,
            };
        },
    );
}

/** "HH:MM" of a minute of the day; past midnight wraps ("24:30" → "00:30"). */
export function hhmm(minutes: number): string {
    const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** "09:15" → 555. */
export function minutesOf(clock: string): number {
    const [h, m] = clock.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
}
