import type { Logger } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { BookingEventType } from "../bookings/booking-event-type";

/*
 * A treatment's visits as Order Detail's Visits card reads them (B14, R16,
 * DEC-050): each visit's number, when, with whom, in person or a video call,
 * and how it stands — and what the header offers next. The API decides; the
 * app draws.
 *
 * - A visit is a booking of the order (E9's `Booking.orderId`,
 *   `visitNumber`); a cancelled booking leaves its visit to book again.
 * - "Mark visit N attended" is offered for the first booked visit once it
 *   has started (DESIGN-NOTES: "only once it has started"), and "Book
 *   visit N" when no booked visit waits and one is still to book.
 * - A cancelled or refunded order books no more visits and marks none.
 */

/** How one visit stands: the design's Attended, Booked, Missed, Not booked. */
export type VisitState = "ATTENDED" | "BOOKED" | "MISSED" | "TO_BOOK";

export interface OrderVisitDto {
    /** 1, 2, 3… */
    number: number;
    /** The visit's booking; null while it is still to book. */
    bookingId: string | null;
    startAt: Date | null;
    endAt: Date | null;
    /** Who takes it, by name; null when nobody is set or it isn't booked. */
    staffName: string | null;
    /** In person or a video call, as it was booked (else as the service is). */
    where: "IN_PERSON" | "ONLINE";
    state: VisitState;
    /** When it was marked attended, and by whom (the timeline's line). */
    attendedAt: Date | null;
    attendedBy: { id: string; name: string | null } | null;
}

export interface OrderVisitsDto {
    /** How many visits the treatment is. */
    total: number;
    attended: number;
    /** Visits booked now (attended, booked or missed), cancelled left out. */
    booked: number;
    /** The service the treatment is, for "Book visit N". */
    service: {
        id: string;
        name: string;
        durationMinutes: number;
        /** The clinic's zone, which the visits' times are read in. */
        timezone: string;
        priceCents: number | null;
    };
    visits: OrderVisitDto[];
    next: {
        /** The visit that can be marked attended now. */
        attend: number | null;
        /** The next booked visit, not started yet: "You can mark it … once it starts." */
        upcoming: { number: number; startAt: Date } | null;
        /** The visit to book next, when no booked visit waits. */
        book: number | null;
    };
    /** Every visit attended: the order is fulfilled. */
    done: boolean;
    /** The order was cancelled or refunded: nothing more is booked or marked. */
    closed: boolean;
}

/** What the read loads of an order's treatment. */
export const ORDER_VISITS_SELECT = {
    status: true,
    paymentStatus: true,
    items: {
        where: { serviceId: { not: null } },
        select: {
            service: {
                select: {
                    id: true,
                    name: true,
                    visits: true,
                    durationMinutes: true,
                    timezone: true,
                    priceCents: true,
                    locationType: true,
                },
            },
        },
    },
    bookings: {
        where: { status: { not: "CANCELLED" } },
        orderBy: [{ visitNumber: "asc" }, { createdAt: "asc" }],
        select: {
            id: true,
            visitNumber: true,
            startAt: true,
            endAt: true,
            outcome: true,
            locationType: true,
            staff: { select: { name: true } },
            events: {
                where: { type: BookingEventType.Attended },
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { createdAt: true, actorUserId: true },
            },
        },
    },
} satisfies Prisma.OrderSelect;

export type RawOrderVisits = Prisma.OrderGetPayload<{
    select: typeof ORDER_VISITS_SELECT;
}>;

const whereOf = (
    booking: string | null | undefined,
    service: string,
): "IN_PERSON" | "ONLINE" =>
    (booking ?? service) === "ONLINE" ? "ONLINE" : "IN_PERSON";

/**
 * The Visits card's read, pure: null for an order that isn't a treatment.
 * `actors` names who marked each visit attended.
 */
export function orderVisitsOf(
    raw: RawOrderVisits,
    now: Date,
    actors: ReadonlyMap<string, string | null> = new Map(),
): OrderVisitsDto | null {
    const service = raw.items[0]?.service;
    if (!service) return null;
    const byNumber = new Map<number, RawOrderVisits["bookings"][number]>();
    for (const b of raw.bookings) {
        if (b.visitNumber !== null && !byNumber.has(b.visitNumber)) {
            byNumber.set(b.visitNumber, b);
        }
    }
    // A visit booked past the service's count (the service was edited
    // down) still shows: it was sold and booked.
    const total = Math.max(service.visits, ...byNumber.keys());
    const visits: OrderVisitDto[] = [];
    for (let n = 1; n <= total; n += 1) {
        const b = byNumber.get(n);
        const said = b?.events[0] ?? null;
        visits.push({
            number: n,
            bookingId: b?.id ?? null,
            startAt: b?.startAt ?? null,
            endAt: b?.endAt ?? null,
            staffName: b?.staff?.name ?? null,
            where: whereOf(b?.locationType, service.locationType),
            state: !b
                ? "TO_BOOK"
                : b.outcome === "ATTENDED"
                  ? "ATTENDED"
                  : b.outcome === "NO_SHOW"
                    ? "MISSED"
                    : "BOOKED",
            attendedAt:
                b?.outcome === "ATTENDED" ? (said?.createdAt ?? null) : null,
            attendedBy:
                b?.outcome === "ATTENDED" && said?.actorUserId
                    ? {
                          id: said.actorUserId,
                          name: actors.get(said.actorUserId) ?? null,
                      }
                    : null,
        });
    }
    const attended = visits.filter((v) => v.state === "ATTENDED").length;
    const closed =
        raw.status === "CANCELLED" || raw.paymentStatus === "REFUNDED";
    const waiting = visits.find((v) => v.state === "BOOKED") ?? null;
    const started =
        waiting?.startAt !== null &&
        waiting?.startAt !== undefined &&
        waiting.startAt.getTime() <= now.getTime();
    const toBook = visits.find((v) => v.state === "TO_BOOK") ?? null;
    return {
        total,
        attended,
        booked: visits.filter((v) => v.state !== "TO_BOOK").length,
        service: {
            id: service.id,
            name: service.name,
            durationMinutes: service.durationMinutes,
            timezone: service.timezone,
            priceCents: service.priceCents,
        },
        visits,
        next: closed
            ? { attend: null, upcoming: null, book: null }
            : {
                  attend: waiting && started ? waiting.number : null,
                  upcoming:
                      waiting && !started && waiting.startAt
                          ? { number: waiting.number, startAt: waiting.startAt }
                          : null,
                  book: !waiting && toBook ? toBook.number : null,
              },
        done: attended >= total,
        closed,
    };
}

/** Who marked the visits attended, for {@link orderVisitsOf}'s names. */
export function visitActorIds(raw: RawOrderVisits): string[] {
    return [
        ...new Set(
            raw.bookings
                .map((b) => b.events[0]?.actorUserId)
                .filter((id): id is string => Boolean(id)),
        ),
    ];
}

/**
 * The order's visits, read on its own: null for an order that isn't a
 * treatment (or is gone).
 */
export async function loadOrderVisits(
    db: Pick<Prisma.TransactionClient, "order" | "user">,
    orderId: string,
    now: Date,
): Promise<OrderVisitsDto | null> {
    const raw = await db.order.findUnique({
        where: { id: orderId },
        select: ORDER_VISITS_SELECT,
    });
    if (!raw || raw.items.length === 0) return null;
    const ids = visitActorIds(raw);
    const users =
        ids.length > 0
            ? await db.user.findMany({
                  where: { id: { in: ids } },
                  select: { id: true, name: true },
              })
            : [];
    return orderVisitsOf(raw, now, new Map(users.map((u) => [u.id, u.name])));
}

/**
 * The read's `visits`, for Order Detail: absent on an order with no service
 * line, null when they couldn't be read (the card then says so rather than
 * showing no visits), and never a failed read of the whole order.
 */
export async function visitsForRead(
    order: { id: string; items: { serviceId?: string | null }[] },
    logger: Pick<Logger, "warn">,
    now: Date = new Date(),
): Promise<{ visits?: OrderVisitsDto | null }> {
    if (!order.items.some((i) => i.serviceId)) return {};
    try {
        return { visits: await loadOrderVisits(prisma, order.id, now) };
    } catch (error) {
        logger.warn(`An order's visits couldn't be read: ${String(error)}`);
        return { visits: null };
    }
}

/** A treatment's next visit, as the Orders list's row says it (B14). */
export interface NextVisitDto {
    startAt: Date;
    /** The clinic's zone, which the row's "Next 19 Sep, 10:00" is read in. */
    timezone: string;
}

/** What {@link nextVisitOf} reads of one booking. */
export interface NextVisitBooking {
    orderId: string | null;
    visitNumber: number | null;
    startAt: Date;
    outcome: string | null;
    service: { timezone: string };
}

/**
 * The order's next visit by the Visits card's own rule (`orderVisitsOf`):
 * the first visit, by number, whose booking is still waiting — neither
 * attended nor missed; a cancelled booking is not passed in. Null when
 * none is booked. `bookings` come in visit-number order, earliest made
 * first, as the card reads them.
 */
export function nextVisitOf(
    bookings: readonly NextVisitBooking[],
): NextVisitDto | null {
    const byNumber = new Map<number, NextVisitBooking>();
    for (const b of bookings) {
        if (b.visitNumber !== null && !byNumber.has(b.visitNumber)) {
            byNumber.set(b.visitNumber, b);
        }
    }
    const waiting = [...byNumber.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, b]) => b)
        .find((b) => b.outcome !== "ATTENDED" && b.outcome !== "NO_SHOW");
    return waiting
        ? { startAt: waiting.startAt, timezone: waiting.service.timezone }
        : null;
}

/**
 * Each treatment's next visit on a page of the Orders list (B14, DEC-067:
 * "Next ‹date›" on the row), in one read for the page. An order with none
 * booked is null; only the orders asked about are in the map.
 */
export async function nextVisitsFor(
    db: Pick<Prisma.TransactionClient, "booking">,
    organizationId: string,
    orderIds: readonly string[],
): Promise<Map<string, NextVisitDto | null>> {
    const out = new Map<string, NextVisitDto | null>(
        orderIds.map((id) => [id, null]),
    );
    if (orderIds.length === 0) return out;
    const bookings = await db.booking.findMany({
        where: {
            organizationId,
            orderId: { in: [...orderIds] },
            status: { not: "CANCELLED" },
            visitNumber: { not: null },
        },
        orderBy: [{ visitNumber: "asc" }, { createdAt: "asc" }],
        select: {
            orderId: true,
            visitNumber: true,
            startAt: true,
            outcome: true,
            service: { select: { timezone: true } },
        },
    });
    const byOrder = new Map<string, NextVisitBooking[]>();
    for (const b of bookings) {
        if (!b.orderId) continue;
        byOrder.set(b.orderId, [...(byOrder.get(b.orderId) ?? []), b]);
    }
    byOrder.forEach((list, id) => out.set(id, nextVisitOf(list)));
    return out;
}
