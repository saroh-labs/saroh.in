import type { Prisma } from "@saroh/database";

import type { InvoiceSource } from "./invoice-state";

/**
 * What the Invoices list is narrowed to by what the paper was for (round-2
 * D18): a source (the list's chips), or one pack, course or order (a link
 * from Pack Detail, Course Detail or an order).
 *
 * A correction is filed under what its original was for. A credit note
 * against a subscription's, a pack's or a course's invoice is written with
 * source MANUAL (`order-invoicing.ts`), so the paper's own source would put
 * it under "By hand": the original's decides instead. An original has no
 * `relatedInvoiceId`, so the two branches never both match one row.
 *
 * Only ever ANDed onto the list's own where, never replacing it: the
 * pay-now holds and online pack drafts `NOT_A_BOOKING_HOLD` leaves out stay
 * out whatever is asked for.
 */
export interface InvoiceListFilter {
    source?: InvoiceSource;
    packId?: string;
    courseId?: string;
    orderId?: string;
}

/** An original matching `own`, or a correction whose original does. */
function selfOrOriginal(
    own: Prisma.InvoiceWhereInput,
): Prisma.InvoiceWhereInput {
    return {
        OR: [{ relatedInvoiceId: null, ...own }, { relatedInvoice: own }],
    };
}

/** `{}` when nothing narrows the list, so the where reads as before. */
export function listFilterWhere(
    filter: InvoiceListFilter,
): Prisma.InvoiceWhereInput {
    const parts: Prisma.InvoiceWhereInput[] = [];
    if (filter.source) {
        parts.push(selfOrOriginal({ source: filter.source }));
    }
    if (filter.packId) {
        // Through the purchase it sold; the pack is archived, never
        // deleted, while anyone holds one.
        parts.push(selfOrOriginal({ packPurchase: { packId: filter.packId } }));
    }
    if (filter.courseId) {
        parts.push(
            selfOrOriginal({
                courseEnrollment: { courseId: filter.courseId },
            }),
        );
    }
    if (filter.orderId) {
        // Every paper of an order names it, corrections included.
        parts.push({ orderId: filter.orderId });
    }
    return parts.length > 0 ? { AND: parts } : {};
}
