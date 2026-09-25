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
}

/** Staff, and the zone their hours are wall-clock times in. */
export interface StaffList {
    timezone: string;
    staff: StaffView[];
}

/** The business's booking rules; null is no rule. */
export interface BookingRules {
    bookAheadDays: number | null;
    latestBookingMinutes: number | null;
    freeCancelHours: number | null;
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
