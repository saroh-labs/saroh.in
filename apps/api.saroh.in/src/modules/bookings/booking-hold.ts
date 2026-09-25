import type { Prisma } from "@saroh/database";
import { DateTime } from "luxon";

import { rateToBps } from "../invoices/gst";
import { buildManualInvoice } from "../invoices/order-invoice";
import {
    documentColumns,
    loadTaxProfile,
    numberFor,
    writeDocumentLines,
} from "../invoices/order-invoicing";
import { mintPayToken } from "../invoices/pay-token";
import { courseSeatsHeld } from "./course-seats";

/**
 * Pay now on the booking page (U19, ADR-008): a PENDING booking that holds
 * its place for {@link HOLD_MINUTES}, and a DRAFT invoice for it (source
 * BOOKING) that the customer pays through the invoice payment path. The
 * provider's webhook confirms the booking and gives the invoice its number;
 * a hold nobody paid lets its place go — at once for every read (a hold whose
 * time ran out holds nothing), and for good when the sweep job or the
 * customer releases it.
 *
 * The invoice stays a draft until the money arrives, so an abandoned hold
 * never takes a number: a registered business's series has no hole and needs
 * no credit note for a sale that never happened (the order's rule, ADR-008).
 * A released hold's draft is voided rather than deleted — its payment intent
 * hangs off it, and a payment that lands afterwards must still find it and be
 * recorded as owed back.
 *
 * Plain functions on the caller's transaction, like `order-invoicing.ts`: the
 * booking service, the webhook reconciliation and the sweep job all call them
 * inside their own.
 */

type Tx = Prisma.TransactionClient;

/** How long a pay-now booking holds its place. */
export const HOLD_MINUTES = 15;

/** The self-rescheduling job that releases holds whose time ran out. */
export const RELEASE_HOLDS_TYPE = "booking.release-holds";

/** Why a released hold's draft invoice was voided. */
export const HOLD_RELEASED_REASON =
    "Not paid within 15 minutes, so the place was released.";

/**
 * What takes a place: a confirmed booking, or a hold still inside its time.
 * Every capacity count and clash check reads through this, so a hold is a
 * place taken for exactly as long as it lasts — no job has to run first.
 */
export function holdsPlace(now: Date): Prisma.BookingWhereInput {
    return {
        OR: [
            { status: "CONFIRMED" },
            { status: "PENDING", holdExpiresAt: { gt: now } },
        ],
    };
}

interface HoldFields {
    status: string;
    holdExpiresAt: Date | null;
}

/**
 * A booking as the booking page reads it: HELD while its hold lasts,
 * CONFIRMED once paid (or never held), RELEASED once the hold ran out or was
 * let go, and CANCELLED for anything else cancelled.
 */
export type HoldState = "HELD" | "CONFIRMED" | "RELEASED" | "CANCELLED";

export function holdState(booking: HoldFields, now: Date): HoldState {
    if (booking.status === "CONFIRMED") return "CONFIRMED";
    if (booking.status === "PENDING") {
        return booking.holdExpiresAt && booking.holdExpiresAt > now
            ? "HELD"
            : "RELEASED";
    }
    // A cancelled booking that was a hold (it keeps its expiry) was released.
    return booking.holdExpiresAt ? "RELEASED" : "CANCELLED";
}

/** A pending booking whose hold has run out: it holds nothing. */
export function isExpiredHold(booking: HoldFields, now: Date): boolean {
    return (
        booking.status === "PENDING" &&
        (booking.holdExpiresAt === null || booking.holdExpiresAt <= now)
    );
}

/** When a hold made now runs out. */
export function holdExpiry(now: Date): Date {
    return new Date(now.getTime() + HOLD_MINUTES * 60_000);
}

/** The invoice line for a booking: the service and when, in its zone. */
export function holdLineDescription(
    serviceName: string,
    startAt: Date,
    timezone: string,
): string {
    const when = DateTime.fromJSDate(startAt, { zone: timezone })
        .setLocale("en-US")
        .toFormat("ccc d LLL yyyy, HH:mm");
    return `${serviceName} · ${when}`;
}

/**
 * The hold's invoice: a DRAFT billed to the booker, priced from the service
 * on the server (GST inside the price, at the service's rate and SAC), with
 * a pay token. Returns the token — the only time it exists outside its hash.
 */
export async function createHoldInvoiceInTx(
    tx: Tx,
    input: {
        organizationId: string;
        bookingId: string;
        contactId: string;
        billToName: string | null;
        billToEmail: string;
        service: {
            name: string;
            priceCents: number;
            currency: string;
            timezone: string;
            gstRate: { toString(): string } | null;
            sacCode: string | null;
        };
        startAt: Date;
    },
): Promise<{ invoiceId: string; payToken: string }> {
    const profile = await loadTaxProfile(tx, input.organizationId);
    const doc = buildManualInvoice(
        [
            {
                description: holdLineDescription(
                    input.service.name,
                    input.startAt,
                    input.service.timezone,
                ),
                quantity: 1,
                unitCents: input.service.priceCents,
                rateBps: rateToBps(input.service.gstRate?.toString() ?? null),
                code: input.service.sacCode,
            },
        ],
        profile,
        null,
        0,
    );
    const { token, tokenHash } = mintPayToken();
    const created = await tx.invoice.create({
        data: {
            organizationId: input.organizationId,
            status: "DRAFT",
            kind: "INVOICE",
            source: "BOOKING",
            bookingId: input.bookingId,
            contactId: input.contactId,
            billToName: input.billToName,
            billToEmail: input.billToEmail,
            currency: input.service.currency,
            ...documentColumns(doc),
            payTokenHash: tokenHash,
        },
        select: { id: true },
    });
    await writeDocumentLines(tx, input.organizationId, created.id, doc);
    return { invoiceId: created.id, payToken: token };
}

/**
 * A new pay token for a hold's draft — an idempotent replay of the booking
 * request gets its own, since only the hash of the first was kept. The one
 * before stops working, as with a pay link made again.
 */
export async function renewHoldTokenInTx(
    tx: Tx,
    bookingId: string,
): Promise<string | null> {
    const { token, tokenHash } = mintPayToken();
    const { count } = await tx.invoice.updateMany({
        where: {
            bookingId,
            kind: "INVOICE",
            source: "BOOKING",
            status: "DRAFT",
        },
        data: { payTokenHash: tokenHash },
    });
    return count > 0 ? token : null;
}

/**
 * Lock a booking for a change that may touch its hold: the hold's invoice
 * rows first, then the booking's. The payment webhook takes the invoice's
 * lock and then the booking's (`applyInvoiceSuccess` → `confirmHoldInTx`),
 * so everything else that locks a booking which may be a hold takes them in
 * that order too. The other way round, a release and a payment arriving
 * together each wait on the other, and Postgres kills one (#508).
 */
export async function lockBookingInTx(
    tx: Tx,
    bookingId: string,
): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE "bookingId" = ${bookingId} AND source = 'BOOKING' ORDER BY id FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${bookingId} FOR UPDATE`;
}

/**
 * Let a hold go: the booking is cancelled (keeping its expiry, which is how
 * it reads as released rather than cancelled) and its draft invoice voided,
 * its pay token cleared. Takes the invoice's and then the booking's row lock
 * ({@link lockBookingInTx}) and re-reads it, so a payment confirming it at
 * the same moment wins or loses cleanly. Returns whether anything was
 * released.
 *
 * `actorUserId` is the team member who cancelled it; none when the booker
 * let it go or its time ran out.
 */
export async function releaseHoldInTx(
    tx: Tx,
    bookingId: string,
    now: Date,
    actorUserId: string | null = null,
): Promise<boolean> {
    await lockBookingInTx(tx, bookingId);
    const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        select: {
            id: true,
            organizationId: true,
            status: true,
            startAt: true,
            holdExpiresAt: true,
        },
    });
    if (booking?.status !== "PENDING") return false;
    await tx.booking.update({
        where: { id: booking.id },
        data: {
            status: "CANCELLED",
            cancelledAt: now,
            holdExpiresAt: booking.holdExpiresAt ?? now,
        },
    });
    // The history reads "cancelled", and the booking's kept expiry says it
    // was a hold that was let go — by the team when it names who.
    await tx.bookingEvent.create({
        data: {
            bookingId: booking.id,
            organizationId: booking.organizationId,
            type: "CANCELLED",
            actorUserId,
            fromStartAt: booking.startAt,
        },
        select: { id: true },
    });
    await tx.invoice.updateMany({
        where: {
            bookingId: booking.id,
            kind: "INVOICE",
            source: "BOOKING",
            status: "DRAFT",
        },
        data: {
            status: "VOID",
            voidedAt: now,
            voidReason: HOLD_RELEASED_REASON,
            payTokenHash: null,
        },
    });
    return true;
}

/**
 * Whether a booking's place is still free, leaving the booking itself out —
 * for a payment that arrives after its hold ran out. A one-to-one somebody
 * takes is that person's diary; anything else is the service's seats, with
 * what open courses still hold.
 */
async function placeStillFree(
    tx: Tx,
    booking: {
        id: string;
        serviceId: string;
        staffId: string | null;
        startAt: Date;
        endAt: Date;
    },
    capacity: number,
    now: Date,
): Promise<boolean> {
    const overlapping = {
        id: { not: booking.id },
        startAt: { lt: booking.endAt },
        endAt: { gt: booking.startAt },
        ...holdsPlace(now),
    } satisfies Prisma.BookingWhereInput;
    if (booking.staffId && capacity === 1) {
        await tx.$queryRaw`SELECT id FROM "StaffMember" WHERE id = ${booking.staffId} FOR UPDATE`;
        const clashes = await tx.booking.count({
            where: { ...overlapping, staffId: booking.staffId },
        });
        return clashes === 0;
    }
    const taken = await tx.booking.count({
        where: { ...overlapping, serviceId: booking.serviceId },
    });
    const held = await courseSeatsHeld(
        tx,
        booking.serviceId,
        booking.startAt,
        booking.endAt,
    );
    return taken + held < capacity;
}

/**
 * Money arrived for a hold's draft invoice (the webhook, under the invoice's
 * row lock). The booking is confirmed — paid online — and the invoice takes
 * its number and is written PAID, its number and date those of the payment.
 *
 * A payment after the hold ran out still confirms it when the place is free;
 * when someone else has it now, the hold is released and the caller records
 * the capture as owed back, as for any invoice that could not take it.
 */
export async function confirmHoldInTx(
    tx: Tx,
    input: {
        invoiceId: string;
        organizationId: string;
        now: Date;
        payment: {
            paymentMethod: string;
            paymentReference: string | null;
            paymentNote: string;
        };
    },
): Promise<"confirmed" | "released"> {
    const { now } = input;
    const invoice = await tx.invoice.findFirst({
        where: {
            id: input.invoiceId,
            organizationId: input.organizationId,
            status: "DRAFT",
            source: "BOOKING",
        },
        select: { id: true, bookingId: true },
    });
    if (!invoice?.bookingId) return "released";
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${invoice.bookingId} FOR UPDATE`;
    const booking = await tx.booking.findUnique({
        where: { id: invoice.bookingId },
        select: {
            id: true,
            serviceId: true,
            staffId: true,
            status: true,
            startAt: true,
            endAt: true,
            holdExpiresAt: true,
            service: { select: { capacity: true } },
        },
    });
    if (booking?.status !== "PENDING") return "released";
    const free =
        !isExpiredHold(booking, now) ||
        (await placeStillFree(tx, booking, booking.service.capacity, now));
    if (!free) {
        await releaseHoldInTx(tx, booking.id, now);
        return "released";
    }

    await tx.booking.update({
        where: { id: booking.id },
        data: { status: "CONFIRMED", holdExpiresAt: null, paidWith: "PAID" },
    });
    const profile = await loadTaxProfile(tx, input.organizationId);
    const number = await numberFor(
        tx,
        input.organizationId,
        profile,
        "INVOICE",
        now,
    );
    await tx.invoice.update({
        where: { id: invoice.id },
        data: {
            status: "PAID",
            number,
            issuedAt: now,
            dueAt: now,
            paidAt: now,
            ...input.payment,
        },
    });
    return "confirmed";
}
