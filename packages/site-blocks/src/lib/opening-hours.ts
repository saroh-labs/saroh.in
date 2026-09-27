/**
 * Open now, and when next, from a place's week (G8, R15).
 *
 * THE ONE COPY. The Visit us block, the hero's "Open now · closes 9pm"
 * (G18) and the booking page's header facts (E6) all say whether a business
 * is open, and three rules would be three answers to one question. Pure, so
 * the rule is tested without a clock, a zone database or a page.
 *
 * The week is what Settings › Hours writes to every storefront (DEC-034):
 * seven `{ day, open, close, closed }` entries, Monday first, times "HH:MM"
 * on the shop's wall clock. The clock is read in the BUSINESS's zone
 * (DEC-033), never the visitor's: a shop in Mumbai is open when it is 10am in
 * Mumbai, whatever the time where the phone is. Comparing wall-clock times in
 * that zone is also what makes a DST change a non-event — 09:00 is 09:00 on
 * both sides of it.
 *
 * Overnight hours (a close at or before the open, "18:00–02:00") run past
 * midnight into the next day. The API refuses such a day today; the rule
 * still reads one correctly rather than calling a late bar closed all night.
 */

export type Weekday = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

/** One day of a place's week. Times are "HH:MM", local to the business. */
export interface OpeningHoursDay {
    day: Weekday;
    open: string;
    close: string;
    closed: boolean;
}

/**
 * Where a place stands right now.
 *
 * `opensOn` is the day of the next opening and `today` says it is later
 * today, so a caller can say "opens 6am" rather than naming today.
 */
export type OpenState =
    | { open: true; closesAt: string }
    | { open: false; opensAt: string; opensOn: Weekday; today: boolean };

/** Monday first, as the API keeps a week. */
const WEEK: readonly Weekday[] = [
    "MON",
    "TUE",
    "WED",
    "THU",
    "FRI",
    "SAT",
    "SUN",
];

const SHORT: Record<Weekday, string> = {
    MON: "Mon",
    TUE: "Tue",
    WED: "Wed",
    THU: "Thu",
    FRI: "Fri",
    SAT: "Sat",
    SUN: "Sun",
};

/** Where no business has said otherwise (DEC-033): India. */
export const FALLBACK_TIME_ZONE = "Asia/Kolkata";

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Whether a value is a week as the public API returns it. */
export function isOpeningWeek(value: unknown): value is OpeningHoursDay[] {
    return (
        Array.isArray(value) &&
        value.every((d: unknown) => {
            if (typeof d !== "object" || d === null) return false;
            const v = d as Record<string, unknown>;
            return (
                typeof v.day === "string" &&
                (WEEK as readonly string[]).includes(v.day) &&
                typeof v.open === "string" &&
                CLOCK.test(v.open) &&
                typeof v.close === "string" &&
                CLOCK.test(v.close) &&
                typeof v.closed === "boolean"
            );
        })
    );
}

function minutes(clock: string): number {
    const [h = "0", m = "0"] = clock.split(":");
    return Number(h) * 60 + Number(m);
}

/** The weekday, date and minute of the day at `now` on the zone's wall clock. */
function wallClock(
    now: Date,
    timeZone: string,
): { day: Weekday; date: string; minute: number } {
    let parts: Intl.DateTimeFormatPart[];
    try {
        parts = zoneFormat(timeZone).formatToParts(now);
    } catch {
        // An unknown zone name: India, as everywhere a date is worked out.
        parts = zoneFormat(FALLBACK_TIME_ZONE).formatToParts(now);
    }
    const part = (type: string) => parts.find((p) => p.type === type)?.value;
    const day = (part("weekday") ?? "Mon").slice(0, 3).toUpperCase() as Weekday;
    // `h23` still says "24" for midnight in some engines.
    const hour = Number(part("hour") ?? "0") % 24;
    const date = `${part("year") ?? "1970"}-${part("month") ?? "01"}-${part("day") ?? "01"}`;
    return { day, date, minute: hour * 60 + Number(part("minute") ?? "0") };
}

function zoneFormat(timeZone: string): Intl.DateTimeFormat {
    return new Intl.DateTimeFormat("en-US", {
        timeZone,
        weekday: "short",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    });
}

/** A `YYYY-MM-DD` moved by whole days, read as a calendar date (no zone). */
function addDays(date: string, by: number): string {
    const d = new Date(`${date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + by);
    return d.toISOString().slice(0, 10);
}

/** The entry for a day, or nothing when the day is closed or not in the week. */
function openDay(
    week: readonly OpeningHoursDay[],
    day: Weekday,
): OpeningHoursDay | null {
    const found = week.find((d) => d.day === day);
    return found && !found.closed ? found : null;
}

function overnight(d: OpeningHoursDay): boolean {
    return minutes(d.close) <= minutes(d.open);
}

function shift(day: Weekday, by: number): Weekday {
    return WEEK[(WEEK.indexOf(day) + by + 7 * 2) % 7];
}

/**
 * Whether the place is open at `now`, and when it closes or next opens.
 * `null` when there is nothing true to say: no week saved, or a week in
 * which every day is closed.
 *
 * `closedDates` are days (`YYYY-MM-DD` in the zone) the business has marked
 * closed (E3, G18): each reads as a closed day, so the line never says
 * "Open now" on a holiday or "opens Mon" when Monday is shut.
 */
export function openState(
    week: readonly OpeningHoursDay[] | null | undefined,
    now: Date,
    timeZone: string,
    closedDates: readonly string[] = [],
): OpenState | null {
    if (!week || week.length === 0) return null;
    if (!WEEK.some((day) => openDay(week, day))) return null;

    const { day, date, minute } = wallClock(now, timeZone);
    const shut = new Set(closedDates);
    /** A day's hours, unless that date is closed. */
    const hoursOn = (weekday: Weekday, ahead: number) =>
        shut.has(addDays(date, ahead)) ? null : openDay(week, weekday);
    const today = hoursOn(day, 0);
    const yesterday = hoursOn(shift(day, -1), -1);

    // Last night's hours still running past midnight.
    if (
        yesterday &&
        overnight(yesterday) &&
        minute < minutes(yesterday.close)
    ) {
        return { open: true, closesAt: yesterday.close };
    }
    if (today) {
        const from = minutes(today.open);
        const to = minutes(today.close);
        const inside = overnight(today)
            ? minute >= from
            : minute >= from && minute < to;
        if (inside) return { open: true, closesAt: today.close };
        if (minute < from) {
            return {
                open: false,
                opensAt: today.open,
                opensOn: day,
                today: true,
            };
        }
    }
    // Up to a week ahead: seven days on is the same weekday, which is the
    // next opening of a place that opens one day a week.
    for (let ahead = 1; ahead <= 7; ahead++) {
        const next = shift(day, ahead);
        const d = hoursOn(next, ahead);
        if (d)
            return {
                open: false,
                opensAt: d.open,
                opensOn: next,
                today: false,
            };
    }
    return null;
}

/** "9pm", "8:30am", "12pm" — a time the way a shop door says it. */
export function clockText(clock: string): string {
    const total = minutes(clock);
    const h = Math.floor(total / 60);
    const m = total % 60;
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    const suffix = h < 12 ? "am" : "pm";
    return m === 0
        ? `${hour12}${suffix}`
        : `${hour12}:${String(m).padStart(2, "0")}${suffix}`;
}

/**
 * "Open now · closes 9pm", "Closed · opens Mon 8am", or "Closed · opens 6am"
 * when it opens later today. Empty when there is nothing true to say.
 */
export function openStateText(state: OpenState | null): string {
    if (!state) return "";
    if (state.open) return `Open now · closes ${clockText(state.closesAt)}`;
    const when = state.today
        ? clockText(state.opensAt)
        : `${SHORT[state.opensOn]} ${clockText(state.opensAt)}`;
    return `Closed · opens ${when}`;
}

/**
 * The week in one line — "Mon–Fri 6am–9pm · Sat 7am–1pm" — with neighbouring
 * days that keep the same hours said once and closed days left out, as the
 * design's Visit us card writes it. `null` when no day opens.
 */
export function weekSummary(
    week: readonly OpeningHoursDay[] | null | undefined,
): string | null {
    if (!week || week.length === 0) return null;
    const runs: { from: Weekday; to: Weekday; hours: string }[] = [];
    let previous: Weekday | null = null;
    for (const day of WEEK) {
        const d = openDay(week, day);
        if (!d) {
            previous = null;
            continue;
        }
        const hours = `${clockText(d.open)}–${clockText(d.close)}`;
        const last = runs.at(-1);
        if (last && previous !== null && last.hours === hours) {
            last.to = day;
        } else {
            runs.push({ from: day, to: day, hours });
        }
        previous = day;
    }
    if (runs.length === 0) return null;
    return runs
        .map((run) =>
            run.from === run.to
                ? `${SHORT[run.from]} ${run.hours}`
                : `${SHORT[run.from]}–${SHORT[run.to]} ${run.hours}`,
        )
        .join(" · ");
}
