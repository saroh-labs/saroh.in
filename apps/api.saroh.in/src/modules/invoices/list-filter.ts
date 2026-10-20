import type { Prisma } from "@saroh/database";

import type { InvoiceSource } from "./invoice-state";
import { LIVE_PAYMENT_WHERE } from "./invoice-state";
import { fromCents } from "./totals";

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

/** The longest search the list takes (the DTO refuses more). */
export const SEARCH_MAX = 80;

/**
 * The list's search (DEC-173, U4), ORed together:
 *
 * - **a name:** the bill-to name or the contact's, case-insensitively and
 *   anywhere in it. Several words ("vivek nair") each match the contact's
 *   first or last name, so a draft (whose bill-to name is copied only on
 *   issue) is found by its full name too.
 * - **a number:** anywhere in it, so "0106" finds RC/26-27/0106.
 * - **an amount**, when `q` reads as one (`money-query.ts`): the total to
 *   the paisa, or one of `leftToPayIds`, the invoices whose left to pay
 *   (`leftToPayCents`, worked out by the caller) is that amount.
 */
export function searchWhere(
    q: string,
    cents: number | null,
    leftToPayIds: readonly string[] = [],
): Prisma.InvoiceWhereInput {
    const text = q.trim();
    const like = { contains: text, mode: "insensitive" as const };
    const words = text.split(/\s+/).filter(Boolean);
    const any: Prisma.InvoiceWhereInput[] = [
        { billToName: like },
        { number: like },
        { contact: { firstName: like } },
        { contact: { lastName: like } },
    ];
    if (words.length > 1) {
        any.push({
            AND: words.map((word) => {
                const w = { contains: word, mode: "insensitive" as const };
                return {
                    contact: { OR: [{ firstName: w }, { lastName: w }] },
                };
            }),
        });
    }
    if (cents !== null) {
        any.push({ total: fromCents(cents) });
        if (leftToPayIds.length > 0)
            any.push({ id: { in: [...leftToPayIds] } });
    }
    return { OR: any };
}

/**
 * Money received from `from` on (DEC-173, U4): the money strip's "Paid this
 * month". An invoice with a payment that counts (`LIVE_PAYMENT_WHERE`)
 * received since, part payments included; or an order's paper paid since,
 * since the order is its ledger (ADR-008) and it has no payment rows. A
 * credit note never.
 */
export function paidFromWhere(from: Date): Prisma.InvoiceWhereInput {
    return {
        kind: { not: "CREDIT_NOTE" },
        OR: [
            {
                payments: {
                    some: { ...LIVE_PAYMENT_WHERE, receivedAt: { gte: from } },
                },
            },
            { orderId: { not: null }, paidAt: { gte: from } },
        ],
    };
}
