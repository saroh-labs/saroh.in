import { NotFoundException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { openOrderWhere } from "../orders/open-orders";
import { openMandatesWhere } from "../payments/mandate-gate";
import type {
    RemovalGoes,
    RemovalRefusal,
    RemovalStays,
} from "./privacy-removal-plan";
import { removalRefusals } from "./privacy-removal-plan";
import {
    linkedStoreCustomers,
    theirAccounts,
    theirOrdersWhere,
} from "./privacy-removal-writes";
import { isRemovedContact } from "./resolve-contact";

/**
 * The reads of a privacy removal (DEC-042, C11): the contact it may act on,
 * the refusals, and what goes and what stays, for the preview and for the
 * checks the removal repeats under its lock.
 */

const LIVE_SUBSCRIPTION = { not: "CANCELLED" } as const;
const LIVE_BOOKING = ["CONFIRMED", "PENDING"];

type Tx = Prisma.TransactionClient;

export interface Found {
    id: string;
    firstName: string | null;
    lastName: string | null;
}

export function futureBookingsWhere(
    organizationId: string,
    contactId: string,
    now: Date,
): Prisma.BookingWhereInput {
    return {
        organizationId,
        contactId,
        status: { in: LIVE_BOOKING },
        startAt: { gt: now },
    };
}

/**
 * The contact in this business, neither a merge's tombstone nor already
 * removed; a 404 otherwise, as for another business's id.
 */
export async function findContact(
    tx: Tx,
    organizationId: string,
    contactId: string,
): Promise<Found> {
    const contact = await tx.contact.findFirst({
        where: { id: contactId, organizationId },
        select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            mergedIntoId: true,
            removedAt: true,
        },
    });
    if (!contact) throw new NotFoundException("Contact not found");
    if (contact.mergedIntoId) {
        throw new NotFoundException({
            message: "This customer was merged into another",
            details: {
                reason: "already-merged",
                mergedInto: contact.mergedIntoId,
            },
        });
    }
    if (isRemovedContact(contact)) {
        throw new NotFoundException({
            message: "This customer's details were already removed",
            details: { reason: "already-removed" },
        });
    }
    return contact;
}

/** An open order of theirs, or a live subscription (default 25). */
export async function refusalsFor(
    tx: Tx,
    organizationId: string,
    contactId: string,
): Promise<RemovalRefusal[]> {
    const { own, shared } = await linkedStoreCustomers(tx, contactId);
    const accounts = await theirAccounts(tx, organizationId, contactId);
    const [openOrders, live] = await Promise.all([
        tx.order.count({
            where: {
                AND: [
                    openOrderWhere(organizationId),
                    theirOrdersWhere(
                        organizationId,
                        [...own, ...shared],
                        accounts.map((a) => a.id),
                    ),
                ],
            },
        }),
        tx.customerSubscription.findMany({
            where: { organizationId, contactId, status: LIVE_SUBSCRIPTION },
            select: { plan: { select: { name: true } } },
        }),
    ]);
    return removalRefusals({
        openOrders,
        livePlans: live.map((s) => s.plan.name),
    });
}

export async function countGoes(
    tx: Tx,
    organizationId: string,
    contactId: string,
    now: Date,
): Promise<RemovalGoes> {
    const { own } = await linkedStoreCustomers(tx, contactId);
    const accounts = await theirAccounts(tx, organizationId, contactId);
    const orderWhere = theirOrdersWhere(
        organizationId,
        own,
        accounts.map((a) => a.id),
    );
    const [
        notes,
        attention,
        consents,
        messages,
        threadMessages,
        ordersScrubbed,
        bookingsCancelled,
        bookings,
        reviews,
        autopay,
    ] = await Promise.all([
        tx.contactNote.count({ where: { contactId } }),
        tx.contactAttention.count({ where: { contactId, removedAt: null } }),
        tx.consent.count({ where: { contactId } }),
        tx.message.count({ where: { organizationId, contactId } }),
        tx.customerThreadMessage.count({
            where: { organizationId, thread: { contactId } },
        }),
        tx.order.count({ where: orderWhere }),
        tx.booking.count({
            where: futureBookingsWhere(organizationId, contactId, now),
        }),
        tx.booking.count({ where: { organizationId, contactId } }),
        tx.productReview.count({
            where: {
                organizationId,
                OR: [
                    { customerId: { in: own } },
                    { invitation: { order: orderWhere } },
                ],
            },
        }),
        tx.paymentMandate.count({
            where: openMandatesWhere(organizationId, contactId),
        }),
    ]);
    return {
        notes,
        attention,
        consents,
        messages,
        threadMessages,
        storeRecords: own.length,
        ordersScrubbed,
        bookingsCancelled,
        bookings,
        reviews,
        account: accounts.length > 0,
        autopay,
    };
}

export async function countStays(
    tx: Tx,
    organizationId: string,
    contactId: string,
): Promise<RemovalStays> {
    const { own, shared } = await linkedStoreCustomers(tx, contactId);
    const accounts = await theirAccounts(tx, organizationId, contactId);
    const [
        orders,
        invoices,
        leads,
        submissions,
        packs,
        subscriptions,
        courses,
    ] = await Promise.all([
        tx.order.count({
            where: theirOrdersWhere(
                organizationId,
                [...own, ...shared],
                accounts.map((a) => a.id),
            ),
        }),
        tx.invoice.count({ where: { organizationId, contactId } }),
        tx.lead.count({ where: { contactId } }),
        tx.submission.count({ where: { contactId } }),
        tx.packPurchase.count({ where: { contactId } }),
        tx.customerSubscription.count({ where: { contactId } }),
        tx.courseEnrollment.count({ where: { contactId } }),
    ]);
    return {
        orders,
        invoices,
        leads,
        submissions,
        packs,
        subscriptions,
        courses,
    };
}
