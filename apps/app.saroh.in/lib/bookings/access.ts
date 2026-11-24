import "server-only";

import { takesOnlinePayment } from "@/lib/billing/access";
import { DEFAULT_BUSINESS_ZONE } from "@/lib/format/business-zone";
import { onlinePayReady } from "@/lib/invoices/payments-on";
import { moduleAccess } from "@/lib/modules/guard";
import { permitsFor } from "@/lib/organizations/permits";
import type { Organization } from "@/lib/organizations/service";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import type { ServerRead } from "@/lib/query/route";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import { canReadBookings } from "@/lib/services/access";
import { withoutAmounts } from "@/lib/services/all-bookings";
import { canTakeDeskPayments } from "@/lib/services/booking-money";
import { readBookingsByDay } from "@/lib/services/bookings-by-day";
import { flattenCalendar, readBookingsRegister } from "@/lib/services/service";

import type { BookingsAsk, BookingsList } from "./queries";
import { bookingsRead } from "./queries";

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
    const [calendar, organization] = await Promise.all([
        ask.date || ask.from || ask.to
            ? readBookingsByDay(ask)
            : readBookingsRegister(),
        activeOrganizationOnce(),
    ]);
    if (!calendar) throw new Error("Bookings: the list couldn't be read");
    const every = flattenCalendar(calendar);
    return {
        bookings: seesAmounts(organization) ? every : withoutAmounts(every),
        timezone: calendar.timezone || DEFAULT_BUSINESS_ZONE,
        now: Date.now(),
    };
}

export const bookingsServer: ServerRead<BookingsAsk, BookingsList> = {
    read: bookingsRead,
    service: readBookingsList,
};
