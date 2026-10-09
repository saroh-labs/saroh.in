import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { rateToBps } from "../invoices/gst";
import { buildCorrection, buildManualInvoice } from "../invoices/order-invoice";
import {
    documentColumns,
    loadTaxProfile,
    numberFor,
    writeDocumentLines,
} from "../invoices/order-invoicing";
import { toCents } from "../invoices/totals";
import { lockBookingIntentsInTx } from "../payments/booking-refund";
import { BookingEventType } from "./booking-event-type";
import { holdLineDescription, lockBookingInTx } from "./booking-hold";
import { bookingPrice } from "./booking-money";
import type { DeskMethod } from "./desk-take";
import {
    BOOKING_PAPER,
    BOOKING_PAPER_PAYMENTS,
    chargingOnly,
    DESK_REFUSED,
    deskTake,
    paidAtDesk,
    paidOnlineOf,
} from "./desk-take";

/*
 * "Take ₹X" at the desk for a booking (round-2 P2): cash, UPI at the
 * counter or the card machine. Nothing is charged — the money is already in
 * the till — so this is paper: the booking's own invoice, numbered (DEC-023)
 * and written PAID with how it was paid, or, after a deposit, a balance
 * invoice against the deposit's for exactly the rest (as a treatment's
 * balance is, `ensureTreatmentBalanceInvoice`). A pay link already out is
 * the same invoice paid at the desk instead, and its link stops working.
 *
 * Under the booking's locks in the documented order (intent → invoice →
 * booking), so a payment the webhook confirms at the same moment wins or
 * loses cleanly; a pay link paid after this is money owed back (U13).
 */

type Tx = Prisma.TransactionClient;

/** What the desk took, as the screen says it. */
export interface DeskPayment {
    invoiceId: string;
    /** The invoice's number: "RC/26-27/0004". */
    number: string | null;
    amountCents: number;
    currency: string;
    method: DeskMethod;
    /** Cash given less the amount; null unless cash was given. */
    changeCents: number | null;
    /** The same take asked again (a double click): nothing new was written. */
    replayed: boolean;
}

/**
 * How long a take asked again reads as the same one: a double click, or a
 * retry after a lost answer — not a second payment an hour later.
 */
const REPLAY_MS = 10 * 60_000;

/** What the write reads of the booking's paper. */
const PAPER_SELECT = {
    id: true,
    number: true,
    kind: true,
    status: true,
    paymentMethod: true,
    total: true,
    currency: true,
    paidAt: true,
    createdByUserId: true,
    sellerGstin: true,
    sellerState: true,
    sellerAddress: true,
    sellerName: true,
    sellerLegalName: true,
    sellerEmail: true,
    placeOfSupply: true,
    taxType: true,
    contactId: true,
    billToName: true,
    billToEmail: true,
    billToAddress: true,
    billToState: true,
    billToGstin: true,
    paymentIntents: BOOKING_PAPER_PAYMENTS,
} satisfies Prisma.InvoiceSelect;

type PaperRow = Prisma.InvoiceGetPayload<{ select: typeof PAPER_SELECT }>;

/**
 * Take what a booking still owes at the desk. `amountCents` is what the
 * button said: a booking whose amount has changed since is refused rather
 * than taken at a figure nobody saw. The caller has authorized.
 */
export async function takeDeskPaymentInTx(
    tx: Tx,
    input: {
        organizationId: string;
        bookingId: string;
        actorUserId: string | null;
        method: DeskMethod;
        amountCents: number;
        /** Cash given, for the change; only with CASH. */
        receivedCents?: number | null;
        now: Date;
    },
): Promise<DeskPayment> {
    const { organizationId, bookingId, now } = input;
    if (input.method !== "CASH" && input.receivedCents != null) {
        throw new BadRequestException({
            message: "Cash given is only for a cash payment.",
            field: "receivedCents",
        });
    }
    if (
        input.receivedCents != null &&
        input.receivedCents < input.amountCents
    ) {
        throw new BadRequestException({
            message: "That's less than the amount to take.",
            field: "receivedCents",
        });
    }
    const changeCents =
        input.method === "CASH" && input.receivedCents != null
            ? input.receivedCents - input.amountCents
            : null;

    await lockBookingIntentsInTx(tx, bookingId);
    await lockBookingInTx(tx, bookingId);
    const booking = await tx.booking.findFirst({
        where: { id: bookingId, organizationId },
        select: {
            id: true,
            status: true,
            paidWith: true,
            orderId: true,
            courseEnrollmentId: true,
            startAt: true,
            timezone: true,
            contactId: true,
            bookerName: true,
            bookerEmail: true,
            snapshot: true,
            service: {
                select: {
                    name: true,
                    currency: true,
                    gstRate: true,
                    sacCode: true,
                },
            },
        },
    });
    if (!booking) throw new NotFoundException("Booking not found");

    const paper = await tx.invoice.findMany({
        where: { organizationId, bookingId, ...BOOKING_PAPER },
        orderBy: { createdAt: "asc" },
        select: PAPER_SELECT,
    });
    const paidOnlineCents = paidOnlineOf(paper);
    const desk = paidAtDesk(paper);
    const { priceCents, currency: bookedIn } = bookingPrice(booking.snapshot);
    const take = deskTake(booking, {
        priceCents,
        paidOnlineCents,
        paidAtDeskCents: desk.cents,
        paper: chargingOnly(paper),
    });

    if ("refusal" in take) {
        const again =
            take.refusal === DESK_REFUSED.paid
                ? sameTake(paper, input, now)
                : null;
        if (again) {
            return {
                invoiceId: again.id,
                number: again.number,
                amountCents: input.amountCents,
                currency: again.currency,
                method: input.method,
                changeCents,
                replayed: true,
            };
        }
        throw new ConflictException(take.refusal);
    }
    if (take.cents !== input.amountCents) {
        throw new ConflictException({
            message: "The amount to take has changed. Reload the booking.",
            details: { takeCents: take.cents },
        });
    }

    const currency = bookedIn ?? booking.service.currency ?? "INR";
    const paid = {
        status: "PAID",
        paidAt: now,
        paymentMethod: input.method,
        paymentNote: "Taken at the desk",
    } as const;
    let written: { id: string; number: string | null; currency: string };

    const issued = paper.find(
        (p) => p.kind === "INVOICE" && p.status === "ISSUED",
    );
    const deposit = paper.find(
        (p) => p.kind === "INVOICE" && p.status === "PAID",
    );
    if (issued) {
        // A pay link is out: this is its invoice, paid here instead. The
        // link stops working with it.
        const { count } = await tx.invoice.updateMany({
            where: { id: issued.id, organizationId, status: "ISSUED" },
            data: { ...paid, payTokenHash: null, payLinkCreatedAt: null },
        });
        if (count === 0) {
            throw new ConflictException("This invoice changed. Reload it.");
        }
        written = {
            id: issued.id,
            number: issued.number,
            currency: issued.currency,
        };
    } else if (deposit) {
        written = await balanceInvoice(tx, deposit, {
            organizationId,
            bookingId,
            description: `Balance for ${booking.service.name}`,
            cents: take.cents,
            rateBps: rateToBps(booking.service.gstRate?.toString() ?? null),
            code: booking.service.sacCode,
            actorUserId: input.actorUserId,
            payment: paid,
            now,
        });
    } else {
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
                    unitCents: take.cents,
                    rateBps: rateToBps(
                        booking.service.gstRate?.toString() ?? null,
                    ),
                    code: booking.service.sacCode,
                },
            ],
            profile,
            null,
            0,
        );
        const number = await numberFor(
            tx,
            organizationId,
            profile,
            "INVOICE",
            now,
        );
        const created = await tx.invoice.create({
            data: {
                organizationId,
                number,
                kind: "INVOICE",
                source: "BOOKING",
                bookingId,
                contactId: booking.contactId,
                billToName: booking.bookerName,
                billToEmail: booking.bookerEmail,
                currency,
                ...documentColumns(doc),
                issuedAt: now,
                dueAt: now,
                ...paid,
                createdByUserId: input.actorUserId,
            },
            select: { id: true, number: true },
        });
        await writeDocumentLines(tx, organizationId, created.id, doc);
        written = { ...created, currency };
    }

    // Nobody had said how it is paid: it was paid at the desk.
    if (booking.paidWith === null) {
        await tx.booking.update({
            where: { id: booking.id },
            data: { paidWith: "DESK" },
        });
    }
    await tx.bookingEvent.create({
        data: {
            bookingId: booking.id,
            organizationId,
            type: BookingEventType.PaidAtDesk,
            actorUserId: input.actorUserId,
            fromStartAt: booking.startAt,
        },
        select: { id: true },
    });
    return {
        invoiceId: written.id,
        number: written.number,
        amountCents: take.cents,
        currency: written.currency,
        method: input.method,
        changeCents,
        replayed: false,
    };
}

/**
 * The same take, asked again: the booking's latest desk payment, taken
 * moments ago by the same method for the same amount. Its answer is sent
 * again, so a double click never reads as a failure.
 */
function sameTake(
    paper: readonly PaperRow[],
    input: { method: DeskMethod; amountCents: number },
    now: Date,
): PaperRow | null {
    const paid = paper
        .filter((p) => p.status === "PAID")
        .sort(
            (a, b) => (b.paidAt?.getTime() ?? 0) - (a.paidAt?.getTime() ?? 0),
        );
    if (paid.length === 0) return null;
    const last = paid[0];
    if (!last.paidAt) return null;
    const recent = now.getTime() - last.paidAt.getTime() <= REPLAY_MS;
    return recent &&
        last.paymentMethod === input.method &&
        toCents(last.total.toString()) === input.amountCents
        ? last
        : null;
}

/**
 * The rest after a deposit (DEC-023): a supplementary invoice against the
 * deposit's for exactly what is left, on the deposit's paper — a receipt
 * stays a receipt, a tax invoice keeps its place of supply — numbered in
 * its own series, and written PAID with how the desk took it.
 */
async function balanceInvoice(
    tx: Tx,
    original: PaperRow,
    input: {
        organizationId: string;
        bookingId: string;
        description: string;
        cents: number;
        rateBps: number | null;
        code: string | null;
        actorUserId: string | null;
        payment: {
            status: "PAID";
            paidAt: Date;
            paymentMethod: string;
            paymentNote: string;
        };
        now: Date;
    },
): Promise<{ id: string; number: string; currency: string }> {
    const doc = buildCorrection(original, [
        {
            description: input.description,
            quantity: 1,
            unitCents: input.cents,
            rateBps: input.rateBps,
            code: input.code,
            orderItemId: null,
        },
    ]);
    const profile = await loadTaxProfile(tx, input.organizationId);
    const number = await numberFor(
        tx,
        input.organizationId,
        { ...profile, registered: original.sellerGstin !== null },
        "SUPPLEMENTARY",
        input.now,
    );
    const created = await tx.invoice.create({
        data: {
            organizationId: input.organizationId,
            kind: "SUPPLEMENTARY",
            number,
            source: "BOOKING",
            bookingId: input.bookingId,
            relatedInvoiceId: original.id,
            contactId: original.contactId,
            billToName: original.billToName,
            billToEmail: original.billToEmail,
            billToAddress: original.billToAddress,
            billToState: original.billToState,
            billToGstin: original.billToGstin,
            currency: original.currency,
            ...documentColumns(doc),
            issuedAt: input.now,
            dueAt: null,
            ...input.payment,
            createdByUserId: input.actorUserId,
        },
        select: { id: true },
    });
    await writeDocumentLines(tx, input.organizationId, created.id, doc);
    return { id: created.id, number, currency: original.currency };
}
