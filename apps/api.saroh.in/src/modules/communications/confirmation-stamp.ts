import type { ContactEmailVerifiedVia, Prisma } from "@saroh/database";

import { isReservedContactEmail } from "../contacts/contact-email";

/**
 * A confirmation the business's provider accepted proves the email it went
 * to (round-2 A14; DEC-049, plan A "What makes a contact's email
 * verified"). When the email of a booking or order confirmation is sent,
 * and the contact made that booking or order online with that very email,
 * the contact's email is stamped verified (`BOOKING_CONFIRMATION` or
 * `ORDER_CONFIRMATION`), so a later first sign-in can link to it.
 *
 * Nothing else stamps here: a send that failed, a reserved placeholder
 * address, a booking made by staff, a contact whose email is not the one
 * the confirmation went to, or one already verified (the first proof
 * stands). The notice ledger (`CustomerNotice`) says which booking or
 * order the message confirmed.
 */

type Db = Pick<
    Prisma.TransactionClient,
    "customerNotice" | "booking" | "bookingEvent" | "order" | "contact"
>;

export interface SentMessage {
    id: string;
    organizationId: string;
    contactId: string | null;
    toAddress: string;
    template: string | null;
}

/** Which proof a sent template is, or null when it proves nothing. */
export function confirmationVia(
    template: string | null,
): ContactEmailVerifiedVia | null {
    switch (template) {
        case "BOOKING_CONFIRMED":
            return "BOOKING_CONFIRMATION";
        case "ORDER_READY":
        case "ORDER_HANDED_OVER":
            return "ORDER_CONFIRMATION";
        default:
            return null;
    }
}

function same(a: string | null | undefined, b: string): boolean {
    return (a ?? "").trim().toLowerCase() === b;
}

/** Stamp the contact's email verified when the rule holds. */
export async function stampConfirmedEmail(
    db: Db,
    message: SentMessage,
    now: Date,
): Promise<boolean> {
    const via = confirmationVia(message.template);
    if (!via || !message.contactId) return false;
    const address = message.toAddress.trim().toLowerCase();
    if (!address || isReservedContactEmail(address)) return false;

    const notice = await db.customerNotice.findFirst({
        where: {
            organizationId: message.organizationId,
            messageId: message.id,
        },
        select: { bookingId: true, orderId: true },
    });
    if (!notice) return false;

    const madeOnlineWithIt =
        via === "BOOKING_CONFIRMATION"
            ? await bookingMadeOnlineWith(
                  db,
                  message,
                  notice.bookingId,
                  address,
              )
            : await orderMadeOnlineWith(db, message, notice.orderId, address);
    if (!madeOnlineWithIt) return false;

    const { count } = await db.contact.updateMany({
        where: {
            id: message.contactId,
            organizationId: message.organizationId,
            emailVerifiedAt: null,
            email: { equals: address, mode: "insensitive" },
        },
        data: { emailVerifiedAt: now, emailVerifiedVia: via },
    });
    return count > 0;
}

async function bookingMadeOnlineWith(
    db: Db,
    message: SentMessage,
    bookingId: string | null,
    address: string,
): Promise<boolean> {
    if (!bookingId) return false;
    const booking = await db.booking.findFirst({
        where: { id: bookingId, organizationId: message.organizationId },
        select: { contactId: true, bookerEmail: true },
    });
    if (booking?.contactId !== message.contactId) return false;
    if (!same(booking.bookerEmail, address)) return false;
    // Made online: its first step has no staff member behind it.
    const booked = await db.bookingEvent.findFirst({
        where: { bookingId, type: "BOOKED" },
        orderBy: { createdAt: "asc" },
        select: { actorUserId: true },
    });
    return booked !== null && booked.actorUserId === null;
}

async function orderMadeOnlineWith(
    db: Db,
    message: SentMessage,
    orderId: string | null,
    address: string,
): Promise<boolean> {
    if (!orderId) return false;
    const order = await db.order.findFirst({
        where: { id: orderId, organizationId: message.organizationId },
        select: { placedOnline: true, customer: { select: { email: true } } },
    });
    return (
        Boolean(order?.placedOnline) && same(order?.customer?.email, address)
    );
}
