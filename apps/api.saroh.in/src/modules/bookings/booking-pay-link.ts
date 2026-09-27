import { ConflictException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { rateToBps } from "../invoices/gst";
import { buildManualInvoice } from "../invoices/order-invoice";
import {
    documentColumns,
    loadTaxProfile,
    numberFor,
    writeDocumentLines,
} from "../invoices/order-invoicing";
import { mintPayToken } from "../invoices/pay-token";
import { holdLineDescription, lockBookingInTx } from "./booking-hold";

/**
 * "Send a pay link" for a booking made by staff (E4, ADR-007's link path).
 *
 * The booking is already CONFIRMED — the place is theirs, so a link that
 * sits unread in a chat never loses it. Its invoice is issued (numbered,
 * source BOOKING, priced from what the booking was made at) with a pay
 * token, and the link is `/pay/<token>`, the same page every invoice link
 * opens. When the customer pays, the webhook marks the invoice paid and the
 * booking paid online ({@link markBookingPaidInTx}). Asking again makes a
 * new link on the same invoice, and the one before stops working.
 *
 * Unlike the booking page's pay-now hold (`booking-hold.ts`), whose invoice
 * stays a draft until paid, this is a bill the business chose to send, so it
 * is paper from the start. Cancelling the booking retires its link
 * ({@link retirePayLinkInTx}); the invoice stays for the business to void.
 *
 * Saroh sends nothing itself yet (A14, D17): the link is handed back to be
 * copied.
 */

type Tx = Prisma.TransactionClient;

/** How a booking is already paid, so a link would charge twice. */
const PAID_ALREADY = ["PAID", "PACK", "MEMBERSHIP"];

interface Snapshot {
    service?: { priceCents?: unknown; currency?: unknown };
}

/** The price and currency the booking was made at, else the service's. */
function termsOf(
    snapshot: unknown,
    service: { priceCents: number | null; currency: string | null },
): { priceCents: number; currency: string } {
    const s = (snapshot as Snapshot | null)?.service;
    return {
        priceCents:
            typeof s?.priceCents === "number"
                ? s.priceCents
                : (service.priceCents ?? 0),
        currency:
            typeof s?.currency === "string"
                ? s.currency
                : (service.currency ?? "INR"),
    };
}

/**
 * Issue (or re-link) the booking's invoice and mint its pay token, under the
 * invoice's and then the booking's row lock (the webhook's order). Returns
 * the token — the only time it exists outside its hash. The caller has
 * authorized, and checked a provider is connected.
 */
export async function bookingPayLinkInTx(
    tx: Tx,
    input: {
        organizationId: string;
        bookingId: string;
        actorUserId: string | null;
        now: Date;
    },
): Promise<{ invoiceId: string; token: string }> {
    const { organizationId, bookingId, now } = input;
    await lockBookingInTx(tx, bookingId);
    const booking = await tx.booking.findFirst({
        where: { id: bookingId, organizationId },
        select: {
            id: true,
            status: true,
            paidWith: true,
            startAt: true,
            timezone: true,
            contactId: true,
            bookerName: true,
            bookerEmail: true,
            snapshot: true,
            service: {
                select: {
                    name: true,
                    priceCents: true,
                    currency: true,
                    gstRate: true,
                    sacCode: true,
                },
            },
        },
    });
    if (!booking) throw new NotFoundException("Booking not found");
    if (booking.status === "CANCELLED") {
        throw new ConflictException(
            "This booking is cancelled, so there's nothing to pay.",
        );
    }
    if (booking.status === "PENDING") {
        throw new ConflictException(
            "This booking is waiting on the customer's own online payment.",
        );
    }
    if (booking.paidWith && PAID_ALREADY.includes(booking.paidWith)) {
        throw new ConflictException("This booking is already paid.");
    }
    const terms = termsOf(booking.snapshot, booking.service);
    if (terms.priceCents <= 0) {
        throw new ConflictException(
            "This booking has no price, so there's nothing to pay.",
        );
    }

    const { token, tokenHash } = mintPayToken();
    const existing = await tx.invoice.findFirst({
        where: {
            organizationId,
            bookingId,
            kind: "INVOICE",
            source: "BOOKING",
            status: { in: ["ISSUED", "PAID"] },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true },
    });
    if (existing?.status === "PAID") {
        throw new ConflictException("This booking is already paid.");
    }
    if (existing) {
        await tx.invoice.update({
            where: { id: existing.id },
            data: { payTokenHash: tokenHash },
        });
        return { invoiceId: existing.id, token };
    }

    const profile = await loadTaxProfile(tx, organizationId);
    const doc = buildManualInvoice(
        [
            {
                description: holdLineDescription(
                    booking.service.name,
                    booking.startAt,
                    booking.timezone,
                ),
                quantity: 1,
                unitCents: terms.priceCents,
                rateBps: rateToBps(booking.service.gstRate?.toString() ?? null),
                code: booking.service.sacCode,
            },
        ],
        profile,
        null,
        0,
    );
    const number = await numberFor(tx, organizationId, profile, "INVOICE", now);
    const created = await tx.invoice.create({
        data: {
            organizationId,
            status: "ISSUED",
            number,
            kind: "INVOICE",
            source: "BOOKING",
            bookingId,
            contactId: booking.contactId,
            billToName: booking.bookerName,
            billToEmail: booking.bookerEmail,
            currency: terms.currency,
            ...documentColumns(doc),
            issuedAt: now,
            // Due by the session; a booking already under way, today.
            dueAt: booking.startAt > now ? booking.startAt : now,
            payTokenHash: tokenHash,
            createdByUserId: input.actorUserId,
        },
        select: { id: true },
    });
    await writeDocumentLines(tx, organizationId, created.id, doc);
    return { invoiceId: created.id, token };
}

/**
 * The booking's invoice was paid online (the webhook, under the invoice's
 * row lock): the booking reads as paid online, unless it was cancelled or
 * is already paid another way. Returns whether it changed.
 */
export async function markBookingPaidInTx(
    tx: Tx,
    bookingId: string,
): Promise<boolean> {
    const { count } = await tx.booking.updateMany({
        where: {
            id: bookingId,
            status: "CONFIRMED",
            OR: [{ paidWith: null }, { paidWith: { notIn: PAID_ALREADY } }],
        },
        data: { paidWith: "PAID" },
    });
    return count > 0;
}

/**
 * A cancelled booking's pay link stops working: nobody should be able to
 * pay for a place they no longer have. The issued invoice stays, unpaid,
 * for the business to void (DEC-023: an issued invoice never changes here).
 */
export async function retirePayLinkInTx(
    tx: Tx,
    bookingId: string,
): Promise<void> {
    await tx.invoice.updateMany({
        where: {
            bookingId,
            kind: "INVOICE",
            source: "BOOKING",
            status: "ISSUED",
            payTokenHash: { not: null },
        },
        data: { payTokenHash: null },
    });
}
