import type { Prisma } from "@saroh/database";

import { AuditAction, auditMetadata } from "../audit/audit.service";
import { cancelReceiptInTx, enqueueReceiptInTx } from "./invoice-receipt";
import { CHEQUE_PAYMENT_METHOD } from "./invoice-state";
import { fromCents } from "./totals";

type Tx = Prisma.TransactionClient;

/**
 * What happens on an invoice's ledger, as events (DEC-173, U2 #1114): each
 * is an audit row on the invoice (`targetType: "invoice"`), written in the
 * ledger write's own transaction, so the history never shows a payment
 * that didn't commit and never misses one that did.
 *
 * Metadata is ids, amounts and the method only: never the reference, the
 * note, the cheque's number or bank, or a person's detail.
 */

/** Who wrote to the ledger: a person, or Saroh (the webhook, a job). */
export interface LedgerActor {
    /** The person; null when Saroh recorded it. */
    userId: string | null;
    /** For a write Saroh made: `system:<what>`, the audit row's actor. */
    systemActor?: string;
    /** The acting context's role key, so an operator's write is marked. */
    roleKey?: string;
}

/** The audit actor of a write Saroh made with none named. */
export const INVOICE_LEDGER_ACTOR = "system:invoice-ledger";

/**
 * How long after a payment is recorded its receipt may go (DEC-173, owner
 * 20 Oct): the app's Undo is 10 seconds, and a payment removed by Undo
 * sends nothing, so the receipt waits a little past it.
 */
export const RECEIPT_HOLD_MS = 15_000;

export interface PaymentRecordedEvent {
    organizationId: string;
    invoiceId: string;
    paymentId: string;
    amountCents: number;
    currency: string;
    method: string;
    /** The payment settled the invoice in full. */
    paidInFull: boolean;
    actor: LedgerActor;
}

/**
 * A payment was recorded: noted on the invoice's history, and its receipt
 * queued (DEC-173, owner 20 Oct; U5 #1117).
 *
 * Every recorded payment, full or part, by hand, online or by autopay,
 * sends its receipt to the customer through the business's own email
 * provider, with no tick box: an `invoice.receipt` job in this
 * transaction (the outbox, `backend-jobs.md`) carrying `paymentId`, due
 * at `now + RECEIPT_HOLD_MS`, so Undo can take it back first. Its handler
 * re-reads the payment and sends nothing for one removed meanwhile. It is
 * queued only when it can go (`receiptCanGo`): with no provider connected,
 * nothing is queued and nothing is sent.
 *
 * A cheque is the exception: it waits for the bank, and its receipt goes
 * when it is marked as in the bank (`paymentChangedInTx`).
 */
export async function paymentRecordedInTx(
    tx: Tx,
    event: PaymentRecordedEvent,
    now: Date = new Date(),
): Promise<void> {
    await ledgerAuditInTx(tx, AuditAction.InvoicePaymentRecorded, event, {
        paymentId: event.paymentId,
        amount: fromCents(event.amountCents),
        currency: event.currency,
        method: event.method,
        paidInFull: event.paidInFull,
    });
    if (event.method !== CHEQUE_PAYMENT_METHOD) {
        await enqueueReceiptInTx(tx, {
            organizationId: event.organizationId,
            invoiceId: event.invoiceId,
            paymentId: event.paymentId,
            runAt: new Date(now.getTime() + RECEIPT_HOLD_MS),
        });
    }
}

/**
 * A payment removed by mistake (soft), a cheque in the bank, or bounced:
 * noted on the invoice's history. A removed payment's receipt, if it is
 * still waiting, is taken back. A cheque in the bank sends its receipt
 * (there is no Undo for it, so it goes at once).
 */
export async function paymentChangedInTx(
    tx: Tx,
    action:
        | typeof AuditAction.InvoicePaymentRemoved
        | typeof AuditAction.InvoiceChequeCleared
        | typeof AuditAction.InvoiceChequeBounced,
    event: Omit<PaymentRecordedEvent, "paidInFull"> & {
        /** Whether the invoice is still paid in full after it. */
        paidInFull: boolean;
    },
): Promise<void> {
    await ledgerAuditInTx(tx, action, event, {
        paymentId: event.paymentId,
        amount: fromCents(event.amountCents),
        currency: event.currency,
        method: event.method,
        paidInFull: event.paidInFull,
    });
    if (action === AuditAction.InvoicePaymentRemoved) {
        await cancelReceiptInTx(tx, event.organizationId, event.paymentId);
    } else if (action === AuditAction.InvoiceChequeCleared) {
        await enqueueReceiptInTx(tx, {
            organizationId: event.organizationId,
            invoiceId: event.invoiceId,
            paymentId: event.paymentId,
            runAt: new Date(),
        });
    }
}

async function ledgerAuditInTx(
    tx: Tx,
    action: AuditAction,
    event: { organizationId: string; invoiceId: string; actor: LedgerActor },
    metadata: Prisma.InputJsonObject,
): Promise<void> {
    await tx.auditEvent.create({
        data: {
            action,
            actorUserId:
                event.actor.userId ??
                event.actor.systemActor ??
                INVOICE_LEDGER_ACTOR,
            organizationId: event.organizationId,
            targetType: "invoice",
            targetId: event.invoiceId,
            outcome: "SUCCESS",
            metadata: auditMetadata(event.actor.roleKey, metadata),
        },
    });
}
