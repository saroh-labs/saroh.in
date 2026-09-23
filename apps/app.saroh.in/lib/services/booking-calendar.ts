import type { BookingOutcome, BookingStatus } from "./booking-state";

/**
 * The bookings calendar read (U4), as the API sends it, and the pure shaping
 * the screens do with it. Imports nothing server-only, so client components
 * and tests can use it; `service.ts` does the fetching.
 */

/** How a booking was paid (U3); null when nobody said (older bookings). */
export type PaidWith = "MEMBERSHIP" | "PACK" | "PAID" | "DESK";

/** A booking as the calendar read carries it. */
export interface DiaryBooking {
    id: string;
    serviceId: string;
    /** Absolute-UTC ISO instants. */
    startAt: string;
    endAt: string;
    /** IANA timezone the booker saw the slot in. */
    timezone: string;
    status: BookingStatus;
    outcome: BookingOutcome | null;
    bookerName: string | null;
    bookerEmail: string | null;
    bookerPhone: string | null;
    createdAt: string;
    cancelledAt: string | null;
    cancelledLate: boolean;
    service: {
        id: string;
        name: string;
        timezone: string;
        capacity: number;
        durationMinutes: number;
        /** Only for a viewer who may read money (DEC-020). */
        priceCents?: number | null;
        currency?: string | null;
    };
    contact: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        email: string;
    } | null;
    staff: { id: string; name: string } | null;
    paidWith: PaidWith | null;
    /** The pack paying for it, while its class is still spent on it. */
    packName: string | null;
    subscriptionId: string | null;
}

/** One start of a class: places, who holds them and how each paid. */
export interface ClassSession {
    key: string;
    service: DiaryBooking["service"];
    startAt: string;
    endAt: string;
    staff: { id: string; name: string } | null;
    capacity: number;
    /** Places held: every booking on it that is not cancelled. */
    taken: number;
    /** Everyone on it, cancelled included. */
    bookings: DiaryBooking[];
}

/** One person's diary; `person` null is Unassigned (bookings before staff). */
export interface PersonDiary {
    person: { id: string; name: string; title: string | null } | null;
    bookings: DiaryBooking[];
    classes: ClassSession[];
}

/** The bookings calendar over a range. */
export interface BookingsCalendar {
    from: string;
    to: string;
    /** The business's zone. */
    timezone: string;
    /** Whether prices were included for this viewer. */
    money: boolean;
    diaries: PersonDiary[];
}

/** Every booking in a calendar read, flat and by slot — the register's rows. */
export function flattenCalendar(calendar: BookingsCalendar): DiaryBooking[] {
    return calendar.diaries
        .flatMap((diary) => [
            ...diary.bookings,
            ...diary.classes.flatMap((session) => session.bookings),
        ])
        .sort(
            (a, b) =>
                a.startAt.localeCompare(b.startAt) ||
                a.createdAt.localeCompare(b.createdAt),
        );
}
