import type {
    BookingRules,
    ExtraHours,
    StaffView,
    TimeOff,
    WeeklyRange,
} from "@/lib/staff/types";

/**
 * The Availability editor's rules (U16, the design's `?view=avail`): hours are
 * a draft until "Save hours", ranges refuse overlap and an end before the
 * start, Monday copies to the weekdays, and a draft turns into the writes the
 * API takes. Pure, so the editor and its tests agree.
 */

/** Monday first, as the design lists the week; values are 0 = Sunday. */
export const WEEK = [
    { day: 1, name: "Monday" },
    { day: 2, name: "Tuesday" },
    { day: 3, name: "Wednesday" },
    { day: 4, name: "Thursday" },
    { day: 5, name: "Friday" },
    { day: 6, name: "Saturday" },
    { day: 0, name: "Sunday" },
] as const;

type Range = Pick<WeeklyRange, "startMinute" | "endMinute">;

/** Why a new range cannot go on a day, or null when it can. */
export function rangeRefusal(
    existing: readonly Range[],
    add: Range,
): string | null {
    if (add.endMinute <= add.startMinute) {
        return "The end has to be after the start.";
    }
    if (
        existing.some(
            (r) =>
                add.startMinute < r.endMinute && r.startMinute < add.endMinute,
        )
    ) {
        return "That overlaps hours already set.";
    }
    return null;
}

/** A day's ranges in order. */
export function dayRanges(
    hours: readonly WeeklyRange[],
    day: number,
): WeeklyRange[] {
    return hours
        .filter((h) => h.dayOfWeek === day)
        .sort((a, b) => a.startMinute - b.startMinute);
}

/** Tuesday to Friday become Monday; the weekend is left alone. */
export function copyMondayToWeekdays(
    hours: readonly WeeklyRange[],
): WeeklyRange[] {
    const monday = dayRanges(hours, 1);
    return [
        ...hours.filter((h) => h.dayOfWeek < 2 || h.dayOfWeek > 5),
        ...[2, 3, 4, 5].flatMap((day) =>
            monday.map((r) => ({ ...r, dayOfWeek: day })),
        ),
    ];
}

/** Hours a week, e.g. 44 or 27.5. */
export function weeklyHours(hours: readonly WeeklyRange[]): number {
    return hours.reduce((n, h) => n + (h.endMinute - h.startMinute), 0) / 60;
}

function key(hours: readonly WeeklyRange[]): string {
    return hours
        .map((h) => `${h.dayOfWeek}:${h.startMinute}-${h.endMinute}`)
        .sort()
        .join(",");
}

export function sameHours(
    a: readonly WeeklyRange[],
    b: readonly WeeklyRange[],
): boolean {
    return key(a) === key(b);
}

/** A booking the editor weighs against new hours. */
export interface KeptBooking {
    id: string;
    staffId: string;
    /** 0 = Sunday … 6 = Saturday, local to the business. */
    weekday: number;
    /** Minutes from local midnight it starts at. */
    start: number;
    who: string;
}

/**
 * The bookings that would fall outside a person's hours on a weekday. They
 * stay booked — hours never move a booking — but the merchant is told.
 */
export function outsideHours(
    bookings: readonly KeptBooking[],
    staffId: string,
    hours: readonly WeeklyRange[],
    day: number,
): KeptBooking[] {
    const ranges = dayRanges(hours, day);
    return bookings.filter(
        (b) =>
            b.staffId === staffId &&
            b.weekday === day &&
            !ranges.some(
                (r) => b.start >= r.startMinute && b.start < r.endMinute,
            ),
    );
}

/** A day off added in the editor, not yet saved. */
export interface NewDayOff {
    key: string;
    staffId: string;
    date: string;
    reason: string;
}

/** Everything the editor can change, held until "Save hours". */
export interface AvailabilityDraft {
    hours: Record<string, WeeklyRange[]>;
    offAdded: NewDayOff[];
    offRemoved: string[];
    extraRemoved: string[];
    rules: BookingRules;
}

export function draftFrom(
    staff: readonly StaffView[],
    rules: BookingRules,
): AvailabilityDraft {
    return {
        hours: Object.fromEntries(
            staff.map((p) => [
                p.id,
                p.hours.map((h) => ({
                    dayOfWeek: h.dayOfWeek,
                    startMinute: h.startMinute,
                    endMinute: h.endMinute,
                })),
            ]),
        ),
        offAdded: [],
        offRemoved: [],
        extraRemoved: [],
        rules: { ...rules },
    };
}

/** One write the draft turns into, with what to put back for Undo. */
export type SaveOp =
    | {
          kind: "hours";
          staffId: string;
          hours: WeeklyRange[];
          before: WeeklyRange[];
      }
    | { kind: "addOff"; staffId: string; date: string; reason: string }
    | { kind: "removeOff"; staffId: string; before: TimeOff }
    | { kind: "removeExtra"; staffId: string; before: ExtraHours }
    | { kind: "rules"; rules: BookingRules; before: BookingRules };

function sameRules(a: BookingRules, b: BookingRules): boolean {
    return (
        a.bookAheadDays === b.bookAheadDays &&
        a.latestBookingMinutes === b.latestBookingMinutes &&
        a.freeCancelHours === b.freeCancelHours
    );
}

/** The writes that make the saved state the draft; empty when unchanged. */
export function saveOps(
    staff: readonly StaffView[],
    rules: BookingRules,
    draft: AvailabilityDraft,
): SaveOp[] {
    const ops: SaveOp[] = [];
    for (const p of staff) {
        const next = draft.hours[p.id] as WeeklyRange[] | undefined;
        if (next && !sameHours(next, p.hours)) {
            ops.push({
                kind: "hours",
                staffId: p.id,
                hours: next,
                before: p.hours,
            });
        }
        for (const t of p.timeOff) {
            if (draft.offRemoved.includes(t.id)) {
                ops.push({ kind: "removeOff", staffId: p.id, before: t });
            }
        }
        for (const x of p.extraHours) {
            if (draft.extraRemoved.includes(x.id)) {
                ops.push({ kind: "removeExtra", staffId: p.id, before: x });
            }
        }
    }
    for (const o of draft.offAdded) {
        ops.push({
            kind: "addOff",
            staffId: o.staffId,
            date: o.date,
            reason: o.reason,
        });
    }
    if (!sameRules(rules, draft.rules)) {
        ops.push({ kind: "rules", rules: draft.rules, before: rules });
    }
    return ops;
}

export interface RuleOption {
    value: string;
    label: string;
}

function withCurrent(
    options: RuleOption[],
    current: number | null,
    label: (n: number) => string,
): RuleOption[] {
    const value = current === null ? "" : String(current);
    if (options.some((o) => o.value === value)) return options;
    return [
        ...options,
        { value, label: current === null ? "" : label(current) },
    ];
}

const plural = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;

export function aheadLabel(days: number): string {
    return days % 7 === 0
        ? plural(days / 7, "week", "weeks")
        : plural(days, "day", "days");
}

export function latestLabel(minutes: number): string {
    if (minutes % 1440 === 0)
        return `${plural(minutes / 1440, "day", "days")} before`;
    if (minutes % 60 === 0)
        return `${plural(minutes / 60, "hour", "hours")} before`;
    return `${minutes} minutes before`;
}

export function cancelLabel(hours: number): string {
    return `${plural(hours, "hour", "hours")} before`;
}

/**
 * The three business-wide rules and their choices (the design's options),
 * each with "No limit" — a rule the API also allows — and the current value
 * if it is not one of them, so a select never shows blank.
 */
export function ruleChoices(rules: BookingRules) {
    return [
        {
            key: "bookAheadDays" as const,
            label: "How far ahead people can book",
            options: withCurrent(
                [
                    { value: "7", label: "1 week" },
                    { value: "14", label: "2 weeks" },
                    { value: "28", label: "4 weeks" },
                    { value: "56", label: "8 weeks" },
                    { value: "", label: "No limit" },
                ],
                rules.bookAheadDays,
                aheadLabel,
            ),
        },
        {
            key: "latestBookingMinutes" as const,
            label: "Latest they can book",
            options: withCurrent(
                [
                    { value: "30", label: "30 minutes before" },
                    { value: "120", label: "2 hours before" },
                    { value: "1440", label: "1 day before" },
                    { value: "", label: "Any time before" },
                ],
                rules.latestBookingMinutes,
                latestLabel,
            ),
        },
        {
            key: "freeCancelHours" as const,
            label: "Free cancellation until",
            options: withCurrent(
                [
                    { value: "2", label: "2 hours before" },
                    { value: "12", label: "12 hours before" },
                    { value: "24", label: "24 hours before" },
                    { value: "", label: "Any time before" },
                ],
                rules.freeCancelHours,
                cancelLabel,
            ),
        },
    ];
}
