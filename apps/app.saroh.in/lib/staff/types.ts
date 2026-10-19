/**
 * The people who take bookings (U3), as the API sends them. Imports nothing
 * server-only, so the calendar and the Availability editor can use them;
 * `service.ts` does the fetching.
 */

/** One weekly range, in minutes from the business's local midnight. */
export interface WeeklyRange {
    /** 0 = Sunday … 6 = Saturday. */
    dayOfWeek: number;
    startMinute: number;
    endMinute: number;
}

/** Hours on one date on top of the weekly ones — a closed day opened. */
export interface ExtraHours {
    id: string;
    /** The local day, as the API sends it (a date at UTC midnight). */
    date: string;
    startMinute: number;
    endMinute: number;
}

/** Time off; `allDay` covers whole local days. The reason is team-only. */
export interface TimeOff {
    id: string;
    startAt: string;
    endAt: string;
    allDay: boolean;
    reason: string | null;
}

export interface StaffView {
    id: string;
    name: string;
    title: string | null;
    status: "ACTIVE" | "ARCHIVED";
    membership: {
        id: string;
        userId: string;
        name: string | null;
        email: string;
    } | null;
    serviceIds: string[];
    hours: WeeklyRange[];
    weeklyMinutes: number;
    extraHours: ExtraHours[];
    timeOff: TimeOff[];
    /**
     * On the diary with no login and past the plan's team limit (#800):
     * takes no new bookings; theirs are kept. Absent when not paused.
     */
    paused?: true;
    /**
     * Their own booking rules (DEC-170, #1038); a null is "same as the
     * business". Absent from an API older than them.
     */
    rules?: PersonRules;
}

/**
 * The whole business closed (E3): nobody can be booked, on any service. A
 * part-day range is one of these per day. The reason is team-only.
 */
export type Closure = TimeOff;

/** Staff, and the zone their hours are wall-clock times in. */
export interface StaffList {
    timezone: string;
    staff: StaffView[];
    /** Current and coming closures, soonest first. */
    closures: Closure[];
    /**
     * When the business is open, as weekly ranges in `timezone` (every
     * walk-in storefront's together), or null with none set. In-person
     * bookings fall inside them (DEC-087).
     */
    openingHours?: WeeklyRange[] | null;
}

/**
 * A range of the business's local days, all day or the same hours on each
 * day — what time off and a closure are added as (E3).
 */
export interface OffRangeInput {
    fromDate: string;
    toDate?: string;
    startMinute?: number;
    endMinute?: number;
}

/** The business's booking rules; null is no rule. */
export interface BookingRules {
    bookAheadDays: number | null;
    latestBookingMinutes: number | null;
    freeCancelHours: number | null;
    /**
     * The refund policy for a booking cancelled in time (E30, DEC-058):
     * refund what was paid online automatically. Absent from an API older
     * than it, which always refunded: read as on.
     */
    refundInTimeCancels?: boolean;
    /**
     * How people pay when they book on the booking page (DEC-088): online
     * only, at the desk only, or both. Absent from an API older than it:
     * both, which is what every business had.
     */
    bookingPayment?: BookingPayment;
    /**
     * "Gap between bookings" (DEC-170, #1038): minutes kept clear either
     * side of a person's bookings; 0 is no gap. Absent from an older API.
     */
    gapMinutes?: number;
    /**
     * "Members' rule changes need approval" (DEC-170, #1038): on for every
     * business unless an owner or admin turns it off.
     */
    memberRuleChangesNeedApproval?: boolean;
}

/**
 * A person's own booking rules (DEC-170, #1038): their timing rules, each
 * null when it is the same as the business's. Paying and refunds stay
 * business-wide.
 */
export interface PersonRules {
    bookAheadDays: number | null;
    latestBookingMinutes: number | null;
    freeCancelHours: number | null;
    gapMinutes: number | null;
}

/** Some of a person's rules: only the fields that change. */
export type RuleChanges = Partial<PersonRules>;

/** The timing rules a diary keeps, with nothing left to fall back to. */
export interface TimingRules {
    bookAheadDays: number | null;
    latestBookingMinutes: number | null;
    freeCancelHours: number | null;
    gapMinutes: number;
}

export type RuleRequestStatus =
    "WAITING" | "APPROVED" | "TURNED_DOWN" | "WITHDRAWN";

/** Someone a request names, as they are now. */
export interface RulePerson {
    userId: string;
    name: string | null;
}

/**
 * A request to change someone's own booking rules (#1038), from
 * `GET booking-rule-requests` and the request's moves.
 */
export interface RuleRequest {
    id: string;
    staffId: string;
    staffName: string;
    status: RuleRequestStatus;
    /** The asked values; a null is "same as the business". */
    changes: RuleChanges;
    /** The same, in words ("Booking late: up to 12 hours before the start"). */
    words: string[];
    /** Why it was turned down, when the owner said. */
    reason: string | null;
    requestedBy: RulePerson;
    createdAt: string;
    decidedAt: string | null;
    decidedBy: RulePerson | null;
}

/** `GET staff/:id/booking-rules`: one person's rules, and what you may do. */
export interface PersonRulesView {
    staffId: string;
    name: string;
    own: PersonRules;
    business: TimingRules;
    /** Theirs, else the business's, field by field. */
    effective: TimingRules;
    /** Whether you may change them at all. */
    canChange: boolean;
    /** Whether a change you make waits for an owner or admin. */
    needsApproval: boolean;
    /** The request waiting, or the last decided until its person says OK. */
    request: RuleRequest | null;
}

/**
 * `PUT staff/:id/booking-rules`: applied at once, or waiting
 * (`rules.request`). Undo of an applied change sends `previous` back.
 */
export interface PersonRulesSaved {
    applied: boolean;
    previous: PersonRules;
    rules: PersonRulesView;
}

/** How people pay when they book (DEC-088). */
export type BookingPayment = "ONLINE" | "DESK" | "BOTH";

/**
 * Why the booking page can't take money online now (DEC-088): Payments is
 * switched off, or no payment provider is connected that can take it.
 */
export type OnlineBlocker = "PLAN" | "PAYMENTS_OFF" | "NO_PROVIDER";

/**
 * `GET booking-rules/payment`: how people pay when they book, and why
 * online can't be taken now, if it can't — what the Service Editor and the
 * Services list read to say a service can't be booked online (#821).
 */
export interface BookingPaymentView {
    bookingPayment: BookingPayment;
    onlineBlocker: OnlineBlocker | null;
}

/** A kept booking the API reports after hours or time off change. */
export interface BookingBrief {
    id: string;
    startAt: string;
    endAt: string;
    serviceId: string;
    serviceName: string;
    bookerName: string | null;
}

/** A start a customer is offered on the booking page. */
export interface OfferedStart {
    startAt: string;
    endAt: string;
    staffId: string | null;
    staffName: string | null;
    /** A class's places left; null for a one-to-one. */
    placesLeft: number | null;
}

/** One local day of the booking page's two weeks. */
export interface OfferedDay {
    /** `YYYY-MM-DD` in the business's zone. */
    date: string;
    /** The hours alone would offer a start that day. */
    open: boolean;
    /** The business itself is closed that day. */
    closed: boolean;
    starts: OfferedStart[];
}

/**
 * The booking page's next two weeks for one service, as the public API
 * answers them (`GET public/services/:id/days`): the read the booking page
 * itself draws from, so the preview on Hours and time off can't disagree with it.
 */
export interface OfferedDays {
    timezone: string;
    kind: "one" | "class";
    days: OfferedDay[];
}

/**
 * The preview's read: the days, or why not. `off` is a service the booking
 * page doesn't offer now (hidden from it, paused, or bookings switched
 * off); `failed` is a read that didn't arrive.
 */
export type OfferedRead =
    { ok: true; data: OfferedDays } | { ok: false; why: "off" | "failed" };

/** "It's just me": who went on the diary, and the week they started with. */
export interface AddedSelf {
    staff: StaffView;
    /** Their week came from the opening hours, or the default week. */
    week: "opening" | "default";
}
