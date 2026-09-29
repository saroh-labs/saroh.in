import type { Prisma } from "@saroh/database";

/*
 * A visit of a treatment as the Bookings screens read it (E10, DEC-050):
 * which visit this is, of how many, the order it belongs to, and the next
 * visit staff can book. Pure, with the select that feeds it, so the booking
 * detail and the calendar read serve the same shape.
 */

/** What a booking reads of its treatment's order. */
export const treatmentOrderSelect = {
    id: true,
    orderId: true,
    status: true,
    paymentStatus: true,
    bookings: {
        where: { status: { not: "CANCELLED" } },
        select: { visitNumber: true },
    },
} satisfies Prisma.OrderSelect;

/** A booking's treatment fields, as loaded with {@link treatmentOrderSelect}. */
export interface TreatmentRow {
    visitNumber?: number | null;
    service: { visits?: number };
    order?: {
        id: string;
        orderId: string;
        status: string;
        paymentStatus: string;
        bookings: { visitNumber: number | null }[];
    } | null;
}

/** Where a visit's treatment stands, for the booking detail and the peek. */
export interface TreatmentView {
    /** The order's id, for its link (`order:read`). */
    orderId: string;
    /** The order's number as the business reads it: "ORD-004". */
    orderNumber: string;
    /** This booking's visit: 2 of 3. */
    visitNumber: number;
    visits: number;
    /** Visits booked now, cancelled ones left out. */
    booked: number;
    /**
     * The visit staff can book next, or null: every visit is booked, or
     * the order was cancelled or refunded.
     */
    nextVisit: number | null;
    /** The order was cancelled or refunded: no more visits are booked. */
    closed: boolean;
}

/**
 * The treatment a booking is a visit of, or null for a booking that isn't
 * one. The next visit is the first not booked: visits are booked in order
 * (E9's `assertVisitBookable`), so it is always the one that can be.
 */
export function treatmentOf(row: TreatmentRow): TreatmentView | null {
    const order = row.order;
    if (!order || !row.visitNumber) return null;
    const visits = Math.max(row.service.visits ?? 1, row.visitNumber);
    const live = new Set(order.bookings.map((b) => b.visitNumber));
    const closed =
        order.status === "CANCELLED" || order.paymentStatus === "REFUNDED";
    let next: number | null = null;
    for (let n = 1; n <= visits; n += 1) {
        if (!live.has(n)) {
            next = n;
            break;
        }
    }
    return {
        orderId: order.id,
        orderNumber: order.orderId,
        visitNumber: row.visitNumber,
        visits,
        booked: [...live].filter((n) => n !== null && n <= visits).length,
        nextVisit: closed ? null : next,
        closed,
    };
}
