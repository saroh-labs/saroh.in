import type { Logger } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { resolveContact } from "../customer-workspace/resolve-contact";
import { formatMoney } from "../invoices/invoice-send.service";
import { accountAreaOn } from "../site-accounts/account-area";
import { appendMessage } from "../site-accounts/thread-store";
import type { FulfilmentType } from "./fulfilment";
import { fromCents } from "./order-pricing";

/*
 * "Tell the customer" on Order Detail (round-2 B9): a change of how their
 * order leaves, or its cancel, said in their message thread with the
 * business (A13) as a SYSTEM message — the thread they read on the
 * business's site, signed in.
 *
 * Only while the account area is on (`SITE_ACCOUNT_AREA`, release boundary
 * 4) and the customer has a live site account: otherwise nobody would read
 * it, and the sheet says nothing is sent, so the team emails or calls them
 * themselves. Saroh sends no order email yet (A14).
 */

type Db = Pick<Prisma.TransactionClient, "customerAccount">;

/** The order events a thread note names. */
export type OrderNoteEvent = "ORDER_FULFILMENT_CHANGED" | "ORDER_CANCELLED";

/** Whether a note would reach this contact: the area is on, and they sign in. */
export async function customerThreadOpen(
    db: Db,
    organizationId: string,
    contactId: string | null,
): Promise<boolean> {
    if (!contactId || !accountAreaOn()) return false;
    const accounts = await db.customerAccount.count({
        where: { organizationId, contactId, status: "ACTIVE" },
    });
    return accounts > 0;
}

/**
 * Post the note into the contact's thread, on the caller's transaction.
 * The contact is followed through a merge; a removed one, or one who no
 * longer signs in, gets nothing. Returns whether it was posted.
 */
export async function tellCustomerInTx(
    tx: Prisma.TransactionClient,
    input: {
        organizationId: string;
        contactId: string | null;
        body: string;
        event: OrderNoteEvent;
        actorUserId: string | null;
        now?: Date;
    },
): Promise<boolean> {
    if (!input.contactId || !accountAreaOn()) return false;
    const contact = await resolveContact(
        tx,
        input.contactId,
        input.organizationId,
    );
    if (!contact || contact.removed) return false;
    if (!(await customerThreadOpen(tx, input.organizationId, contact.id))) {
        return false;
    }
    await appendMessage(tx, {
        organizationId: input.organizationId,
        contactId: contact.id,
        author: "SYSTEM",
        body: input.body,
        authorUserId: input.actorUserId,
        event: input.event,
        now: input.now ?? new Date(),
    });
    return true;
}

/**
 * Tell the order's customer, after the change committed: its store
 * customer's contact (the oldest link), in its own transaction. Never
 * fails the change it follows — a failure is logged and reads as not told.
 */
export async function tellOrderCustomer(
    input: {
        organizationId: string;
        actorUserId: string | null;
        customerId: string | null;
        body: string;
        event: OrderNoteEvent;
    },
    logger: Pick<Logger, "warn">,
): Promise<boolean> {
    const { customerId } = input;
    if (!customerId) return false;
    try {
        return await prisma.$transaction(async (tx) => {
            const link = await tx.customerIdentityLink.findFirst({
                where: { customerId },
                orderBy: { createdAt: "asc" },
                select: { contactId: true },
            });
            return tellCustomerInTx(tx, {
                organizationId: input.organizationId,
                contactId: link?.contactId ?? null,
                body: input.body,
                event: input.event,
                actorUserId: input.actorUserId,
            });
        });
    } catch (err) {
        logger.warn(
            `The customer's note about their order couldn't be posted: ${String(err)}`,
        );
        return false;
    }
}

/** "for local delivery" — how a note says the new way. */
const FOR_TYPE: Record<FulfilmentType, string> = {
    PICKUP: "for pick-up",
    LOCAL_DELIVERY: "for local delivery",
    SHIPPING: "to be shipped",
    DIGITAL: "to be sent digitally",
    APPOINTMENT_IN_PERSON: "a booking in person",
    APPOINTMENT_ONLINE: "a booking online",
};

const said = (cents: number, currency: string) =>
    formatMoney(fromCents(Math.abs(cents)), currency);

/**
 * "Your order #1063 is now for local delivery. There's ₹40.00 more to pay
 * for delivery." What changed for them, and the money it moved.
 */
export function fulfilmentNote(input: {
    orderNumber: string;
    currency: string;
    type: FulfilmentType;
    differenceCents: number;
}): string {
    const d = input.differenceCents;
    const money =
        d > 0
            ? ` There's ${said(d, input.currency)} more to pay for delivery.`
            : d < 0
              ? ` ${said(d, input.currency)} of the delivery charge is coming back to you.`
              : "";
    return `Your order #${input.orderNumber} is now ${FOR_TYPE[input.type]}.${money}`;
}

/**
 * "Your order #1063 has been cancelled. ₹610.00 is being refunded to how
 * you paid."
 */
export function cancelNote(
    orderNumber: string,
    refund?: { amountCents: number; currency: string },
): string {
    const first = `Your order #${orderNumber} has been cancelled.`;
    return refund && refund.amountCents > 0
        ? `${first} ${said(refund.amountCents, refund.currency)} is being refunded to how you paid.`
        : first;
}
