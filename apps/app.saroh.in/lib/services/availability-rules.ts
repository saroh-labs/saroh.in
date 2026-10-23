import { count } from "@/lib/format/plural";
import type { LocalDate } from "@/lib/services/diary";
import type {
    BookingPayment,
    BookingRules,
    OnlineBlocker,
    WeeklyRange,
} from "@/lib/staff/types";

/**
 * Hours and time off's rules (U16; V2 in U17, DEC-170): whether two weeks
 * are the same, which bookings fall outside a person's hours, and the
 * business's booking rules as sentences in rows, each with the choices it
 * saves on a pick (`ruleRows`). Hours, time off and extra hours save as
 * they are changed, so nothing here is a draft; a day's own rules are
 * `lib/staff/day-plan.ts`. Pure, so the screen and its tests agree.
 */

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
    /** The local day it is on, for "booked on Sat 24 Oct". */
    date?: LocalDate;
    /** Where "See it" goes: the booking, or its day on the calendar. */
    href?: string;
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
    const ranges = hours.filter((h) => h.dayOfWeek === day);
    return bookings.filter(
        (b) =>
            b.staffId === staffId &&
            b.weekday === day &&
            !ranges.some(
                (r) => b.start >= r.startMinute && b.start < r.endMinute,
            ),
    );
}

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
    | "gapMinutes"
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
                    : `Up to ${aheadLabel(rules.bookAheadDays)} ahead`,
            value: String(rules.bookAheadDays ?? ""),
            options: ahead.options,
        },
        {
            key: "latestBookingMinutes",
            label: "Booking late",
            title: latest.label,
            sentence:
                rules.latestBookingMinutes === null
                    ? "Up to the start time"
                    : `Up to ${latestLabel(rules.latestBookingMinutes)} the start`,
            value: String(rules.latestBookingMinutes ?? ""),
            options: latest.options,
        },
        // "Gap between bookings" (DEC-170, #1038), from an API that has it.
        ...(rules.gapMinutes === undefined ? [] : [gapRow(rules.gapMinutes)]),
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

/** "No gap needed", or "15 min between bookings". */
export function gapLabel(minutes: number): string {
    return minutes ? `${minutes} min between bookings` : "No gap needed";
}

function gapRow(minutes: number): RuleRow {
    return {
        key: "gapMinutes",
        label: "Gap between bookings",
        title: "Gap between bookings",
        sentence: gapLabel(minutes),
        value: String(minutes),
        options: withCurrent(
            [0, 10, 15, 30].map((n) => ({
                value: String(n),
                label: gapLabel(n),
            })),
            minutes,
            gapLabel,
        ),
    };
}

/** A sheet's choice as the one field of the rules it changes. */
export function rulePatch(key: RuleKey, value: string): Partial<BookingRules> {
    if (key === "gapMinutes") return { gapMinutes: Number(value) || 0 };
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
    if (key === "gapMinutes") return { gapMinutes: rules.gapMinutes ?? 0 };
    if (key === "refundInTimeCancels") {
        return { refundInTimeCancels: refundsInTime(rules) };
    }
    return { [key]: rules[key] };
}
