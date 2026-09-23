import type { StaffView } from "@/lib/staff/types";

import type {
    BookingsCalendar,
    ClassSession,
    DiaryBooking,
} from "./booking-calendar";

/**
 * The bookings calendar's geometry (U15): local days in the business's zone,
 * each person's working windows, their time off and the free gaps left
 * between bookings — the "Saroh Bookings" design's day by person, worked out
 * from the staff read (U3) and the bookings read (U4).
 *
 * Pure: no clock, no fetch. Days are "YYYY-MM-DD" in the business's zone;
 * times of day are minutes from local midnight, the unit hours are stored in.
 */

/** A local day, "YYYY-MM-DD". */
export type LocalDate = string;

/** A stretch of one day, in minutes from local midnight: [start, end). */
export type Span = readonly [number, number];

const MINUTE = 60_000;
const DAY_MINUTES = 1440;

// ── Zones ───────────────────────────────────────────────────────────────────

const partsFormat = new Map<string, Intl.DateTimeFormat>();

function formatFor(timeZone: string): Intl.DateTimeFormat {
    let format = partsFormat.get(timeZone);
    if (!format) {
        format = new Intl.DateTimeFormat("en-US", {
            timeZone,
            hourCycle: "h23",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
        partsFormat.set(timeZone, format);
    }
    return format;
}

/** The wall clock of an instant in a zone. */
function wallClock(ms: number, timeZone: string) {
    const parts = Object.fromEntries(
        formatFor(timeZone)
            .formatToParts(new Date(ms))
            .map((p) => [p.type, p.value]),
    );
    return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        minute: (Number(parts.hour) % 24) * 60 + Number(parts.minute),
    };
}

/** How far a zone's wall clock is ahead of UTC at an instant, in ms. */
function offsetAt(ms: number, timeZone: string): number {
    const { date, minute } = wallClock(ms, timeZone);
    const asUtc = Date.parse(`${date}T00:00:00Z`) + minute * MINUTE;
    return asUtc - Math.floor(ms / MINUTE) * MINUTE;
}

/**
 * The instant a local wall-clock time happens. Two passes, so a time on the
 * far side of a DST change lands on the offset in force then.
 */
export function zonedInstant(
    date: LocalDate,
    minute: number,
    timeZone: string,
): Date {
    const naive = Date.parse(`${date}T00:00:00Z`) + minute * MINUTE;
    let ms = naive - offsetAt(naive, timeZone);
    ms = naive - offsetAt(ms, timeZone);
    return new Date(ms);
}

/** The local day of an instant. */
export function localDateOf(iso: string | Date, timeZone: string): LocalDate {
    return wallClock(new Date(iso).getTime(), timeZone).date;
}

/** Minutes from local midnight of an instant, on its own local day. */
export function localMinuteOf(iso: string | Date, timeZone: string): number {
    return wallClock(new Date(iso).getTime(), timeZone).minute;
}

/** The instants a local day runs between: [from, to). */
export function dayBounds(date: LocalDate, timeZone: string) {
    return {
        from: zonedInstant(date, 0, timeZone),
        to: zonedInstant(addDays(date, 1), 0, timeZone),
    };
}

/**
 * Where an instant falls on a local day, in minutes — below 0 when it is on
 * an earlier day, past 1440 on a later one — so a booking across midnight
 * clips instead of wrapping.
 */
export function minuteOnDay(
    iso: string | Date,
    date: LocalDate,
    timeZone: string,
): number {
    const start = zonedInstant(date, 0, timeZone).getTime();
    return Math.round((new Date(iso).getTime() - start) / MINUTE);
}

// ── Calendar days ───────────────────────────────────────────────────────────

export function addDays(date: LocalDate, days: number): LocalDate {
    const ms = Date.parse(`${date}T00:00:00Z`) + days * DAY_MINUTES * MINUTE;
    return new Date(ms).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, as hours are stored. */
export function weekdayOf(date: LocalDate): number {
    return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** The Monday of a day's week. */
export function weekStartOf(date: LocalDate): LocalDate {
    return addDays(date, -((weekdayOf(date) + 6) % 7));
}

/** Every day of a month, as "YYYY-MM-DD", and how many blanks lead it on a Monday grid. */
export function monthDays(date: LocalDate): {
    days: LocalDate[];
    lead: number;
} {
    const first = `${date.slice(0, 7)}-01`;
    const days: LocalDate[] = [];
    for (
        let d = first;
        d.slice(0, 7) === first.slice(0, 7);
        d = addDays(d, 1)
    ) {
        days.push(d);
    }
    return { days, lead: (weekdayOf(first) + 6) % 7 };
}

/** "06:00" — the diary's clock, 24-hour like the design. */
export function clock(minute: number): string {
    const m = ((minute % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
    const h = minute >= DAY_MINUTES ? 24 : Math.floor(m / 60);
    return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** "06:00" → 360. */
export function minuteOf(time: string): number {
    const [h = "0", m = "0"] = time.split(":");
    return Number(h) * 60 + Number(m);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_NAMES = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];
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

/**
 * "Fri 18 Sep". Spelled out rather than `Intl`: ICU versions disagree on
 * "Sep" and "Sept", and the server and the browser must render the same.
 */
export function dayLabel(date: LocalDate): string {
    return `${WEEKDAYS[weekdayOf(date)]} ${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
}

/** "Friday". */
export function weekdayName(date: LocalDate): string {
    return WEEKDAY_NAMES[weekdayOf(date)] ?? "";
}

/** "September 2026". */
export function monthLabel(date: LocalDate): string {
    const long = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ];
    return `${long[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
}

// ── Spans ───────────────────────────────────────────────────────────────────

/** Sorted, with touching and overlapping stretches joined. */
export function mergeSpans(spans: readonly Span[]): Span[] {
    const sorted = spans
        .filter(([a, b]) => b > a)
        .slice()
        .sort((x, y) => x[0] - y[0]);
    const out: [number, number][] = [];
    for (const [a, b] of sorted) {
        const last = out.at(-1);
        if (last && a <= last[1]) last[1] = Math.max(last[1], b);
        else out.push([a, b]);
    }
    return out;
}

/** What is left of `from` once every stretch of `take` is cut out of it. */
export function subtractSpans(
    from: readonly Span[],
    take: readonly Span[],
): Span[] {
    let left: Span[] = mergeSpans(from);
    for (const [a, b] of mergeSpans(take)) {
        left = left.flatMap(([s, e]): Span[] => {
            if (b <= s || a >= e) return [[s, e]];
            const pieces: Span[] = [];
            if (a > s) pieces.push([s, a]);
            if (b < e) pieces.push([b, e]);
            return pieces;
        });
    }
    return left;
}

function clip([a, b]: Span): Span {
    return [Math.max(0, a), Math.min(DAY_MINUTES, b)];
}

// ── A person's day ──────────────────────────────────────────────────────────

/** Weekly hours for the day's weekday, plus that date's extra hours. */
export function workingWindows(
    staff: Pick<StaffView, "hours" | "extraHours">,
    date: LocalDate,
): Span[] {
    const weekday = weekdayOf(date);
    return mergeSpans([
        ...staff.hours
            .filter((h) => h.dayOfWeek === weekday)
            .map((h): Span => [h.startMinute, h.endMinute]),
        ...staff.extraHours
            .filter((x) => x.date.slice(0, 10) === date)
            .map((x): Span => [x.startMinute, x.endMinute]),
    ]);
}

/** Time off that touches the day, clipped to it. */
export function timeOffSpans(
    staff: Pick<StaffView, "timeOff">,
    date: LocalDate,
    timeZone: string,
): Span[] {
    return mergeSpans(
        staff.timeOff
            .map((t): Span =>
                clip([
                    minuteOnDay(t.startAt, date, timeZone),
                    minuteOnDay(t.endAt, date, timeZone),
                ]),
            )
            .filter(([a, b]) => b > a),
    );
}

/** The shortest gap worth offering: nothing books in under 15 minutes. */
export const MIN_FREE_MINUTES = 15;

export interface PersonDay {
    /** Working hours, less time off. */
    windows: Span[];
    /** Time off on the day. */
    off: Span[];
    /** Working time nobody has booked: where a booking can go. */
    free: Span[];
}

/**
 * A person's day: when they work, when they are off, and what is still free
 * once `busy` (their bookings and classes, each with the gap after it) is
 * taken out. Gaps shorter than {@link MIN_FREE_MINUTES} are not offered.
 */
export function personDay(
    staff: Pick<StaffView, "hours" | "extraHours" | "timeOff">,
    date: LocalDate,
    timeZone: string,
    busy: readonly Span[],
    /** The shortest gap to offer — their shortest service, say. */
    minFree: number = MIN_FREE_MINUTES,
): PersonDay {
    const off = timeOffSpans(staff, date, timeZone);
    const windows = subtractSpans(workingWindows(staff, date), off);
    const free = subtractSpans(windows, busy).filter(
        ([a, b]) => b - a >= Math.max(MIN_FREE_MINUTES, minFree),
    );
    return { windows, off, free };
}

// ── Blocks ──────────────────────────────────────────────────────────────────

/** Where a booking stands, in the words the diary shows. */
export type DiaryState =
    "booked" | "pending" | "in" | "noshow" | "cancelled" | "open" | "full";

export function bookingState(
    b: Pick<DiaryBooking, "status" | "outcome">,
): DiaryState {
    if (b.status === "CANCELLED") return "cancelled";
    if (b.outcome === "ATTENDED") return "in";
    if (b.outcome === "NO_SHOW") return "noshow";
    return b.status === "PENDING" ? "pending" : "booked";
}

export const STATE_LABEL: Record<DiaryState, string> = {
    booked: "Booked",
    pending: "Awaiting payment",
    in: "Checked in",
    noshow: "No-show",
    cancelled: "Cancelled",
    open: "Open",
    full: "Full",
};

/** One thing on the diary: a one-to-one booking or a class start. */
export type Block =
    | {
          kind: "one";
          key: string;
          start: number;
          end: number;
          state: DiaryState;
          staffId: string | null;
          booking: DiaryBooking;
      }
    | {
          kind: "class";
          key: string;
          start: number;
          end: number;
          state: DiaryState;
          staffId: string | null;
          session: ClassSession;
      };

/** Places still held on a class: every booking on it not cancelled. */
export function liveSeats(session: ClassSession): DiaryBooking[] {
    return session.bookings.filter((b) => b.status !== "CANCELLED");
}

function sessionState(session: ClassSession): DiaryState {
    if (session.bookings.length > 0 && liveSeats(session).length === 0) {
        return "cancelled";
    }
    return session.taken >= session.capacity ? "full" : "open";
}

/** The diary key a person's column goes by; Unassigned has its own. */
export const UNASSIGNED = "unassigned";

/**
 * Each diary's blocks on one local day, keyed by person id (or
 * {@link UNASSIGNED}), in start order.
 */
export function blocksOnDay(
    calendar: BookingsCalendar,
    date: LocalDate,
    timeZone: string,
): Map<string, Block[]> {
    const out = new Map<string, Block[]>();
    for (const diary of calendar.diaries) {
        const key = diary.person?.id ?? UNASSIGNED;
        const blocks: Block[] = [];
        for (const booking of diary.bookings) {
            if (localDateOf(booking.startAt, timeZone) !== date) continue;
            blocks.push({
                kind: "one",
                key: booking.id,
                start: minuteOnDay(booking.startAt, date, timeZone),
                end: minuteOnDay(booking.endAt, date, timeZone),
                state: bookingState(booking),
                staffId: booking.staff?.id ?? null,
                booking,
            });
        }
        for (const session of diary.classes) {
            if (localDateOf(session.startAt, timeZone) !== date) continue;
            blocks.push({
                kind: "class",
                key: session.key,
                start: minuteOnDay(session.startAt, date, timeZone),
                end: minuteOnDay(session.endAt, date, timeZone),
                state: sessionState(session),
                staffId: session.staff?.id ?? null,
                session,
            });
        }
        blocks.sort((a, b) => a.start - b.start || a.key.localeCompare(b.key));
        out.set(key, blocks);
    }
    return out;
}

/**
 * What a person's blocks keep them from: every live booking and class, plus
 * the gap its service leaves after it.
 */
export function busySpans(
    blocks: readonly Block[],
    gapAfter: (serviceId: string) => number,
): Span[] {
    return blocks
        .filter((b) => b.state !== "cancelled")
        .map((b): Span => {
            const serviceId =
                b.kind === "one" ? b.booking.serviceId : b.session.service.id;
            return clip([b.start, b.end + gapAfter(serviceId)]);
        });
}

/** Whether a block still happens: not cancelled. */
export function isLive(block: Block): boolean {
    return block.state !== "cancelled";
}

/**
 * The money a day's live bookings bring, in minor units — one-to-ones at
 * their price, classes at the price of each place held — or null when the
 * read carried no prices (a viewer who reads no money).
 */
export function bookedValue(
    blocks: readonly Block[],
    money: boolean,
): number | null {
    if (!money) return null;
    let total = 0;
    for (const b of blocks) {
        if (!isLive(b)) continue;
        if (b.kind === "one") total += b.booking.service.priceCents ?? 0;
        else
            total +=
                liveSeats(b.session).length *
                (b.session.service.priceCents ?? 0);
    }
    return total;
}

/**
 * The visible hours of a day: the design's 06:00–21:00, widened to whole
 * hours around anything that falls outside it, so an early class or a late
 * booking is never cut off.
 */
export function visibleHours(spans: readonly Span[]): Span {
    let start = 6 * 60;
    let end = 21 * 60;
    for (const [a, b] of spans) {
        if (b <= a) continue;
        start = Math.min(start, Math.floor(Math.max(0, a) / 60) * 60);
        end = Math.max(end, Math.ceil(Math.min(DAY_MINUTES, b) / 60) * 60);
    }
    return [start, end];
}

/**
 * Side-by-side lanes for a week column: blocks that overlap another person's
 * take that person's lane, so a 06:30 session and a 07:00 class sit side by
 * side rather than on top of each other (the design's rule).
 */
export function laneOf(
    block: Block,
    all: readonly Block[],
    lanes: readonly string[],
): { lane: number; of: number } | null {
    const overlaps = all.some(
        (o) =>
            o !== block &&
            o.staffId !== block.staffId &&
            o.start < block.end &&
            block.start < o.end,
    );
    if (!overlaps) return null;
    const lane = Math.max(0, lanes.indexOf(block.staffId ?? UNASSIGNED));
    return { lane, of: Math.max(1, lanes.length) };
}

// ── Columns and words ───────────────────────────────────────────────────────

/** A person's column on a day (or Unassigned). */
export interface Column {
    key: string;
    name: string;
    title: string | null;
    /** Their hours, time off and free gaps; null when hours are unknown. */
    day: PersonDay | null;
    blocks: Block[];
}

/**
 * The day by person: everyone active on the diary in the staff list's order,
 * anyone else only on a day they hold something, and Unassigned last when it
 * holds something (bookings from before staff existed). With no staff list
 * (it failed to load), the people the bookings read names.
 */
export function dayColumns(
    calendar: BookingsCalendar,
    staff: readonly StaffView[] | null,
    date: LocalDate,
    timeZone: string,
    gapAfter: (serviceId: string) => number,
    /** The shortest gap worth offering a person: what they could book. */
    minFree: (person: StaffView) => number = () => MIN_FREE_MINUTES,
): Column[] {
    const byPerson = blocksOnDay(calendar, date, timeZone);
    const columns: Column[] = [];
    const seen = new Set<string>();
    for (const person of staff ?? []) {
        const blocks = byPerson.get(person.id) ?? [];
        if (person.status !== "ACTIVE" && blocks.length === 0) continue;
        seen.add(person.id);
        columns.push({
            key: person.id,
            name: person.name,
            title: person.title,
            day: personDay(
                person,
                date,
                timeZone,
                busySpans(blocks, gapAfter),
                minFree(person),
            ),
            blocks,
        });
    }
    for (const diary of calendar.diaries) {
        if (!diary.person || seen.has(diary.person.id)) continue;
        const blocks = byPerson.get(diary.person.id) ?? [];
        if (staff && blocks.length === 0) continue;
        columns.push({
            key: diary.person.id,
            name: diary.person.name,
            title: diary.person.title,
            day: null,
            blocks,
        });
    }
    const unassigned = byPerson.get(UNASSIGNED) ?? [];
    if (unassigned.length > 0) {
        columns.push({
            key: UNASSIGNED,
            name: "Unassigned",
            title: "Booked before staff",
            day: null,
            blocks: unassigned,
        });
    }
    return columns;
}

/** Who a booking is for: the contact's name, else what the booker typed. */
export function whoFor(b: DiaryBooking): string {
    const contact = [b.contact?.firstName, b.contact?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
    if (contact) return contact;
    const typed = b.bookerName?.trim();
    if (typed) return typed;
    return b.bookerEmail ?? "Someone";
}

/** How a place was paid, in words. */
export function paidText(b: DiaryBooking): string {
    switch (b.paidWith) {
        case "MEMBERSHIP":
            return "Membership";
        case "PACK":
            return b.packName ? `Pack · ${b.packName}` : "Class pack";
        case "PAID":
            return "Paid";
        case "DESK":
            return "Pays at the desk";
        default:
            return "Not recorded";
    }
}

/** The title on a block: the person for a one-to-one, the class's name. */
export function blockTitle(block: Block): string {
    return block.kind === "one"
        ? whoFor(block.booking)
        : block.session.service.name;
}

/** "Personal training · pays at the desk", or "11 of 16 · Vikram". */
export function blockLine(block: Block, withTeacher = true): string {
    if (block.kind === "class") {
        const places = `${liveSeats(block.session).length} of ${block.session.capacity}`;
        return withTeacher && block.session.staff
            ? `${places} · ${block.session.staff.name}`
            : places;
    }
    const b = block.booking;
    const pay =
        b.paidWith === "DESK" && block.state === "booked"
            ? " · pays at the desk"
            : b.paidWith === "PACK"
              ? " · pack"
              : b.paidWith === "MEMBERSHIP"
                ? " · membership"
                : "";
    return `${b.service.name}${pay}`;
}

/**
 * The first start a service can take inside a free gap, from the starts the
 * API offers for that person (which apply the service's own weekly rules
 * too): minutes from midnight, or null when none fits before the gap ends.
 */
export function firstStartIn(
    starts: readonly { startAt: string }[],
    free: Span,
    minutes: number,
    date: LocalDate,
    timeZone: string,
): number | null {
    let best: number | null = null;
    for (const s of starts) {
        const m = minuteOnDay(s.startAt, date, timeZone);
        if (
            m >= free[0] &&
            m + minutes <= free[1] &&
            (best === null || m < best)
        ) {
            best = m;
        }
    }
    return best;
}
