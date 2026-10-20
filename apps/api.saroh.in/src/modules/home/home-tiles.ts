import { DateTime } from "luxon";

import type {
    HomeBooking,
    HomeTileBookings,
    HomeTileCame,
    HomeTileMoneyIn,
    HomeTileNext,
    HomeTiles,
    HomeTileToPack,
    HomeToday,
    HomeTodayItem,
} from "./home-model";
import type { OpenOrders } from "./home-open-orders";

/**
 * Home A's tiles (DEC-171; the phone's three figures pick from them, A1):
 * Bookings today, To pack or hand over, Money in today and Came. Pure,
 * built from what the sources already read — Today's rows, the schedule's
 * next booking, the open orders' counts and the money read — so a tile and
 * the part it summarises can't disagree. A tile whose read failed is
 * absent, never zero; `unavailable` already names the part.
 */

/** Where each tile opens (A1: unfiltered where the screen has no filter). */
export const TILE_PATHS = {
    BOOKINGS: "/calendar",
    TO_PACK: "/commerce/orders",
    CAME: "/bookings",
} as const;

function nextOf(item: HomeTodayItem, zone: string): HomeTileNext {
    return {
        startAt: item.startAt,
        date: DateTime.fromISO(item.startAt, { zone }).toISODate() ?? "",
        time: item.time,
        what: item.what,
    };
}

function nextBooking(booking: HomeBooking, zone: string): HomeTileNext {
    const at = DateTime.fromISO(booking.startAt, { zone });
    return {
        startAt: booking.startAt,
        date: at.toISODate() ?? "",
        time: at.toFormat("HH:mm"),
        what: booking.who
            ? `${booking.serviceName} · ${booking.who}`
            : booking.serviceName,
    };
}

/**
 * Bookings today: the day's bookings and classes, and the next one from
 * now — today's, else the schedule's next (so a quiet day still names
 * "Next: Wed 10:00").
 */
export function bookingsTile(
    today: HomeToday,
    upcoming: readonly HomeBooking[],
    now: Date,
): HomeTileBookings {
    const booked = today.items.filter((i) => i.kind !== "PICKUP");
    const ahead = booked.filter((i) => new Date(i.startAt) > now);
    const later = upcoming.find((b) => new Date(b.startAt) > now);
    return {
        count: booked.length,
        next:
            ahead.length > 0
                ? nextOf(ahead[0], today.zone)
                : later
                  ? nextBooking(later, today.zone)
                  : null,
        laterToday: Math.max(0, ahead.length - 1),
        href: TILE_PATHS.BOOKINGS,
    };
}

/**
 * Came: today's one-to-one bookings marked Came, of those started by now,
 * and the next one nobody has marked. Absent on a day with none (a class
 * is marked person by person on its own page, not here).
 */
export function cameTile(today: HomeToday, now: Date): HomeTileCame | null {
    const ones = today.items.filter((i) => i.kind === "BOOKING");
    if (ones.length === 0) return null;
    const next = ones.find(
        (i) => i.outcome === null && new Date(i.startAt) >= now,
    );
    return {
        came: ones.filter((i) => i.outcome === "ATTENDED").length,
        due: ones.filter((i) => new Date(i.startAt) <= now).length,
        total: ones.length,
        next: next
            ? { time: next.time, person: next.person, startAt: next.startAt }
            : null,
        href: TILE_PATHS.CAME,
    };
}

/** To pack or hand over: Needs you's orders, due today, late, on its way. */
export function toPackTile(open: OpenOrders): HomeTileToPack {
    return {
        count: open.count,
        dueToday: open.dueToday ?? 0,
        late: open.late ?? 0,
        inProgress: open.later,
        href: TILE_PATHS.TO_PACK,
    };
}

/** What `buildTiles` reads; null for a part not read or that failed. */
export interface TileParts {
    now: Date;
    today: HomeToday | null;
    upcoming: readonly HomeBooking[];
    /** Open orders, when read and the read worked. */
    open: OpenOrders | null;
    moneyIn: HomeTileMoneyIn | null;
}

export function buildTiles(parts: TileParts): HomeTiles {
    const tiles: HomeTiles = {};
    const today = parts.today;
    if (today?.bookings) {
        tiles.bookingsToday = bookingsTile(today, parts.upcoming, parts.now);
        const came = cameTile(today, parts.now);
        if (came) tiles.came = came;
    }
    if (parts.open) tiles.toPack = toPackTile(parts.open);
    if (parts.moneyIn) tiles.moneyIn = parts.moneyIn;
    return tiles;
}
