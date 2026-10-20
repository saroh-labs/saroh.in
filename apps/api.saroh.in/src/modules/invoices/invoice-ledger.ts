import {
    BadRequestException,
    ConflictException,
    NotFoundException,
    UnprocessableEntityException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { toMinor } from "../../common/money";
import type { LedgerActor } from "./invoice-payment-events";
import { paymentRecordedInTx } from "./invoice-payment-events";
import type { BankStatus } from "./invoice-state";
import { CHEQUE_PAYMENT_METHOD, ONLINE_PAYMENT_METHOD } from "./invoice-state";
import { fromCents } from "./totals";

type Tx = Prisma.TransactionClient;

/**
 * The invoice ledger's one write path (DEC-173, U2 #1114).
 *
 * Every payment on an invoice that isn't an order's is an `InvoicePayment`
 * row, and the invoice's `status`, `paidCents` and legacy payment columns
 * are worked out from those rows here, in the writer's transaction, under
 * the invoice's row lock:
 *
 * - **Live money** is the sum of the payments not removed and not bounced.
 *   A cheque still waiting for the bank counts as received.
 * - **Paid in full** (live ≥ total) is PAID, `paidAt` the last live
 *   payment's date; anything less is ISSUED. "Partly paid" is ISSUED with
 *   `paidCents > 0`, derived like Overdue and never stored.
 *
 * Callers: `InvoicePaymentsService` (record, remove, a cheque in the bank
 * or bounced) and, from U3 (#1115), every other path that pays an invoice
 * (the webhook, the desk, a mandate charge, a pack, a plan join). They lock
 * with `lockInvoiceForLedger`, then write through `recordLedgerPaymentInTx`
 * or change a row and call `settleFromLedger`. Nothing else writes
 * `paidCents`, and nothing else sets a non-order invoice PAID.
 */

/** The largest amount an `Int` of paise holds: the ledger's ceiling. */
export const MAX_LEDGER_CENTS = 2_147_483_647;

/** What a ledger write needs to know of its invoice, read under the lock. */
export interface LedgerInvoice {
    id: string;
    organizationId: string;
    status: string;
    kind: string;
    currency: string;
    totalCents: number;
    paidCents: number;
    /** The order it bills, if any: the order is its ledger (ADR-008). */
    orderNumber: string | null;
}

/**
 * Lock the invoice row for a ledger write and read it. FOR NO KEY UPDATE:
 * none of the writes touch a key column, so a payment row's foreign key
 * check (FOR KEY SHARE) doesn't wait on it, while two ledger writes on one
 * invoice queue. Null when the business has no such invoice.
 */
export async function lockInvoiceForLedger(
    tx: Tx,
    organizationId: string,
    invoiceId: string,
): Promise<LedgerInvoice | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Invoice"
        WHERE id = ${invoiceId} AND "organizationId" = ${organizationId}
        FOR NO KEY UPDATE`;
    if (locked.length === 0) return null;
    // Read in a statement of its own, after the lock: a write that held it
    // before us has committed, and its figures are seen now.
    const row = await tx.invoice.findFirst({
        where: { id: invoiceId, organizationId },
        select: {
            id: true,
            organizationId: true,
            status: true,
            kind: true,
            currency: true,
            total: true,
            paidCents: true,
            order: { select: { orderId: true } },
        },
    });
    if (!row) return null;
    return {
        id: row.id,
        organizationId: row.organizationId,
        status: row.status,
        kind: row.kind,
        currency: row.currency,
        totalCents: toMinor(row.total),
        paidCents: row.paidCents,
        orderNumber: row.order?.orderId ?? null,
    };
}

/** As `lockInvoiceForLedger`, and another business's invoice is a 404. */
export async function lockInvoiceForLedgerOr404(
    tx: Tx,
    organizationId: string,
    invoiceId: string,
): Promise<LedgerInvoice> {
    const invoice = await lockInvoiceForLedger(tx, organizationId, invoiceId);
    if (!invoice) throw new NotFoundException("Invoice not found");
    return invoice;
}

/**
 * The ledger takes payments for an invoice's own paper only: an order's
 * invoice is paid on the order (ADR-008), and a credit note is never paid.
 */
export function assertLedgerPaper(invoice: LedgerInvoice): void {
    if (invoice.orderNumber) {
        throw new ConflictException(
            `This invoice is for order ${invoice.orderNumber}, so it is not paid here. Use the order.`,
        );
    }
    if (invoice.kind === "CREDIT_NOTE") {
        throw new ConflictException("A credit note is not paid here.");
    }
}

/** What is left to pay on a locked invoice, in paise. Never below 0. */
export function ledgerLeftCents(invoice: LedgerInvoice): number {
    return Math.max(0, invoice.totalCents - invoice.paidCents);
}

/** One ledger row, as the settle rules read it. */
export interface LedgerRow {
    amountCents: number;
    method: string;
    reference: string | null;
    note: string | null;
    receivedAt: Date;
    createdAt: Date;
    bankStatus: string | null;
    removedAt: Date | null;
}

/** What the rows say about their invoice. */
export interface Settled {
    /** The live sum: not removed, not bounced. */
    paidCents: number;
    /** Paid in full. */
    paid: boolean;
    /** The last live payment, by when it came in: the legacy columns' source. */
    last: LedgerRow | null;
}

/** A payment that counts: not removed, and not a bounced cheque. */
export function isLive(row: Pick<LedgerRow, "removedAt" | "bankStatus">) {
    return row.removedAt === null && row.bankStatus !== "BOUNCED";
}

/**
 * The settle rules, pure (`invoice-ledger.spec.ts`). Paid in full when the
 * live sum reaches the total; a ₹0 invoice is never settled here, since the
 * ledger takes no payment on one.
 */
export function settle(
    totalCents: number,
    rows: readonly LedgerRow[],
): Settled {
    const live = rows.filter(isLive);
    const paidCents = live.reduce((sum, r) => sum + r.amountCents, 0);
    const last =
        live.reduce<LedgerRow | null>((latest, r) => {
            if (!latest) return r;
            const byReceived =
                r.receivedAt.getTime() - latest.receivedAt.getTime();
            if (byReceived !== 0) return byReceived > 0 ? r : latest;
            return r.createdAt.getTime() >= latest.createdAt.getTime()
                ? r
                : latest;
        }, null) ?? null;
    return { paidCents, paid: totalCents > 0 && paidCents >= totalCents, last };
}

/**
 * Work the invoice's status and `paidCents` out from its rows and write
 * them, under the caller's lock. Only an ISSUED or PAID invoice moves
 * between the two; any other keeps its status (a credited invoice's rows
 * are refused before they change).
 *
 * The legacy columns (`paidAt`, `paymentMethod`, `paymentReference`,
 * `paymentNote`) are written from the last live payment while the invoice
 * is PAID, and cleared when it is owed again, so the readers that take them
 * to mean "paid, and how" keep that meaning (DEC-173 decision 4). The pay
 * link is left as it is, as a hand payment always left it: once paid it
 * shows the paper, and once owed again it takes money.
 */
export async function settleFromLedger(
    tx: Tx,
    invoice: LedgerInvoice,
): Promise<Settled> {
    const rows = await tx.invoicePayment.findMany({
        where: {
            invoiceId: invoice.id,
            organizationId: invoice.organizationId,
        },
        select: {
            amountCents: true,
            method: true,
            reference: true,
            note: true,
            receivedAt: true,
            createdAt: true,
            bankStatus: true,
            removedAt: true,
        },
    });
    const settled = settle(invoice.totalCents, rows);
    if (settled.paidCents > MAX_LEDGER_CENTS) {
        throw new BadRequestException({
            message: "That is more than one invoice's payments can hold.",
            details: { field: "amount" },
        });
    }
    const moves = invoice.status === "ISSUED" || invoice.status === "PAID";
    const status = moves ? (settled.paid ? "PAID" : "ISSUED") : invoice.status;
    const last = status === "PAID" ? settled.last : null;
    await tx.invoice.update({
        where: { id: invoice.id },
        data: {
            paidCents: settled.paidCents,
            ...(moves
                ? {
                      status,
                      paidAt: last?.receivedAt ?? null,
                      paymentMethod: last?.method ?? null,
                      paymentReference: last?.reference ?? null,
                      paymentNote: last?.note ?? null,
                  }
                : {}),
        },
    });
    invoice.paidCents = settled.paidCents;
    invoice.status = status;
    return settled;
}

/** A payment to write: everything but who the invoice is. */
export interface LedgerPaymentInput {
    /** Integer paise, above 0. */
    amountCents: number;
    method: string;
    reference?: string | null;
    note?: string | null;
    receivedAt: Date;
    chequeNumber?: string | null;
    chequeBank?: string | null;
    /** The online payment it came from (ONLINE only): one row per intent. */
    paymentIntentId?: string | null;
    actor: LedgerActor;
}

/**
 * Write one payment on a locked invoice and settle it. Refuses what the
 * ledger never takes, whoever the caller: an order's invoice or a credit
 * note, an invoice not ISSUED (a PAID one takes nothing more), an amount of
 * nothing, and more than is left (409/422 with `leftToPay`; advances are
 * Phase 2). A cheque starts WAITING, which counts as received.
 *
 * Then the payment-recorded event (`paymentRecordedInTx`): its audit row
 * on the invoice's history, and the hook U5's receipt hangs from.
 */
export async function recordLedgerPaymentInTx(
    tx: Tx,
    invoice: LedgerInvoice,
    input: LedgerPaymentInput,
): Promise<{ paymentId: string; settled: Settled }> {
    assertLedgerPaper(invoice);
    if (invoice.status !== "ISSUED") {
        throw new ConflictException(notOwed(invoice.status));
    }
    const left = ledgerLeftCents(invoice);
    if (left === 0) {
        throw new ConflictException("Nothing is left to pay on this invoice.");
    }
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
        throw new BadRequestException({
            message: "Enter an amount above 0.",
            details: { field: "amount" },
        });
    }
    if (input.amountCents > left) {
        throw new UnprocessableEntityException({
            message: `That is more than what is left to pay (${fromCents(left)}).`,
            details: {
                field: "amount",
                leftToPay: fromCents(left),
                amount: fromCents(input.amountCents),
            },
        });
    }
    const cheque = input.method === CHEQUE_PAYMENT_METHOD;
    const waiting: BankStatus = "WAITING";
    const payment = await tx.invoicePayment.create({
        data: {
            organizationId: invoice.organizationId,
            invoiceId: invoice.id,
            amountCents: input.amountCents,
            currency: invoice.currency,
            method: input.method,
            reference: input.reference ?? null,
            note: input.note ?? null,
            receivedAt: input.receivedAt,
            chequeNumber: cheque ? (input.chequeNumber ?? null) : null,
            chequeBank: cheque ? (input.chequeBank ?? null) : null,
            bankStatus: cheque ? waiting : null,
            recordedById: input.actor.userId,
            paymentIntentId:
                input.method === ONLINE_PAYMENT_METHOD
                    ? (input.paymentIntentId ?? null)
                    : null,
        },
        select: { id: true },
    });
    const settled = await settleFromLedger(tx, invoice);
    await paymentRecordedInTx(tx, {
        organizationId: invoice.organizationId,
        invoiceId: invoice.id,
        paymentId: payment.id,
        amountCents: input.amountCents,
        currency: invoice.currency,
        method: input.method,
        paidInFull: settled.paid,
        actor: input.actor,
    });
    return { paymentId: payment.id, settled };
}

/** Why an invoice that isn't ISSUED takes no payment. */
export function notOwed(status: string): string {
    switch (status) {
        case "DRAFT":
            return "Issue the invoice before it is paid.";
        case "PAID":
            return "This invoice is already paid.";
        case "CREDITED":
            return "This invoice was credited.";
        default:
            return "A void invoice cannot be paid.";
    }
}

/** The audit actor of a payment Saroh recorded as it came in online. */
export const ONLINE_LEDGER_ACTOR = "system:online-payment";

/**
 * Why an online payment wasn't applied, when the invoice was ISSUED but had
 * less left to pay than the payment brought (part of it was paid by hand
 * while the checkout was open). Recorded on the CAPTURED_NEEDS_REFUND
 * attempt as its `invoiceStatus`, so Home names it.
 */
export const MORE_THAN_LEFT = "MORE_THAN_LEFT";

/**
 * Money that came in online for an invoice (DEC-173, U3 #1115): one
 * provider payment, through its intent. The pay link, an autopay charge, a
 * pack or a plan bought online and a pay-now hold all bring it here.
 */
export interface OnlinePayment {
    /** The intent it came through: one ledger row per intent, ever. */
    paymentIntentId: string;
    /** The intent's amount, in paise: what the provider took. */
    amountCents: number;
    /** The provider's payment reference. */
    reference: string | null;
    /** "Paid online through Razorpay". */
    note: string;
    receivedAt: Date;
}

/**
 * What became of an online payment. Applied: written to the ledger (or, on
 * an order's paper, stamped paid), `paid` when the invoice is now paid in
 * full, `replayed` when this intent's payment was already written. Not
 * applied: `found` says why (the invoice's status, MISSING, or
 * {@link MORE_THAN_LEFT}); the caller records the capture as owed back.
 */
export type OnlineOutcome =
    | { applied: true; paid: boolean; replayed: boolean }
    | { applied: false; found: string };

/**
 * Apply an online payment to its invoice, under the invoice's ledger lock.
 * The caller holds the intent's lock (intent → invoice, the lock order).
 *
 * - **Once per intent:** a payment whose intent already has its ledger row
 *   is a replay, applied already, and nothing is written (the
 *   `paymentIntentId` unique index holds it even if two callers race).
 * - **Only an ISSUED invoice takes it.** Paid by hand, void or credited
 *   meanwhile: not applied, so the money is owed back, as before.
 * - **Never more than is left:** a payment for more than what is left (part
 *   was recorded by hand while the checkout was open) is not applied either,
 *   rather than split; the whole capture is owed back (`MORE_THAN_LEFT`).
 * - **An order's paper** (ADR-008) has the order as its ledger: it is
 *   stamped paid, as it always was, with no ledger row.
 * - Otherwise one ONLINE row for the intent's amount, through
 *   {@link recordLedgerPaymentInTx}: PAID when it settles what was left,
 *   still ISSUED (partly paid) when it doesn't.
 */
export async function recordOnlinePaymentInTx(
    tx: Tx,
    organizationId: string,
    invoiceId: string,
    payment: OnlinePayment,
): Promise<OnlineOutcome> {
    const invoice = await lockInvoiceForLedger(tx, organizationId, invoiceId);
    if (!invoice) return { applied: false, found: "MISSING" };
    const already = await tx.invoicePayment.findUnique({
        where: { paymentIntentId: payment.paymentIntentId },
        select: { id: true },
    });
    if (already) {
        return {
            applied: true,
            paid: invoice.status === "PAID",
            replayed: true,
        };
    }
    if (invoice.status !== "ISSUED") {
        return { applied: false, found: invoice.status };
    }
    if (invoice.orderNumber) {
        await stampOrderPaperPaidInTx(tx, invoice, {
            paidAt: payment.receivedAt,
            method: ONLINE_PAYMENT_METHOD,
            reference: payment.reference,
            note: payment.note,
        });
        return { applied: true, paid: true, replayed: false };
    }
    if (payment.amountCents > ledgerLeftCents(invoice)) {
        return { applied: false, found: MORE_THAN_LEFT };
    }
    const { settled } = await recordLedgerPaymentInTx(tx, invoice, {
        amountCents: payment.amountCents,
        method: ONLINE_PAYMENT_METHOD,
        reference: payment.reference,
        note: payment.note,
        receivedAt: payment.receivedAt,
        paymentIntentId: payment.paymentIntentId,
        actor: { userId: null, systemActor: ONLINE_LEDGER_ACTOR },
    });
    return { applied: true, paid: settled.paid, replayed: false };
}

/**
 * An order's paper paid in full (ADR-008): the order is its ledger, so the
 * invoice is stamped PAID with how, and no ledger row is written. The one
 * place outside {@link settleFromLedger} that sets an invoice PAID, for
 * order paper only (`invoice-ledger.guard.spec.ts`). The caller holds the
 * invoice's lock.
 */
export async function stampOrderPaperPaidInTx(
    tx: Tx,
    invoice: Pick<LedgerInvoice, "id" | "orderNumber">,
    paid: {
        paidAt: Date;
        method: string;
        reference: string | null;
        note: string | null;
    },
): Promise<void> {
    if (!invoice.orderNumber) {
        throw new Error(
            "Only an order's paper is stamped paid; every other invoice is paid through the ledger.",
        );
    }
    await tx.invoice.update({
        where: { id: invoice.id },
        data: {
            status: "PAID",
            paidAt: paid.paidAt,
            paymentMethod: paid.method,
            paymentReference: paid.reference,
            paymentNote: paid.note,
        },
    });
}

/**
 * A draft paid online (a pay-now hold, a pack or a plan bought online),
 * which its writer has just numbered and issued in this transaction: its
 * payment goes on the ledger like any other online payment, and must
 * settle it, since the intent was made for the draft's own total. Anything
 * else is a broken invariant, and the transaction is rolled back rather
 * than leave a paid draft half written.
 */
export async function payIssuedDraftOnlineInTx(
    tx: Tx,
    organizationId: string,
    invoiceId: string,
    payment: OnlinePayment,
): Promise<void> {
    const outcome = await recordOnlinePaymentInTx(
        tx,
        organizationId,
        invoiceId,
        payment,
    );
    if (!outcome.applied || !outcome.paid) {
        throw new Error(
            `The online payment for draft invoice ${invoiceId} did not settle it (${
                outcome.applied ? "part paid" : outcome.found
            }).`,
        );
    }
}
