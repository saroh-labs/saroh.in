import type { TreatmentView } from "./booking-calendar";

/*
 * The words for a visit of a treatment (E10, DEC-050) on the booking detail
 * and the calendar's peek. Pure and client-safe, so both say the same.
 */

/** "Visit 2 of 3". */
export function visitLabel(t: TreatmentView): string {
    return `Visit ${t.visitNumber} of ${t.visits}`;
}

/** "With order #ORD-004": where the treatment's money is. */
export function orderLabel(t: TreatmentView): string {
    return `With order #${t.orderNumber}`;
}

/** Where the order is read (`order:read`). */
export function orderHref(t: TreatmentView): string {
    return `/commerce/orders/${encodeURIComponent(t.orderId)}`;
}

/** "Book visit 3", or null when there is nothing to book. */
export function bookNextLabel(t: TreatmentView): string | null {
    return t.nextVisit === null ? null : `Book visit ${t.nextVisit}`;
}

/**
 * Why nothing more can be booked: every visit is, or the order ended. Null
 * while a visit is still to book.
 */
export function visitsDoneText(t: TreatmentView): string | null {
    if (t.closed) {
        return "This treatment's order was cancelled or refunded, so no more visits are booked.";
    }
    return t.nextVisit === null ? "All visits booked" : null;
}

/** What the booking dialog needs to book a treatment's next visit. */
export interface VisitToBook {
    orderId: string;
    orderNumber: string;
    /** The visit being booked. */
    visitNumber: number;
    visits: number;
    /** Whose treatment it is, by name. */
    who: string;
}

/** The next visit to book, for the dialog; null when there is none. */
export function visitToBook(
    t: TreatmentView | null | undefined,
    who: string,
): VisitToBook | null {
    if (t?.nextVisit == null) return null;
    return {
        orderId: t.orderId,
        orderNumber: t.orderNumber,
        visitNumber: t.nextVisit,
        visits: t.visits,
        who,
    };
}
