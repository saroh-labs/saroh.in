import "server-only";

import { orderPowers } from "@/lib/orders/access";
import { permitsFor } from "@/lib/organizations/permits";
import type { Organization } from "@/lib/organizations/service";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import type { ServerRead } from "@/lib/query/route";

import type { CalendarSpan } from "./queries";
import { calendarRead } from "./queries";
import { calendarLocked } from "./range";
import type { CalendarRead } from "./service";
import { readCalendar } from "./service";
import type { CalendarItem, CalendarMonth } from "./types";

/**
 * Who reads what on the Business Calendar (DEC-259), asked by the page and
 * by the route alike, so the two can't differ.
 *
 * - The calendar: anyone whose role reads one of its layers (orders,
 *   bookings, subscriptions, invoices); a role that reads none, a calendar
 *   that is locked (E20), gets a 403. The API sends each viewer only the
 *   layers, items and money their permissions allow (a calendar-only role
 *   its bookings, `payment:read` the amounts), so the route adds no more.
 * - What the calendar offers to do: by permission, never the role's name.
 */

/** Whether this person's calendar is locked: their role reads no layer. */
export function lockedFor(organization: Organization | null): boolean {
    return calendarLocked(organization?.actions);
}

/** The route's gate: the page's, asked again for this request. */
export async function mayReadCalendar(): Promise<boolean> {
    return !lockedFor(await activeOrganizationOnce());
}

/** What the calendar offers to do, from the permissions the API resolved. */
export function calendarCan(organization: Organization | null) {
    const may = permitsFor(organization);
    return {
        // New order: `order:create` (B16).
        order: orderPowers(organization).create,
        book: may("booking:write"),
        // A named problem's fix (E22): offered only to whoever may make it.
        remind: may("invoice:write"),
        retry: may("subscription:write"),
        // Any amount at all (DEC-098): the permission, never the role.
        money: may("payment:read"),
        // "Open hours on this day" on a closed day (bookings U14).
        hours: may("hours:write"),
    };
}

/** An item without what no part of the calendar draws. */
function shownItem({ outWhy: _, ...item }: CalendarItem): CalendarItem {
    return item;
}

/**
 * The days as the screen draws them: the API's answer without what the
 * calendar doesn't show (the month's ranked to-act-on list, the read's
 * instants, where the zone came from, why money went out), so the browser
 * isn't sent them.
 */
export function shownCalendar(month: CalendarMonth): CalendarMonth {
    const {
        toActOn: _toActOn,
        from: _from,
        to: _to,
        timezoneSource: _source,
        ...shown
    } = month;
    return {
        ...shown,
        days: month.days.map((d) => ({
            ...d,
            layers: Object.fromEntries(
                Object.entries(d.layers).map(([key, layer]) => [
                    key,
                    { ...layer, items: layer.items.map(shownItem) },
                ]),
            ),
        })),
    };
}

/** A month or a week, as the calendar draws it. */
export async function readCalendarScreen(
    span: CalendarSpan,
): Promise<CalendarRead | null> {
    const read = await readCalendar(span.from, span.to);
    return read?.kind === "month"
        ? { kind: "month", data: shownCalendar(read.data) }
        : read;
}

export const calendarServer: ServerRead<CalendarSpan, CalendarRead> = {
    read: calendarRead,
    service: readCalendarScreen,
};
