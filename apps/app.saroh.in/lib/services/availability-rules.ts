import { count } from "@/lib/format/plural";
import type { OffLine } from "@/lib/staff/time-off";
import { offLines } from "@/lib/staff/time-off";
import type {
    BookingPayment,
    BookingRules,
    Closure,
    ExtraHours,
    OnlineBlocker,
    StaffView,
    WeeklyRange,
} from "@/lib/staff/types";

/**
 * The Availability editor's rules (U16, the design's `?view=avail`): hours,
 * time off and extra hours are a draft until "Save", ranges refuse overlap
 * and an end before the start, Monday copies to the weekdays, and a draft
 * turns into the writes the API takes. The business's booking rules are not
 * part of that draft: each is a sentence in a row, changed in its own sheet
 * (`ruleRows`). Pure, so the editor and its tests agree.
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

/**
 * Time off added in the editor, not yet saved (E3): a range of days, all
 * day or the same hours on each, for one person or — `staffId` null — the
 * whole business closed.
 */
export interface NewOff {
    key: string;
    staffId: string | null;
    fromDate: string;
    toDate: string;
    /** Part of each day; both null for all day. */
    startMinute: number | null;
    endMinute: number | null;
    reason: string;
}

/** Everything the page's draft holds until "Save". */
export interface AvailabilityDraft {
    hours: Record<string, WeeklyRange[]>;
    offAdded: NewOff[];
    /** Rows of time off or closure taken away — a line's rows together. */
    offRemoved: string[];
    extraRemoved: string[];
}

export function draftFrom(staff: readonly StaffView[]): AvailabilityDraft {
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
    | { kind: "addOff"; off: NewOff }
    | { kind: "removeOff"; staffId: string; before: OffLine }
    | { kind: "removeClosure"; before: OffLine }
    | { kind: "removeExtra"; staffId: string; before: ExtraHours };

/** How people pay when they book; both unless it was set (DEC-088). */
export function payWayOf(rules: BookingRules): BookingPayment {
    return rules.bookingPayment ?? "BOTH";
}

/**
 * "How people pay when they book" (DEC-088), beside the rules: online,
 * at the desk, or both — both being what every business had before.
 */
export const PAY_WAY = {
    label: "How people pay when they book",
    options: [
        { value: "BOTH", label: "Both" },
        { value: "ONLINE", label: "Online" },
        { value: "DESK", label: "At the desk" },
    ],
} as const;

/**
 * What the chosen way means on the booking page, and — when online can't
 * be taken now and the way needs it — why. A deposit is paid online when
 * it can be, else at the desk wherever the desk is allowed (DEC-089).
 * `blocker` undefined is "couldn't tell", which says nothing more.
 */
export function payWayHint(
    way: BookingPayment,
    blocker: OnlineBlocker | null | undefined,
): string {
    const base =
        way === "DESK"
            ? "Nobody pays on the booking page. They pay when they come, a deposit too."
            : way === "ONLINE"
              ? "Everyone pays on the booking page when they book. Free services book with nothing to pay."
              : "People pay online when they book, or at the desk. A deposit is paid online, or at the desk when you can't take payment online.";
    const blocked = payWayBlocked(way, blocker);
    return blocked ? `${base} ${blocked}` : base;
}

/**
 * Why the chosen way can't take money online right now, and what that
 * leaves, or null when it can or the way doesn't need it.
 */
export function payWayBlocked(
    way: BookingPayment,
    blocker: OnlineBlocker | null | undefined,
): string | null {
    if (way === "DESK" || !blocker) return null;
    const why =
        blocker === "PAYMENTS_OFF"
            ? "Payments is switched off"
            : "no payment provider is connected";
    const then =
        way === "ONLINE"
            ? "nobody can book a service with a price online"
            : "everything is paid at the desk";
    return `Right now ${why}, so ${then}.`;
}

/** The business's refund policy, on unless it was turned off (DEC-058). */
export function refundsInTime(rules: BookingRules): boolean {
    return rules.refundInTimeCancels ?? true;
}

/**
 * The refund policy's choice (E30, DEC-058), beside the rules: what a
 * booking cancelled in time does with money paid online.
 */
export const REFUND_POLICY = {
    label: "Cancelled in time",
    options: [
        { value: "refund", label: "Refund what they paid online" },
        { value: "keep", label: "Don't refund automatically" },
    ],
    hint: "A late cancel is never refunded automatically. Someone who can refund payments can still give money back when they cancel. You can change this any time.",
} as const;

/**
 * The writes that make the saved state the draft; empty when unchanged. A
 * line of time off or closure is removed whole, in one write.
 */
export function saveOps(
    staff: readonly StaffView[],
    draft: AvailabilityDraft,
    closures: readonly Closure[] = [],
    timeZone = "UTC",
): SaveOp[] {
    const ops: SaveOp[] = [];
    const removed = (line: OffLine) =>
        line.ids.some((id) => draft.offRemoved.includes(id));
    for (const line of offLines(closures, timeZone, true)) {
        if (removed(line)) ops.push({ kind: "removeClosure", before: line });
    }
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
        for (const line of offLines(p.timeOff, timeZone, false)) {
            if (removed(line)) {
                ops.push({ kind: "removeOff", staffId: p.id, before: line });
            }
        }
        for (const x of p.extraHours) {
            if (draft.extraRemoved.includes(x.id)) {
                ops.push({ kind: "removeExtra", staffId: p.id, before: x });
            }
        }
    }
    for (const off of draft.offAdded) ops.push({ kind: "addOff", off });
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

export function aheadLabel(days: number): string {
    return days % 7 === 0
        ? count(days / 7, "week", "weeks")
        : count(days, "day", "days");
}

export function latestLabel(minutes: number): string {
    if (minutes % 1440 === 0)
        return `${count(minutes / 1440, "day", "days")} before`;
    if (minutes % 60 === 0)
        return `${count(minutes / 60, "hour", "hours")} before`;
    return `${minutes} minutes before`;
}

export function cancelLabel(hours: number): string {
    return `${count(hours, "hour", "hours")} before`;
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

/** One of the business's five booking rules. */
export type RuleKey =
    | "bookAheadDays"
    | "latestBookingMinutes"
    | "freeCancelHours"
    | "bookingPayment"
    | "refundInTimeCancels";

/** A choice in a rule's sheet, with the line under it when it has one. */
export interface RuleChoice extends RuleOption {
    note?: string;
}

/**
 * A booking rule as Availability shows it: a sentence in a row with Edit,
 * and the choices its sheet offers.
 */
export interface RuleRow {
    key: RuleKey;
    /** The row's few words: what the rule is about. */
    label: string;
    /** The sheet's title, and what Edit says it edits. */
    title: string;
    /** The saved rule, said whole. */
    sentence: string;
    /** The saved rule as one of `options`. */
    value: string;
    options: RuleChoice[];
    /** Said under the choices. */
    hint?: string;
}

const PAY_SENTENCE: Record<BookingPayment, string> = {
    BOTH: "Pay online or at the desk",
    ONLINE: "Pay online when they book",
    DESK: "Pay at the desk",
};

const lowerFirst = (words: string) =>
    words.charAt(0).toLowerCase() + words.slice(1);

/**
 * The five rules as sentences, in the order they are read: how far ahead,
 * how late, cancelling, paying, refunds. `blocker` is why online payment
 * can't be taken now, for the paying choices' own lines.
 */
export function ruleRows(
    rules: BookingRules,
    blocker?: OnlineBlocker | null,
): RuleRow[] {
    const [ahead, latest, cancel] = ruleChoices(rules);
    const way = payWayOf(rules);
    const refund = refundsInTime(rules) ? "refund" : "keep";
    const refundWords =
        REFUND_POLICY.options.find((o) => o.value === refund)?.label ?? "";
    return [
        {
            key: "bookAheadDays",
            label: "Booking ahead",
            title: ahead.label,
            sentence:
                rules.bookAheadDays === null
                    ? "No limit on how far ahead"
                    : `Book up to ${aheadLabel(rules.bookAheadDays)} ahead`,
            value: String(rules.bookAheadDays ?? ""),
            options: ahead.options,
        },
        {
            key: "latestBookingMinutes",
            label: "Booking late",
            title: latest.label,
            sentence:
                rules.latestBookingMinutes === null
                    ? "Book up to the start time"
                    : `Book up to ${latestLabel(rules.latestBookingMinutes)} the start`,
            value: String(rules.latestBookingMinutes ?? ""),
            options: latest.options,
        },
        {
            key: "freeCancelHours",
            label: "Cancelling",
            title: cancel.label,
            sentence:
                rules.freeCancelHours === null
                    ? "Free to cancel any time before"
                    : `Free to cancel up to ${cancelLabel(rules.freeCancelHours)}`,
            value: String(rules.freeCancelHours ?? ""),
            options: cancel.options,
        },
        {
            key: "bookingPayment",
            label: "Paying",
            title: PAY_WAY.label,
            sentence: PAY_SENTENCE[way],
            value: way,
            options: PAY_WAY.options.map((o) => ({
                ...o,
                note: payWayHint(o.value, blocker),
            })),
        },
        {
            key: "refundInTimeCancels",
            label: "Refunds",
            title: REFUND_POLICY.label,
            sentence: `${REFUND_POLICY.label}: ${lowerFirst(refundWords)}`,
            value: refund,
            options: [...REFUND_POLICY.options],
            hint: REFUND_POLICY.hint,
        },
    ];
}

/** A sheet's choice as the one field of the rules it changes. */
export function rulePatch(key: RuleKey, value: string): Partial<BookingRules> {
    if (key === "bookingPayment") {
        return { bookingPayment: value as BookingPayment };
    }
    if (key === "refundInTimeCancels") {
        return { refundInTimeCancels: value === "refund" };
    }
    return { [key]: value === "" ? null : Number(value) };
}

/** The one field as it stands, to put back on Undo. */
export function ruleBefore(
    key: RuleKey,
    rules: BookingRules,
): Partial<BookingRules> {
    if (key === "bookingPayment") return { bookingPayment: payWayOf(rules) };
    if (key === "refundInTimeCancels") {
        return { refundInTimeCancels: refundsInTime(rules) };
    }
    return { [key]: rules[key] };
}
