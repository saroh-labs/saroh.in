import type { BookingOutcome, BookingStatus } from "./booking-state";
import type { DeskTake } from "./desk-pay";

/**
 * The bookings calendar read (U4), as the API sends it, and the pure shaping
 * the screens do with it. Imports nothing server-only, so client components
 * and tests can use it; `service.ts` does the fetching.
 */

/**
 * A visit of a treatment (E10, DEC-050): which visit of how many, the order
 * it belongs to, and the visit staff can book next — null once every visit
 * is booked or the order was cancelled or refunded.
 */
export interface TreatmentView {
    orderId: string;
    /** The order's number: "ORD-004". */
    orderNumber: string;
    visitNumber: number;
    visits: number;
    booked: number;
    nextVisit: number | null;
    closed: boolean;
}

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
    /** A visit of a treatment (E10); absent from an older API. */
    treatment?: TreatmentView | null;
    /**
     * Paid at the desk (P2), and how the last of it was taken: CASH, UPI,
     * CARD… Not a money figure. Absent from an API before P2.
     */
    paidAtDesk?: { method: string | null } | null;
    /**
     * What "Take ₹X" takes now (P2); null when there's nothing to take.
     * Only for a viewer who may read money.
     */
    take?: DeskTake | null;
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

/**
 * Whether the business runs classes (E5): a service with more than one place,
 * or a class on the calendar (one whose service has since changed). The
 * legend shows Class only then, and otherwise calls a one-to-one an
 * appointment — there is nothing to tell it apart from.
 */
export function runsClasses(
    services: readonly { capacity: number }[],
    calendar: Pick<BookingsCalendar, "diaries">,
): boolean {
    return (
        services.some((s) => s.capacity > 1) ||
        calendar.diaries.some((d) => d.classes.length > 0)
    );
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
