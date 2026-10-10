import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import {
    REMOVED_BODY,
    REMOVED_NAME,
    REVIEWER_NAME,
} from "../customer-workspace/privacy-removal-plan";
import { removeDetailsInTx } from "../customer-workspace/privacy-removal-writes";
import { anonymiseStoreCustomersInTx } from "../customers/anonymise-customer";
import { OrganizationLifecycleStatus } from "../organizations/organization-lifecycle.policy";
import { ERASED_LEAD_TITLE, ERASED_STAFF_NAME } from "./retention-erase-plan";

/**
 * The writes of `organization.retention.erase` (DEC-122), each by its line
 * in `retention-erase-plan.ts`. No reads of a caller's context: the job
 * runs with none, as the deletion clean-up does.
 *
 * **Every write here goes through {@link inEraseTx}**, which locks the
 * business's row `FOR SHARE` and stops unless it is still deleted and not
 * on legal hold. Placing a hold updates that row, so it waits for the
 * transaction under way and every one after it sees the hold: at most the
 * one small transaction in flight when a hold lands goes through.
 */

type Tx = Prisma.TransactionClient;

/** Who the records say did it: the eraser, never a person. */
export const RETENTION_ERASE_ACTOR = "system:retention-erase";

/** Why a write stopped: the business is held, or no longer deleted. */
export class EraseStoppedError extends Error {
    constructor(readonly why: "legal-hold" | "not-deleted") {
        super(`Erase stopped: ${why}`);
        this.name = "EraseStoppedError";
    }
}

/**
 * Run `work` in a transaction that holds the business's row `FOR SHARE`,
 * after checking it is `DELETED_RETAINED` and not on legal hold.
 */
export async function inEraseTx<T>(
    organizationId: string,
    work: (tx: Tx) => Promise<T>,
): Promise<T> {
    return prisma.$transaction(
        async (tx) => {
            const rows = await tx.$queryRaw<
                LockedOrganization[]
            >`SELECT "lifecycleStatus", "legalHoldAt" FROM "Organization"
              WHERE id = ${organizationId}
              FOR SHARE`;
            // No row: the business is gone, which reads as not deleted.
            if (rows[0]?.legalHoldAt != null) {
                throw new EraseStoppedError("legal-hold");
            }
            if (
                rows[0]?.lifecycleStatus !==
                OrganizationLifecycleStatus.DeletedRetained
            ) {
                throw new EraseStoppedError("not-deleted");
            }
            return work(tx);
        },
        // The business-wide pass is set-based and can outlast Prisma's
        // five-second default on a large business.
        { timeout: ERASE_TX_TIMEOUT_MS, maxWait: 10_000 },
    );
}

interface LockedOrganization {
    lifecycleStatus: string;
    legalHoldAt: Date | null;
}

interface LockedContact {
    removedAt: Date | null;
    mergedIntoId: string | null;
}

/** How long one erase transaction may run. */
export const ERASE_TX_TIMEOUT_MS = 120_000;

/** Class waitlist entries: gone, with nobody offered a freed place. */
export async function eraseWaitlist(organizationId: string): Promise<number> {
    return inEraseTx(organizationId, async (tx) => {
        const { count } = await tx.classWaitlistEntry.deleteMany({
            where: { organizationId },
        });
        return count;
    });
}

/** The contacts still holding a person's details, oldest id first. */
export async function contactsToErase(
    organizationId: string,
    skip: readonly string[],
    take: number,
): Promise<string[]> {
    const rows = await prisma.contact.findMany({
        where: {
            organizationId,
            removedAt: null,
            mergedIntoId: null,
            ...(skip.length > 0 ? { id: { notIn: [...skip] } } : {}),
        },
        select: { id: true },
        orderBy: { id: "asc" },
        take,
    });
    return rows.map((r) => r.id);
}

/**
 * One contact, by the privacy removal's own writes (`removeDetailsInTx`),
 * under the contact's row lock. The removal's refusals (an open order, a
 * live subscription, autopay at the provider, a future booking) don't
 * apply: the business takes no activity and its keys are gone. False when
 * the contact was removed or merged since it was listed.
 */
export async function eraseContact(
    organizationId: string,
    contactId: string,
    now: Date,
): Promise<boolean> {
    return inEraseTx(organizationId, async (tx) => {
        const rows = await tx.$queryRaw<
            LockedContact[]
        >`SELECT "removedAt", "mergedIntoId" FROM "Contact"
          WHERE id = ${contactId} AND "organizationId" = ${organizationId}
          FOR UPDATE`;
        if (rows.length === 0) return false;
        const contact = rows[0];
        if (contact.removedAt || contact.mergedIntoId) return false;
        await removeDetailsInTx(tx, {
            organizationId,
            contactId,
            userId: RETENTION_ERASE_ACTOR,
            now,
        });
        return true;
    });
}

/** A store customer not yet anonymised: its email isn't the placeholder. */
const NOT_ANONYMISED = {
    NOT: {
        AND: [
            { email: { startsWith: "removed+" } },
            { email: { endsWith: "@removed.invalid" } },
        ],
    },
} satisfies Prisma.CustomerWhereInput;

/**
 * The storefront customers no contact pass reached (never linked to a
 * contact, or shared), a batch at a time. Returns how many were anonymised;
 * zero means none are left.
 */
export async function eraseStoreCustomers(
    organizationId: string,
    take: number,
): Promise<number> {
    return inEraseTx(organizationId, async (tx) => {
        const rows = await tx.customer.findMany({
            where: {
                OR: [{ organizationId }, { store: { organizationId } }],
                ...NOT_ANONYMISED,
            },
            select: { id: true },
            orderBy: { id: "asc" },
            take,
        });
        return anonymiseStoreCustomersInTx(
            tx,
            rows.map((r) => r.id),
        );
    });
}

/** What the business-wide pass touched, for the ledger. Counts only. */
export interface RecordsErased {
    orders: number;
    bookings: number;
    messages: number;
    reviews: number;
    accounts: number;
    submissions: number;
    leads: number;
    notices: number;
    invitations: number;
    staff: number;
}

/**
 * Everything personal the per-person passes don't reach, across the whole
 * business, in one transaction. Set-based and idempotent: a second run
 * finds the same values and changes nothing that matters.
 */
export async function eraseRecords(
    organizationId: string,
    now: Date,
): Promise<RecordsErased> {
    return inEraseTx(organizationId, async (tx) => {
        const ofBusiness = {
            OR: [{ organizationId }, { store: { organizationId } }],
        };

        // Orders keep their lines, amounts, status and `deliveryState` (the
        // GST place of supply); the recipient, the note and a walk-in's
        // name and phone go.
        const orders = await tx.order.updateMany({
            where: ofBusiness,
            data: {
                deliveryName: null,
                deliveryPhone: null,
                deliveryLine1: null,
                deliveryLine2: null,
                deliveryCity: null,
                deliveryPostalCode: null,
                notes: null,
                walkInName: null,
                walkInPhone: null,
            },
        });

        // Every booking keeps its time, service and price.
        const bookings = await tx.booking.updateMany({
            where: { organizationId },
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
              AND jsonb_typeof(snapshot::jsonb) = 'object'
              AND snapshot::jsonb ? 'booker'`;

        // What was sent keeps its status; the address, subject and words go.
        const messages = await tx.$executeRaw`UPDATE "Message"
            SET body = ${REMOVED_BODY},
                subject = NULL,
                "toAddress" = 'removed+' || id || '@removed.invalid'
            WHERE "organizationId" = ${organizationId}`;
        await tx.delivery.updateMany({
            where: { organizationId },
            data: { error: null },
        });

        // Reviews: hidden, the name and words gone; the stars still count.
        await tx.$executeRaw`UPDATE "ReviewInvitation"
            SET "toAddress" = 'removed+' || id || '@removed.invalid'
            WHERE "organizationId" = ${organizationId}`;
        const reviews = await tx.$executeRaw`UPDATE "ProductReview"
            SET "displayName" = ${REVIEWER_NAME},
                body = NULL,
                "invitedTo" = 'removed+' || id || '@removed.invalid'
            WHERE "organizationId" = ${organizationId}`;
        await tx.productReview.updateMany({
            where: { organizationId, status: { not: "HIDDEN" } },
            data: {
                status: "HIDDEN",
                hiddenAt: now,
                hiddenByUserId: RETENTION_ERASE_ACTOR,
            },
        });

        // What hung off a contact removed or merged before the business
        // was deleted, and site accounts parted from their contact.
        await tx.contactNote.deleteMany({ where: { organizationId } });
        await tx.contactAttention.deleteMany({ where: { organizationId } });
        await tx.consent.deleteMany({ where: { organizationId } });
        await tx.customerThread.deleteMany({ where: { organizationId } });
        await tx.customerSignInCode.deleteMany({ where: { organizationId } });
        await tx.customerSession.deleteMany({ where: { organizationId } });
        // Retired accounts first: they point at the live one.
        await tx.customerAccount.deleteMany({
            where: { organizationId, mergedIntoId: { not: null } },
        });
        const accounts = await tx.customerAccount.deleteMany({
            where: { organizationId },
        });
        await tx.paymentMandate.updateMany({
            where: { organizationId },
            data: { displayHint: null },
        });

        // The CRM: no business is left to keep it (DEC-041 kept these for
        // the business). Rows stay for their keys; what people typed goes.
        const submissions = await tx.submission.updateMany({
            where: { organizationId },
            data: { data: {}, ipHash: null },
        });
        const leads = await tx.lead.updateMany({
            where: { organizationId },
            data: { title: ERASED_LEAD_TITLE },
        });
        await tx.activity.updateMany({
            where: { organizationId },
            data: { body: null },
        });

        // The team: inbox notices quote customers; invitations hold the
        // invited person's email; the diary holds names.
        const notices = await tx.notification.deleteMany({
            where: { organizationId },
        });
        const invited = await tx.organizationInvitation.deleteMany({
            where: { organizationId },
        });
        const storeInvited = await tx.storeInvitation.deleteMany({
            where: { store: { organizationId } },
        });
        const staff = await tx.staffMember.updateMany({
            where: { organizationId },
            data: { name: ERASED_STAFF_NAME, title: null },
        });

        return {
            orders: orders.count,
            bookings: bookings.count,
            messages,
            reviews,
            accounts: accounts.count,
            submissions: submissions.count,
            leads: leads.count,
            notices: notices.count,
            invitations: invited.count + storeInvited.count,
            staff: staff.count,
        };
    });
}

/**
 * Detailed analytics events, a batch at a time (the daily rollups are
 * never touched). Returns how many went; fewer than `take` means none are
 * left.
 */
export async function eraseAnalyticsEvents(
    organizationId: string,
    take: number,
): Promise<number> {
    return inEraseTx(organizationId, async (tx) => {
        const rows = await tx.analyticsEvent.findMany({
            where: { organizationId },
            select: { id: true },
            orderBy: { id: "asc" },
            take,
        });
        if (rows.length === 0) return 0;
        const { count } = await tx.analyticsEvent.deleteMany({
            where: { organizationId, id: { in: rows.map((r) => r.id) } },
        });
        return count;
    });
}
