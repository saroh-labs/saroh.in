import { z } from "zod";

import type { BookingMeeting, CalendarBusy } from "@/lib/google-calendar/types";
import type { MomentView } from "@/lib/moments/keys";
import { defineRead } from "@/lib/query/define-read";
import type { DomainKey } from "@/lib/query/keys";
import { domainKey } from "@/lib/query/keys";
import type { KeptBooking } from "@/lib/services/availability-rules";
import type {
    BookingsCalendar,
    DiaryBooking,
} from "@/lib/services/booking-calendar";
import type { PageBooking } from "@/lib/services/booking-page";
import type { ClassWaitlistRow } from "@/lib/services/class-waitlist-words";
import type { LocalDate, ServiceHours } from "@/lib/services/diary";
import { addDays, monthDays, weekStartOf } from "@/lib/services/diary";
import type { PeekPerson } from "@/lib/services/peek";
import type { ShareLink } from "@/lib/sites/share-links";
import type {
    BookingRules,
    Closure,
    OnlineBlocker,
    PersonRulesView,
    RuleRequest,
    StaffView,
    WeeklyRange,
} from "@/lib/staff/types";
import type { DateRange } from "@/lib/views/date-range";
import { dateRangeAsk } from "@/lib/views/date-range";

/**
 * The bookings list's read (DEC-259). Client-safe: the key, the route and
 * how an address becomes the days read; the service is paired in
 * `access.ts`.
 */

/** Every bookings read of a business: what a save on the list invalidates. */
export const bookingsKeys = (orgId: string): DomainKey =>
    domainKey("bookings", orgId);

/** The list as the screen draws it. */
export interface BookingsList {
    /** Each booking, amounts left out for a role that may not see money. */
    bookings: DiaryBooking[];
    /** The business's zone: every time is read in it (Q10). */
    timezone: string;
    /** The server's now at the read, so the rows and their views agree. */
    now: number;
    /**
     * The business's first booking (wave G), said once: only the whole
     * register (no date asked) can say it is the first.
     */
    moment: MomentView | null;
    /**
     * No bookings at all yet: "Share your booking page" while it is live
     * (DEC-069, L8); null otherwise, or when the web address can't be read.
     */
    share: ShareLink | null;
}

const day = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional();

/** What the API is asked: a date preset, or the days (`dateRangeAsk`). */
export type BookingsAsk = ReturnType<typeof dateRangeAsk>;

/** The register (no date asked), or the bookings starting on those days. */
export const bookingsRead = defineRead<BookingsList>()({
    key: (orgId, ask) => domainKey("bookings", orgId, "list", ask),
    route: {
        path: "/api/bookings",
        params: {
            date: z.enum(["today", "yesterday", "7d", "month"]).optional(),
            from: day,
            to: day,
        },
    },
    tier: "live",
});

/**
 * The address's date filter as the read's params. An `undefined` field is
 * no param, and drops out of the key's hash too.
 */
export function bookingsAsk(dates: DateRange): BookingsAsk {
    return dateRangeAsk(dates);
}

/**
 * The diary (`/bookings`) as it draws a day, a week or the agenda: the
 * bookings over the day's week and month (the date sheet counts each day of
 * both), the people with their hours and time off, the services' own hours
 * when nobody is on the diary, and Google busy times for the week.
 */
export interface BookingsDiary {
    calendar: BookingsCalendar;
    /** Null when the staff read failed: no hours, so no free times. */
    staff: StaffView[] | null;
    serviceHours: ServiceHours | null;
    googleBusy: CalendarBusy | null;
    /** The business's zone the days were read in. */
    zone: string;
    /** The server's now at the read. */
    now: number;
}

/** The days the diary reads for `date`: its week and its month, and the week alone for Google. */
export function diaryAsk(date: LocalDate): DiaryAsk {
    const { days } = monthDays(date);
    const week = weekStartOf(date);
    const weekLast = addDays(week, 6);
    const monthFirst = days[0] ?? date;
    const monthLast = days.at(-1) ?? date;
    return {
        from: week < monthFirst ? week : monthFirst,
        to: weekLast > monthLast ? weekLast : monthLast,
        week,
    };
}

const localDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const diaryRead = defineRead<BookingsDiary>()({
    key: (orgId, ask) => domainKey("bookings", orgId, "diary", ask),
    route: {
        path: "/api/bookings/diary",
        params: { from: localDay, to: localDay, week: localDay },
    },
    tier: "live",
});

export interface DiaryAsk {
    from: LocalDate;
    to: LocalDate;
    week: LocalDate;
}

/**
 * Hours and time off (`/bookings/availability`, U25): everyone's week,
 * time off and extra hours, the business's closures and rules, and the
 * next three weeks' bookings only as far as the screen says which fall
 * outside the hours or on a day with extra hours. Under `bookings`, so a
 * save on the diary or the list marks it stale, and its own saves mark
 * the diary's free times stale with one invalidation.
 */
export interface AvailabilityView {
    staff: StaffView[];
    closures: Closure[];
    /** When the business is open, or null with no hours saved. */
    openingHours: WeeklyRange[] | null;
    timezone: string;
    today: LocalDate;
    /** The business's rules, or null when they couldn't be read. */
    rules: BookingRules | null;
    /** With nobody on the diary: the services' own hours together. */
    serviceHours: WeeklyRange[] | null;
    /** The services the booking page offers, for "What customers see". */
    services: { id: string; name: string }[];
    onlineBlocker: OnlineBlocker | null;
    /** This week's live bookings by person; null when unread. */
    kept: KeptBooking[] | null;
    /** Live bookings per `${staffId}|${date}`, three weeks; null when unread. */
    bookedOn: Record<string, number> | null;
    /** The rule requests waiting (owner or admin); null otherwise or unread. */
    requests: RuleRequest[] | null;
    /** A Member's own diary's rules and request; null otherwise. */
    mine: PersonRulesView | null;
}

/**
 * Records, not settings: time off and the bookings it counts change from
 * the diary and from customers; its own saves read it again at once.
 */
export const availabilityRead = defineRead<AvailabilityView>()({
    key: (orgId) => domainKey("bookings", orgId, "availability"),
    route: { path: "/api/bookings/availability", params: {} },
    tier: "records",
});

/** What a booking's page is asked: the booking, by its id in the path. */
export interface BookingAsk {
    bookingId: string;
}

/**
 * One booking as its page draws it (U26): the booking, and beside it what
 * the page shows from other reads, each failing on its own. A field left
 * out is a panel not drawn; `null` is a read that failed or wasn't asked.
 */
export interface BookingView {
    booking: PageBooking;
    /** The server's now at the read: past or to come, and the outcome ask. */
    now: number;
    /** Class packs (ADR-007): left out for a role that can't read packs. */
    packs?: {
        paidWith: { name: string } | null;
        usable: { id: string; label: string }[];
        canWrite: boolean;
    };
    /** A class still to come's waitlist (A12); null: the read failed. */
    waitlist?: ClassWaitlistRow[] | null;
    /** Their phone, Needs attention and reach (`contact:read`); else null. */
    person: PeekPerson | null;
    /** Who is on the diary, for New booking and Change who (`booking:write`). */
    staff: StaffView[] | null;
    /** Its Meet and Google event (DEC-233); null draws Join online. */
    meeting: BookingMeeting | null;
    /** Google Calendar is on here: New booking offers a Meet (`booking:write`). */
    meet?: boolean;
}

/** One booking's read: changes from outside (a reschedule, a payment). */
export const bookingRead = defineRead<BookingView>()({
    key: (orgId, { bookingId }) =>
        domainKey("bookings", orgId, "booking", bookingId),
    route: {
        path: "/api/bookings/[bookingId]",
        params: { bookingId: z.string().regex(/^[\w-]{1,64}$/) },
    },
    tier: "live",
});
