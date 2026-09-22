/**
 * Subscription periods, exactly as the API computes them
 * (`apps/api.saroh.in/src/modules/subscriptions/periods.ts`), so a seeded
 * subscription sits where the renewal job would have left it.
 *
 * The API does the arithmetic with luxon in the subscription's zone: take the
 * ANCHOR's local wall-clock time, add `n` intervals (a month that is too short
 * clamps the day to its last), and read that wall-clock time back as an
 * instant. Every boundary is counted from the anchor, never from the previous
 * boundary. The showcase's businesses are all in Asia/Kolkata, which has had
 * no daylight saving since 1945, so the zone is a fixed offset and the same
 * arithmetic needs no zone library; any other zone is refused rather than
 * approximated.
 */

export type Interval = "WEEK" | "MONTH" | "QUARTER" | "YEAR";

export interface Period {
    start: Date;
    end: Date;
}

const OFFSETS: ReadonlyMap<string, number> = new Map([
    ["Asia/Kolkata", 330 * 60_000],
]);

function offsetOf(timezone: string): number {
    const offset = OFFSETS.get(timezone);
    if (offset === undefined) {
        throw new Error(
            `The showcase computes periods for fixed-offset zones only, not "${timezone}"`,
        );
    }
    return offset;
}

const daysInMonth = (year: number, month: number) =>
    new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/** The anchor plus `n` intervals, clamped to the end of a shorter month. */
export function boundary(
    anchor: Date,
    interval: Interval,
    timezone: string,
    n: number,
): Date {
    const offset = offsetOf(timezone);
    // The anchor's wall clock, read through UTC getters.
    const local = new Date(anchor.getTime() + offset);
    const timeOfDay =
        local.getTime() -
        Date.UTC(
            local.getUTCFullYear(),
            local.getUTCMonth(),
            local.getUTCDate(),
        );
    let year = local.getUTCFullYear();
    let month = local.getUTCMonth();
    let day = local.getUTCDate();
    if (interval === "WEEK") {
        return new Date(anchor.getTime() + n * 7 * 86_400_000);
    }
    const months =
        interval === "YEAR" ? 12 * n : interval === "QUARTER" ? 3 * n : n;
    const total = month + months;
    year += Math.floor(total / 12);
    month = ((total % 12) + 12) % 12;
    day = Math.min(day, daysInMonth(year, month));
    return new Date(Date.UTC(year, month, day) + timeOfDay - offset);
}

/**
 * The period that holds `at`: `start <= at < end`, on the chain that starts
 * at the anchor. A moment before the anchor gets the first period.
 */
export function periodContaining(
    anchor: Date,
    interval: Interval,
    timezone: string,
    at: Date,
): Period {
    let n = 0;
    while (boundary(anchor, interval, timezone, n + 1) <= at) n += 1;
    return {
        start: boundary(anchor, interval, timezone, n),
        end: boundary(anchor, interval, timezone, n + 1),
    };
}

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

/** The local calendar date of an instant in the zone. */
function localDate(when: Date, timezone: string) {
    const d = new Date(when.getTime() + offsetOf(timezone));
    return {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth(),
        day: d.getUTCDate(),
    };
}

/**
 * "1 Sep – 30 Sep 2026", as the API's `periodLabel` writes it into an
 * invoice line: the last day shown is the day before the end.
 */
export function periodLabel(period: Period, timezone: string): string {
    const start = localDate(period.start, timezone);
    const last = localDate(
        new Date(period.end.getTime() - 86_400_000),
        timezone,
    );
    const head = `${start.day} ${MONTHS[start.month]}`;
    return `${start.year === last.year ? head : `${head} ${start.year}`} – ${last.day} ${MONTHS[last.month]} ${last.year}`;
}
