import "server-only";

import { cache } from "react";

import { takesOnlinePayment } from "@/lib/billing/access";
import { canReadPacks, canUsePacksOnBookings } from "@/lib/class-packs/access";
import { packOffer, usablePacks } from "@/lib/class-packs/balance";
import { readPurchasesFor } from "@/lib/class-packs/service";
import { packsOn } from "@/lib/class-packs/switched-on";
import { DEFAULT_BUSINESS_ZONE } from "@/lib/format/business-zone";
import {
    googleMeetOffered,
    readBookingMeeting,
    readCalendarBusy,
} from "@/lib/google-calendar/service";
import { onlinePayReady } from "@/lib/invoices/payments-on";
import { moduleAccess, modulesOrUnknown } from "@/lib/modules/guard";
import { bookingsListMoment } from "@/lib/moments/read";
import { permitsFor } from "@/lib/organizations/permits";
import type { Organization } from "@/lib/organizations/service";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import type { ServerRead } from "@/lib/query/route";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import { canReadBookings } from "@/lib/services/access";
import { withoutAmounts } from "@/lib/services/all-bookings";
import { canTakeDeskPayments } from "@/lib/services/booking-money";
import type { PageBooking } from "@/lib/services/booking-page";
import { readBookingPage } from "@/lib/services/booking-page-read";
import { hasEnded } from "@/lib/services/booking-state";
import { readBookingsByDay } from "@/lib/services/bookings-by-day";
import { readClassWaitlist } from "@/lib/services/class-waitlist";
import { addDays, dayBounds } from "@/lib/services/diary";
import { readPeekPerson } from "@/lib/services/peek-person";
import {
    flattenCalendar,
    listServices,
    readBookingsCalendar,
    readBookingsRegister,
    readNow,
} from "@/lib/services/service";
import { readServiceHours } from "@/lib/services/service-hours-read";
import { BOOKINGS_FIRST_RUN, shareLink } from "@/lib/sites/share-links";
import { readWebAddressLinks } from "@/lib/sites/share-links-read";
import type { StaffList } from "@/lib/staff/service";
import { listStaff } from "@/lib/staff/service";
import { withClosures } from "@/lib/staff/time-off";

import type {
    BookingAsk,
    BookingView,
    BookingsAsk,
    BookingsDiary,
    BookingsList,
    DiaryAsk,
} from "./queries";
import { bookingRead, bookingsRead, diaryRead } from "./queries";

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
 * One read of a booking per render: the tab's title, the page's 404 and
 * the route share it. Null: missing, another business's, or one a
 * calendar-only person may not open (the API answers 404 for all three).
 */
export const readBookingOnce = cache((bookingId: string) =>
    readBookingPage(bookingId),
);

/**
 * A booking's page as it draws it (U26): the booking, and beside it its
 * class packs, a class's waitlist, the person, who is on the diary and its
 * Meet, each read on its own so one failing costs only its panel. Null (a
 * 404): not this business's, or not there.
 */
export async function readBookingView({
    bookingId,
}: BookingAsk): Promise<BookingView | null> {
    const [booking, organization] = await Promise.all([
        readBookingOnce(bookingId),
        activeOrganizationOnce(),
    ]);
    if (!booking) return null;
    const may = permitsFor(organization);
    const canWrite = may("booking:write");
    const now = readNow();
    // Its Meet (DEC-233): asked while Google Calendar is on here, or when
    // the booking or its service already has a Google Meet.
    const hasMeet =
        (booking as { meetingLink?: string | null }).meetingLink ===
            "GOOGLE_MEET" ||
        (booking.service as { meetingLink?: string }).meetingLink ===
            "GOOGLE_MEET";
    // Google Calendar on here: its Meet is read, and New booking offers one.
    const offered = hasMeet && !canWrite ? false : await googleMeetOffered();
    const [packs, waitlist, person, staff, meeting] = await Promise.all([
        packsFor(booking, organization),
        // A class still to come: its line (A12).
        booking.service.capacity <= 1 || hasEnded(booking, now)
            ? undefined
            : readClassWaitlist(booking.serviceId, booking.startAt),
        booking.contact && may("contact:read")
            ? readPeekPerson(booking.contact.id)
            : null,
        // New booking's people, and the viewer's place on the diary for
        // Change who (#1157): only for someone who may book.
        canWrite
            ? listStaff()
                  .then((list) => list?.staff ?? null)
                  .catch(() => null)
            : null,
        hasMeet || offered ? readBookingMeeting(bookingId) : null,
    ]);
    return {
        booking: withoutKey(booking),
        now,
        packs,
        waitlist,
        person,
        staff,
        meeting,
        ...(canWrite ? { meet: offered } : {}),
    };
}

/** The create's idempotency key is the API's, never the page's. */
function withoutKey(booking: PageBooking): PageBooking {
    const shown: PageBooking & { idempotencyKey?: unknown } = { ...booking };
    delete shown.idempotencyKey;
    return shown;
}

/**
 * What the booking says about class packs (ADR-007): the pack paying for
 * it, and, when none is, it is still on, and this person may spend packs,
 * the booker's packs that cover this session. A failed read offers
 * nothing rather than failing the booking. With Class packs switched off
 * (E12) it still says which pack paid, and offers nothing to spend.
 */
async function packsFor(
    booking: PageBooking,
    organization: Organization | null,
): Promise<BookingView["packs"]> {
    if (!canReadPacks(organization)) return undefined;
    const canWrite =
        canUsePacksOnBookings(organization) &&
        packsOn(await modulesOrUnknown());
    const live = booking.packRedemption?.reversedAt
        ? null
        : (booking.packRedemption?.purchase ?? null);
    const paidWith = live ? { name: live.pack.name } : null;
    if (
        paidWith ||
        !canWrite ||
        booking.status !== "CONFIRMED" ||
        !booking.contact
    ) {
        return { paidWith, usable: [], canWrite };
    }
    const held = await readPurchasesFor(booking.contact.id, booking.serviceId);
    return {
        paidWith,
        usable: usablePacks(held ?? [], booking.startAt).map((p) => ({
            id: p.id,
            label: packOffer(p, booking.timezone),
        })),
        canWrite,
    };
}

export const bookingServer: ServerRead<BookingAsk, BookingView> = {
    read: bookingRead,
    service: readBookingView,
};
