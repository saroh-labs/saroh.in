import type { Prisma } from "@saroh/database";

import { removeWaitlistInTx } from "../bookings/waitlist-merge";
import { reservedRemovedEmail } from "../contacts/contact-email";
import { anonymiseStoreCustomersInTx } from "../customers/anonymise-customer";
import { destinationHashFor } from "../site-accounts/sign-in-codes.service";
import type { RemovalGoes } from "./privacy-removal-plan";
import {
    REMOVED_BODY,
    REMOVED_NAME,
    REVIEWER_NAME,
} from "./privacy-removal-plan";

/**
 * The writes of a privacy removal (DEC-042, C11), each by its rule in
 * `privacy-removal-plan.ts` REMOVAL_RULES and `personal-data.ts`, all in
 * the caller's transaction under the contact's row lock. The provider call
 * (autopay) and the booking cancels run before it, in
 * `privacy-removal.service.ts`.
 */

type Tx = Prisma.TransactionClient;

export interface RemovalScope {
    organizationId: string;
    contactId: string;
    /** Who removed them, for the reviews they hide. */
    userId: string;
    now: Date;
}

/**
 * The store customers linked to the contact, split into those only this
 * person holds (anonymised) and those another live contact is also linked
 * to (they keep their details; only this contact's link goes).
 */
export async function linkedStoreCustomers(
    tx: Tx,
    contactId: string,
): Promise<{ own: string[]; shared: string[] }> {
    const links = await tx.customerIdentityLink.findMany({
        where: { contactId },
        select: {
            customerId: true,
            customer: {
                select: {
                    identityLinks: {
                        where: {
                            contactId: { not: contactId },
                            contact: { mergedIntoId: null, removedAt: null },
                        },
                        select: { id: true },
                        take: 1,
                    },
                },
            },
        },
    });
    const own: string[] = [];
    const shared: string[] = [];
    for (const l of links) {
        (l.customer.identityLinks.length > 0 ? shared : own).push(l.customerId);
    }
    return { own: own.sort(), shared: shared.sort() };
}

/** Their orders: those of store customers only they hold, and their account's. */
export function theirOrdersWhere(
    organizationId: string,
    ownCustomers: readonly string[],
    accountIds: readonly string[],
): Prisma.OrderWhereInput {
    return {
        organizationId,
        OR: [
            { customerId: { in: [...ownCustomers] } },
            ...(accountIds.length
                ? [{ customerAccountId: { in: [...accountIds] } }]
                : []),
        ],
    };
}

/**
 * Their site accounts (ADR-011): the one on the contact, and any a merge
 * retired onto a tombstone that points here — those emails were theirs too.
 */
export async function theirAccounts(
    tx: Tx,
    organizationId: string,
    contactId: string,
): Promise<{ id: string; email: string }[]> {
    return tx.customerAccount.findMany({
        where: {
            organizationId,
            OR: [{ contactId }, { contact: { mergedIntoId: contactId } }],
        },
        select: { id: true, email: true },
        orderBy: { id: "asc" },
    });
}

/** Everything the removal writes; returns what it touched, for the audit. */
export async function removeDetailsInTx(
    tx: Tx,
    scope: RemovalScope,
): Promise<RemovalGoes> {
    const { organizationId, contactId, now } = scope;
    const placeholder = reservedRemovedEmail(contactId);

    // Storefront records: anonymise the ones only they hold, then every
    // link of theirs goes (a shared store customer keeps its details).
    const { own } = await linkedStoreCustomers(tx, contactId);
    const accounts = await theirAccounts(tx, organizationId, contactId);
    const accountIds = accounts.map((a) => a.id);
    const orderWhere = theirOrdersWhere(organizationId, own, accountIds);
    const orders = await tx.order.findMany({
        where: orderWhere,
        select: { id: true },
    });
    const orderIds = orders.map((o) => o.id);

    // Orders keep their lines, amounts, status and `deliveryState` (the GST
    // place of supply); the recipient and the free-text note go.
    const scrubbed = await tx.order.updateMany({
        where: { id: { in: orderIds } },
        data: {
            deliveryName: null,
            deliveryPhone: null,
            deliveryLine1: null,
            deliveryLine2: null,
            deliveryCity: null,
            deliveryPostalCode: null,
            notes: null,
        },
    });
    await tx.reviewInvitation.updateMany({
        where: { organizationId, orderId: { in: orderIds } },
        data: { toAddress: placeholder },
    });
    // Reviews they wrote: hidden, their name and words gone; the stars
    // still count in the product's rating.
    const reviewWhere: Prisma.ProductReviewWhereInput = {
        organizationId,
        OR: [
            { customerId: { in: own } },
            { invitation: { orderId: { in: orderIds } } },
        ],
    };
    const reviews = await tx.productReview.updateMany({
        where: reviewWhere,
        data: {
            displayName: REVIEWER_NAME,
            body: null,
            invitedTo: placeholder,
        },
    });
    await tx.productReview.updateMany({
        where: { ...reviewWhere, status: { not: "HIDDEN" } },
        data: { status: "HIDDEN", hiddenAt: now, hiddenByUserId: scope.userId },
    });
    const storeRecords = await anonymiseStoreCustomersInTx(tx, own);
    await tx.customerIdentityLink.deleteMany({ where: { contactId } });

    // What was sent to them keeps its status; the words and the address go,
    // and a provider's error that could quote the address.
    const messages = await tx.message.updateMany({
        where: { organizationId, contactId },
        data: { body: REMOVED_BODY, toAddress: placeholder },
    });
    await tx.delivery.updateMany({
        where: { organizationId, message: { contactId } },
        data: { error: null },
    });

    // Every booking keeps its time and service under "Removed customer"
    // (default 26); future ones were cancelled before this transaction.
    const bookings = await tx.booking.updateMany({
        where: { organizationId, contactId },
        data: {
            bookerName: REMOVED_NAME,
            bookerEmail: null,
            bookerPhone: null,
            intakeNote: null,
        },
    });
    const removedBooker = JSON.stringify({
        name: REMOVED_NAME,
        email: null,
        phone: null,
    });
    await tx.$executeRaw`UPDATE "Booking"
        SET snapshot = jsonb_set(snapshot::jsonb, '{booker}', ${removedBooker}::jsonb)
        WHERE "organizationId" = ${organizationId}
          AND "contactId" = ${contactId}
          AND jsonb_typeof(snapshot::jsonb) = 'object'
          AND snapshot::jsonb ? 'booker'`;

    // What hangs off the contact.
    const notes = await tx.contactNote.deleteMany({ where: { contactId } });
    const attention = await tx.contactAttention.deleteMany({
        where: { contactId },
    });
    const consents = await tx.consent.deleteMany({ where: { contactId } });
    const threadMessages = await tx.customerThreadMessage.count({
        where: { organizationId, thread: { contactId } },
    });
    // Their places in line go; a place held for them passes on (A12).
    await removeWaitlistInTx(tx, { organizationId, contactId, now });
    // The thread goes with every message in it (A13).
    await tx.customerThread.deleteMany({
        where: { organizationId, contactId },
    });

    // The site account, with its sessions (cascade) and pending codes.
    if (accounts.length > 0) {
        await tx.customerSignInCode.deleteMany({
            where: {
                organizationId,
                destinationHash: {
                    in: accounts.map((a) =>
                        destinationHashFor(organizationId, a.email),
                    ),
                },
            },
        });
        await tx.customerSession.deleteMany({
            where: { organizationId, accountId: { in: accountIds } },
        });
        // Retired accounts first: they point at the live one.
        await tx.customerAccount.deleteMany({
            where: { id: { in: accountIds }, mergedIntoId: { not: null } },
        });
        await tx.customerAccount.deleteMany({
            where: { id: { in: accountIds } },
        });
    }

    // Autopay was cancelled at the provider before this transaction; the
    // provider's ids stay so a late webhook still reconciles, the UPI handle
    // or card digits go.
    await tx.paymentMandate.updateMany({
        where: { organizationId, contactId },
        data: { displayHint: null },
    });

    // The contact: anonymised in place, so every key to it holds.
    await tx.contact.update({
        where: { id: contactId },
        data: {
            email: placeholder,
            firstName: null,
            lastName: null,
            phone: null,
            company: null,
            addressLine1: null,
            addressLine2: null,
            city: null,
            state: null,
            postalCode: null,
            country: null,
            emailVerifiedAt: null,
            emailVerifiedVia: null,
            removedAt: now,
        },
        select: { id: true },
    });

    return {
        notes: notes.count,
        attention: attention.count,
        consents: consents.count,
        messages: messages.count,
        threadMessages,
        storeRecords,
        ordersScrubbed: scrubbed.count,
        bookingsCancelled: 0,
        bookings: bookings.count,
        reviews: reviews.count,
        account: accounts.length > 0,
        autopay: 0,
    };
}
