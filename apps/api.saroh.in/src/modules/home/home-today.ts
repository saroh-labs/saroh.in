import type { prisma } from "@saroh/database";
import { DateTime } from "luxon";

import type { OrganizationContext } from "../../common/types/organization-context";
import { BookingEventType } from "../bookings/booking-event-type";
import { attentionFor } from "../customer-workspace/attention-read";
import {
    DEFAULT_LATE_THRESHOLDS,
    storedValuesOf,
    typeOf,
} from "../orders/fulfilment";
import type { LateThresholdColumns } from "../orders/late-thresholds";
import {
    LATE_THRESHOLD_SELECT,
    lateThresholdsOf,
} from "../orders/late-thresholds";
import { openOrderWhere } from "../orders/open-orders";
import type { HomeInput, HomeToday, HomeTodayItem } from "./home-model";
import { holds, personName } from "./home-model";
import { orderNumber } from "./home-order-rows";

/**
 * Home's Today column (round 2, F5): the business's day — its bookings, its
 * classes and its pick-ups — in time order, each with how it went.
 *
 * "Today" is the business's day in its own zone (DEC-033), not the server's
 * and not UTC's: a booking at 23:30 in Mumbai is today's even though UTC has
 * already turned the page. The whole day is sent; which rows show (the last
 * ninety minutes, then the next five) is the screen's, since it depends on
 * the minute the page is looked at (`lib/home/today.ts`).
 *
 * Arrived and No-show are the booking's own outcome (#241), written by the
 * existing `POST bookings/:id/outcome`. Home adds no write of its own.
 */

/** A day is never longer than this many rows on Home. */
export const TODAY_LIMIT = 60;

/** What this viewer's Today reads, or null when it reads nothing. */
export interface TodayScope {
    bookings: boolean;
    pickUps: boolean;
    canMark: boolean;
    flags: boolean;
}

/**
 * Which parts of Today this viewer gets. Each asks for its own read, so the
 * API leaves out what the caller may not see rather than the screen hiding
 * it: bookings with `booking:read`, pick-ups with `order:read` or
 * `order:stage`, and a person's attention labels only with `contact:read`
 * (`booking:read` is not `contact:read`).
 */
export function todayScope(
    input: HomeInput,
    available: ReadonlySet<string>,
): TodayScope | null {
    const bookings =
        available.has("APPOINTMENTS") && holds(input, "booking:read");
    const pickUps =
        available.has("COMMERCE") &&
        (holds(input, "order:read") || holds(input, "order:stage"));
    if (!bookings && !pickUps) return null;
    return {
        bookings,
        pickUps,
        canMark: bookings && holds(input, "booking:write"),
        flags: bookings && holds(input, "contact:read"),
    };
}

/** The business's day around `now`: its date, and where it starts and ends. */
export function businessDay(
    now: Date,
    zone: string,
): { date: string; start: Date; end: Date } {
    const day = DateTime.fromJSDate(now, { zone }).startOf("day");
    return {
        date: day.toISODate() ?? "",
        start: day.toJSDate(),
        end: day.plus({ days: 1 }).toJSDate(),
    };
}

/** "09:30" for an instant, in `zone`. */
export function clockIn(at: Date, zone: string): string {
    return DateTime.fromJSDate(at, { zone }).toFormat("HH:mm");
}

/** A booking of today, as `readToday` selects it. */
export interface TodayBookingRow {
    id: string;
    startAt: Date;
    outcome: string | null;
    paidWith: string | null;
    contactId: string | null;
    bookerName: string | null;
    bookerEmail: string | null;
    service: { id: string; name: string; capacity: number };
    staff: { name: string } | null;
    contact: {
        firstName: string | null;
        lastName: string | null;
        email: string | null;
    } | null;
    /** Outcome events, newest first. */
    events: { type: string; createdAt: Date }[];
}

/** An open pick-up order, as `readToday` selects it. */
export interface TodayOrderRow {
    id: string;
    orderId: string;
    storeId: string;
    createdAt: Date;
    stage: string;
    fulfilment: string;
    paymentStatus: string;
    customer: {
        firstName: string | null;
        lastName: string | null;
        email: string | null;
    } | null;
    /** Its storefront's late thresholds; absent reads the defaults. */
    store?: { settings: LateThresholdColumns | null } | null;
}

const OUTCOME_EVENT: Record<string, string> = {
    ATTENDED: BookingEventType.Attended,
    NO_SHOW: BookingEventType.NoShow,
};

/** The text trimmed, or null when there is none ("" included). */
function filled(text: string | null | undefined): string | null {
    const out = text?.trim() ?? "";
    return out.length > 0 ? out : null;
}

/** "With Priya", "With Priya · pays at the desk", "Pays at the desk", or null. */
function withWhom(staff: string | null, paysAtDesk: boolean): string | null {
    const parts = [staff ? `With ${staff}` : null];
    if (paysAtDesk) parts.push(staff ? "pays at the desk" : "Pays at the desk");
    const out = parts.filter((p): p is string => p !== null).join(" · ");
    return out.length > 0 ? out : null;
}

/** "Morning Yoga class", unless the service already says it is one. */
function className(name: string): string {
    return /\bclass(es)?\b/i.test(name) ? name : `${name} class`;
}

/**
 * Today's bookings as rows: a one-to-one booking is a row of its own, and
 * every place in one class is one row for the class ("8 of 16 booked"), as
 * the design draws Pulse's morning.
 */
export function bookingItems(
    rows: readonly TodayBookingRow[],
    view: {
        zone: string;
        canMark: boolean;
        flags: ReadonlyMap<string, string[]>;
    },
): HomeTodayItem[] {
    const items: HomeTodayItem[] = [];
    const classes = new Map<
        string,
        { row: TodayBookingRow; taken: number; index: number }
    >();

    for (const row of rows) {
        const staff = filled(row.staff?.name);
        if (row.service.capacity > 1) {
            const key = `class:${row.service.id}:${row.startAt.toISOString()}`;
            const seen = classes.get(key);
            if (seen) {
                seen.taken += 1;
                continue;
            }
            classes.set(key, { row, taken: 1, index: items.length });
            items.push({
                id: key,
                kind: "CLASS",
                startAt: row.startAt.toISOString(),
                time: clockIn(row.startAt, view.zone),
                what: className(row.service.name),
                who: null,
                person: null,
                outcome: null,
                outcomeTime: null,
                stage: null,
                flags: [],
                href: "/bookings",
                markable: false,
            });
            continue;
        }

        const who =
            (row.contact ? personName(row.contact) : null) ??
            filled(row.bookerName) ??
            filled(row.bookerEmail);
        const outcome =
            row.outcome === "ATTENDED" || row.outcome === "NO_SHOW"
                ? row.outcome
                : null;
        const said = outcome
            ? row.events.find((e) => e.type === OUTCOME_EVENT[outcome])
            : undefined;
        items.push({
            id: row.id,
            kind: "BOOKING",
            startAt: row.startAt.toISOString(),
            time: clockIn(row.startAt, view.zone),
            what: who ? `${row.service.name} · ${who}` : row.service.name,
            who: withWhom(staff, row.paidWith === "DESK"),
            person: who,
            outcome,
            outcomeTime: said ? clockIn(said.createdAt, view.zone) : null,
            stage: null,
            flags: row.contactId ? (view.flags.get(row.contactId) ?? []) : [],
            href: `/bookings/${row.id}`,
            markable: view.canMark,
        });
    }

    for (const { row, taken, index } of classes.values()) {
        const staff = filled(row.staff?.name);
        const booked = `${taken} of ${row.service.capacity} booked`;
        items[index] = {
            ...items[index],
            who: staff ? `With ${staff} · ${booked}` : booked,
        };
    }
    return items;
}

const STAGE_WORDS: Record<string, string> = {
    NEW: "Not started",
    PREPARING: "Being made",
    READY: "Ready",
};

/**
 * Minutes after placing a pick-up is due: the Pick-up threshold its
 * storefront sets (B17; DEC-045), the one its Late tag goes by.
 */
function readyAfter(row: TodayOrderRow): number {
    return lateThresholdsOf(row.store?.settings).PICKUP;
}

/**
 * Open pick-ups due today, each at the time it should be ready: placed, plus
 * its storefront's Pick-up threshold (the one the Orders list's Late filter
 * reads). No late tag: that is the order's own
 * `late`, and Home never works lateness out for itself.
 */
export function pickUpItems(
    rows: readonly TodayOrderRow[],
    day: { start: Date; end: Date },
    zone: string,
): HomeTodayItem[] {
    const items: HomeTodayItem[] = [];
    for (const row of rows) {
        // A row without its type (an old fixture) is no pick-up.
        if (!row.fulfilment || typeOf(row.fulfilment) !== "PICKUP") continue;
        if (row.paymentStatus === "REFUNDED") continue;
        const due = new Date(
            row.createdAt.getTime() + readyAfter(row) * 60_000,
        );
        if (due < day.start || due >= day.end) continue;
        const who = row.customer ? personName(row.customer) : null;
        const stage = STAGE_WORDS[row.stage];
        items.push({
            id: row.id,
            kind: "PICKUP",
            startAt: due.toISOString(),
            time: clockIn(due, zone),
            what: who ? `Pick-up · ${who}` : "Pick-up",
            who: [`Order ${orderNumber(row.orderId)}`, stage]
                .filter(Boolean)
                .join(" · "),
            person: null,
            outcome: null,
            outcomeTime: null,
            stage: row.stage,
            flags: [],
            href: `/commerce/orders/${row.id}?storefront=${row.storeId}`,
            markable: false,
        });
    }
    return items;
}

/** In time order; a tie keeps bookings before pick-ups, then by id. */
function byTime(a: HomeTodayItem, b: HomeTodayItem): number {
    return (
        a.startAt.localeCompare(b.startAt) ||
        a.kind.localeCompare(b.kind) ||
        a.id.localeCompare(b.id)
    );
}

/**
 * The labels of each person's Needs attention entries this viewer may read
 * (C1's `attentionFor`, which alone decides what a sensitive entry shows).
 */
async function flagsFor(
    db: typeof prisma,
    input: HomeInput,
    contactIds: string[],
): Promise<Map<string, string[]>> {
    if (contactIds.length === 0) return new Map();
    // `attentionFor` reads only the business and what the viewer may do.
    const ctx: OrganizationContext = {
        organizationId: input.organizationId,
        userId: "",
        role: input.organizationRole,
        actions: input.organizationActions,
    };
    const reads = await attentionFor(ctx, contactIds, db);
    return new Map(
        [...reads].map(([id, read]) => [id, read.entries.map((e) => e.label)]),
    );
}

/**
 * The open pick-ups that could be due today: placed no earlier than the
 * longest Pick-up wait any of the business's storefronts sets (B17) before
 * the day starts. `pickUpItems` keeps the ones due today.
 */
async function pickUpRows(
    db: typeof prisma,
    organizationId: string,
    day: { start: Date; end: Date },
): Promise<TodayOrderRow[]> {
    const longest = await db.storeSettings.aggregate({
        where: { store: { organizationId } },
        _max: { pickupLateAfterMinutes: true },
    });
    const wait = Math.max(
        DEFAULT_LATE_THRESHOLDS.PICKUP,
        longest._max.pickupLateAfterMinutes ?? 0,
    );
    return db.order.findMany({
        where: {
            // Open as the Orders list's Open tab reads it: never refunded,
            // never an abandoned online checkout.
            ...openOrderWhere(organizationId),
            stage: { in: ["NEW", "PREPARING", "READY"] },
            fulfilment: { in: storedValuesOf(["PICKUP"]) },
            createdAt: {
                gte: new Date(day.start.getTime() - wait * 60_000),
                lt: day.end,
            },
        },
        orderBy: { createdAt: "asc" },
        take: TODAY_LIMIT * 2,
        select: {
            id: true,
            orderId: true,
            storeId: true,
            createdAt: true,
            stage: true,
            fulfilment: true,
            paymentStatus: true,
            customer: {
                select: { firstName: true, lastName: true, email: true },
            },
            store: { select: { settings: { select: LATE_THRESHOLD_SELECT } } },
        },
    });
}

/** Read today for one business. Throws on a failed read; Home names it. */
export async function readToday(
    db: typeof prisma,
    input: HomeInput,
    scope: TodayScope,
    at: { now: Date; zone: string },
): Promise<HomeToday> {
    const day = businessDay(at.now, at.zone);
    const [bookingRows, orderRows] = await Promise.all([
        scope.bookings
            ? (db.booking.findMany({
                  where: {
                      organizationId: input.organizationId,
                      // Standing bookings only: a cancelled one isn't coming,
                      // and an unpaid hold isn't a booking yet.
                      status: "CONFIRMED",
                      startAt: { gte: day.start, lt: day.end },
                  },
                  orderBy: [{ startAt: "asc" }, { id: "asc" }],
                  take: TODAY_LIMIT * 4,
                  select: {
                      id: true,
                      startAt: true,
                      outcome: true,
                      paidWith: true,
                      contactId: true,
                      bookerName: true,
                      bookerEmail: true,
                      service: {
                          select: { id: true, name: true, capacity: true },
                      },
                      staff: { select: { name: true } },
                      contact: {
                          select: {
                              firstName: true,
                              lastName: true,
                              email: true,
                          },
                      },
                      events: {
                          where: {
                              type: {
                                  in: [
                                      BookingEventType.Attended,
                                      BookingEventType.NoShow,
                                  ],
                              },
                          },
                          orderBy: { createdAt: "desc" },
                          select: { type: true, createdAt: true },
                      },
                  },
              }) as Promise<TodayBookingRow[]>)
            : Promise.resolve([] as TodayBookingRow[]),
        scope.pickUps
            ? pickUpRows(db, input.organizationId, day)
            : Promise.resolve([] as TodayOrderRow[]),
    ]);

    const contactIds = scope.flags
        ? [
              ...new Set(
                  bookingRows
                      .filter((r) => r.service.capacity <= 1)
                      .map((r) => r.contactId)
                      .filter((id): id is string => id !== null),
              ),
          ]
        : [];
    const flags = await flagsFor(db, input, contactIds);

    const items = [
        ...bookingItems(bookingRows, {
            zone: at.zone,
            canMark: scope.canMark,
            flags,
        }),
        ...pickUpItems(orderRows, day, at.zone),
    ]
        .sort(byTime)
        .slice(0, TODAY_LIMIT);

    return {
        zone: at.zone,
        date: day.date,
        bookings: scope.bookings,
        items,
    };
}
