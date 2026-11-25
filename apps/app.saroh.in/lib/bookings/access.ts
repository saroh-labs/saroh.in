import "server-only";

import { takesOnlinePayment } from "@/lib/billing/access";
import { DEFAULT_BUSINESS_ZONE } from "@/lib/format/business-zone";
import { readCalendarBusy } from "@/lib/google-calendar/service";
import { onlinePayReady } from "@/lib/invoices/payments-on";
import { moduleAccess } from "@/lib/modules/guard";
import { bookingsListMoment } from "@/lib/moments/read";
import { permitsFor } from "@/lib/organizations/permits";
import type { Organization } from "@/lib/organizations/service";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import type { ServerRead } from "@/lib/query/route";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import { canReadBookings } from "@/lib/services/access";
import { withoutAmounts } from "@/lib/services/all-bookings";
import type { KeptBooking } from "@/lib/services/availability-rules";
import { canTakeDeskPayments } from "@/lib/services/booking-money";
import { readBookingsByDay } from "@/lib/services/bookings-by-day";
import { calendarHref } from "@/lib/services/calendar-href";
import {
    addDays,
    dayBounds,
    localDateOf,
    localMinuteOf,
    weekdayOf,
    whoFor,
} from "@/lib/services/diary";
import {
    flattenCalendar,
    listServices,
    readBookingsCalendar,
    readBookingsRegister,
    readNow,
} from "@/lib/services/service";
import { readServiceHours } from "@/lib/services/service-hours-read";
import { requireSession } from "@/lib/session";
import { BOOKINGS_FIRST_RUN, shareLink } from "@/lib/sites/share-links";
import { readWebAddressLinks } from "@/lib/sites/share-links-read";
import type { StaffList } from "@/lib/staff/service";
import {
    getBookingRules,
    listStaff,
    readBookingPayment,
    readPersonRules,
    readRuleRequests,
} from "@/lib/staff/service";
import { tidyWeek } from "@/lib/staff/starting-week";
import { withClosures } from "@/lib/staff/time-off";

import type {
    AvailabilityView,
    BookingsAsk,
    BookingsDiary,
    BookingsList,
    DiaryAsk,
} from "./queries";
import { availabilityRead, bookingsRead, diaryRead } from "./queries";

/**
 * Who reads what on the bookings list (DEC-259), asked by the page and by
 * the route alike, so the two can't differ.
 *
 * - The list: a role with `booking:read` while Bookings (APPOINTMENTS) is
 *   on, as the section's layout decides; anyone else gets a 403.
 * - Amounts (DEC-098): only for someone who may see money or take it at
 *   the desk ("Take ₹X" needs the sum); for anyone else they never leave
 *   the server.
 * - What the list offers to do: by permission, never the role's name.
 */

/** The section's gate, asked again for a read: the layout's two checks. */
export async function mayReadBookingsList(): Promise<boolean> {
    if (!canReadBookings(await activeOrganizationOnce())) return false;
    const access = await moduleAccess("APPOINTMENTS");
    return access.state === "available" || access.state === "unknown";
}

/** Whether this person is sent the amounts. */
export function seesAmounts(organization: Organization | null): boolean {
    return (
        permitsFor(organization)("payment:read") ||
        canTakeDeskPayments(organization)
    );
}

/** What the list offers to do, from the permissions the API resolved. */
export async function bookingsCan(organization: Organization | null) {
    const may = permitsFor(organization);
    const online = await onlinePayReady();
    return {
        book: may("booking:write"),
        // "Take ₹X" (P2): the pair a payment link needs.
        take: canTakeDeskPayments(organization),
        people: may("contact:read"),
        refund: may("payment:manage"),
        // Give anyone's booking to someone else from the quick look (#1157).
        assign: may("service:write"),
        readOrder: may("order:read"),
        // The Money column follows what the role may read (DEC-098): never
        // a Member or Reviewer by default.
        money: may("payment:read"),
        link: may("booking:write") && may("invoice:write") && online,
        online: takesOnlinePayment(await billingAccessOrNull()),
        /** The plan takes payment online, for New booking (U8). */
        onlinePay: online,
    };
}

/**
 * The list as the screen draws it: the register (no date asked) or the
 * days asked, flattened, without amounts for a role that may not see them.
 * Throws when it can't be read: the list says so, never "No bookings yet".
 */
export async function readBookingsList(
    ask: BookingsAsk,
): Promise<BookingsList> {
    const dated = [ask.date, ask.from, ask.to].some(Boolean);
    const [calendar, organization] = await Promise.all([
        dated ? readBookingsByDay(ask) : readBookingsRegister(),
        activeOrganizationOnce(),
    ]);
    if (!calendar) throw new Error("Bookings: the list couldn't be read");
    const every = flattenCalendar(calendar);
    const bookings = seesAmounts(organization) ? every : withoutAmounts(every);
    // The first booking and the first run's share, read only when they
    // can be said: the whole register, and no bookings at all.
    const [moment, share] = await Promise.all([
        dated ? null : bookingsListMoment(bookings, organization),
        !dated && every.length === 0
            ? readWebAddressLinks().then((links) =>
                  shareLink(links, BOOKINGS_FIRST_RUN),
              )
            : null,
    ]);
    return {
        bookings,
        timezone: calendar.timezone || DEFAULT_BUSINESS_ZONE,
        now: Date.now(),
        moment,
        share,
    };
}

export const bookingsServer: ServerRead<BookingsAsk, BookingsList> = {
    read: bookingsRead,
    service: readBookingsList,
};

/** The longest stretch the diary reads: a month and the weeks around it. */
const DIARY_MAX_DAYS = 45;

/**
 * The people, with the business's closures as everyone's time off (E3), so
 * the diary offers no free time while the business is closed. Null when
 * they can't be read: the bookings still show.
 */
async function readStaff(): Promise<StaffList | null> {
    try {
        const list = await listStaff();
        return list ? withClosures(list) : null;
    } catch {
        return null;
    }
}

/**
 * The diary's read (`/bookings`): what `diaryAsk` names, in the business's
 * zone. Null (a 404) for days the diary never asks; throws when the
 * bookings can't be read, since an empty diary would be a lie.
 */
export async function readBookingsDiary(
    ask: DiaryAsk,
): Promise<BookingsDiary | null> {
    const span = (Date.parse(ask.to) - Date.parse(ask.from)) / 86_400_000;
    if (!(span >= 0 && span <= DIARY_MAX_DAYS)) return null;
    if (ask.week < ask.from || addDays(ask.week, 6) > ask.to) return null;
    const [staffList, services] = await Promise.all([
        readStaff(),
        listServices(),
    ]);
    const zone = staffList?.timezone ?? DEFAULT_BUSINESS_ZONE;
    const [calendar, serviceHours, googleBusy] = await Promise.all([
        readBookingsCalendar(
            dayBounds(ask.from, zone).from.toISOString(),
            dayBounds(ask.to, zone).to.toISOString(),
        ),
        // With nobody on the diary, customers book each service in its own
        // hours: the diary draws them (UX-023).
        readServiceHours(services, staffList),
        // Start and end only, never a title; a failed read draws none.
        readCalendarBusy(
            dayBounds(ask.week, zone).from.toISOString(),
            dayBounds(addDays(ask.week, 7), zone).from.toISOString(),
        ),
    ]);
    if (!calendar) throw new Error("Bookings: the diary couldn't be read");
    return {
        calendar,
        staff: staffList?.staff ?? null,
        serviceHours,
        googleBusy,
        zone,
        now: readNow(),
    };
}

export const diaryServer: ServerRead<DiaryAsk, BookingsDiary> = {
    read: diaryRead,
    service: readBookingsDiary,
};

/**
 * Hours and time off's read (U25): what the page read before DEC-259, as
 * one answer. The staff failing throws (the screen says it couldn't load
 * everyone's hours); the bookings failing leaves `kept` and `bookedOn`
 * null (the hours still work, and say they couldn't check); the rules,
 * payment and requests failing each leave their part null.
 */
export async function readAvailability(): Promise<AvailabilityView> {
    const [organization, staffList, rules, services, payment] =
        await Promise.all([
            activeOrganizationOnce(),
            listStaff(),
            getBookingRules().catch(() => null),
            listServices(),
            readBookingPayment(),
        ]);
    if (!staffList) throw new Error("Hours: the staff couldn't be read");
    // An owner or admin reads the requests waiting; a Member their own
    // diary's rules (the session says which diary is theirs).
    // As the page asks it: by permission, by role on an older answer.
    const decides = organization?.actions
        ? organization.actions.includes("service:write")
        : organization?.role === "OWNER" || organization?.role === "ADMIN";
    const userId = decides ? null : (await requireSession()).user.id;
    const myDiary = userId
        ? staffList.staff.find(
              (p) => p.status === "ACTIVE" && p.membership?.userId === userId,
          )
        : undefined;
    const timezone = staffList.timezone;
    const today = localDateOf(new Date(readNow()), timezone);
    const [calendar, serviceHours, requests, mine] = await Promise.all([
        readBookingsCalendar(
            dayBounds(today, timezone).from.toISOString(),
            dayBounds(addDays(today, 21), timezone).to.toISOString(),
        ),
        // Only read while nobody is on the diary; null otherwise.
        readServiceHours(services, staffList),
        decides ? readRuleRequests() : null,
        myDiary ? readPersonRules(myDiary.id) : null,
    ]);
    return {
        // A teammate's sign-in email is never shown here: never sent.
        staff: staffList.staff.map((p) =>
            p.membership
                ? { ...p, membership: { ...p.membership, email: "" } }
                : p,
        ),
        closures: staffList.closures,
        openingHours: staffList.openingHours ?? null,
        timezone,
        today,
        rules,
        serviceHours: serviceHours ? tidyWeek(serviceHours.hours) : null,
        services: services
            .filter((s) => s.status === "ACTIVE" && s.showOnBookingPage)
            .map((s) => ({ id: s.id, name: s.name })),
        onlineBlocker: payment?.onlineBlocker ?? null,
        ...keptOf(calendar, timezone, today),
        requests,
        mine,
    };
}

/**
 * The live bookings with a person: this week's for "outside these hours",
 * and a count per person per day for extra hours. Null both when the
 * bookings couldn't be read.
 */
function keptOf(
    calendar: Awaited<ReturnType<typeof readBookingsCalendar>>,
    timezone: string,
    today: string,
): { kept: KeptBooking[] | null; bookedOn: Record<string, number> | null } {
    if (!calendar) return { kept: null, bookedOn: null };
    const weekEnd = addDays(today, 7);
    const kept: KeptBooking[] = [];
    const bookedOn: Record<string, number> = {};
    const count = (staffId: string, date: string) => {
        const key = `${staffId}|${date}`;
        bookedOn[key] = (bookedOn[key] ?? 0) + 1;
    };
    for (const diary of calendar.diaries) {
        if (!diary.person) continue;
        const staffId = diary.person.id;
        for (const b of diary.bookings) {
            if (b.status === "CANCELLED") continue;
            const date = localDateOf(b.startAt, timezone);
            count(staffId, date);
            if (date < weekEnd) {
                kept.push({
                    id: b.id,
                    staffId,
                    weekday: weekdayOf(date),
                    start: localMinuteOf(b.startAt, timezone),
                    who: whoFor(b),
                    date,
                    href: `/bookings/${b.id}`,
                });
            }
        }
        // A class is one thing on the day, however many are on it.
        for (const s of diary.classes) {
            if (s.bookings.every((b) => b.status === "CANCELLED")) continue;
            const date = localDateOf(s.startAt, timezone);
            count(staffId, date);
            if (date < weekEnd) {
                kept.push({
                    id: s.key,
                    staffId,
                    weekday: weekdayOf(date),
                    start: localMinuteOf(s.startAt, timezone),
                    who: s.service.name,
                    date,
                    href: calendarHref("day", date, { person: staffId }),
                });
            }
        }
    }
    return { kept, bookedOn };
}

export const availabilityServer: ServerRead<
    Record<string, never>,
    AvailabilityView
> = {
    read: availabilityRead,
    service: () => readAvailability(),
};
