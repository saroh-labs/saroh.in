import type { Prisma } from "@saroh/database";

import { AuditAction, auditMetadata } from "../audit/audit.service";
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
 * A payment was recorded: noted on the invoice's history.
 *
 * **The receipt hook (U5, #1117).** The owner decided (20 Oct) that every
 * recorded payment, full or part, any method, online too, sends its
 * receipt to the customer through the business's own email provider, with
 * no tick box, once the Undo window has passed. U5 adds that here, in this
 * transaction: a `Job` (transactional outbox, `backend-jobs.md`) of its
 * receipt type carrying `paymentId`, with
 * `runAt = now + RECEIPT_HOLD_MS`. Its handler re-reads the payment and
 * sends nothing when it was removed meanwhile (Undo) or no provider is
 * connected. Nothing is enqueued here yet: a job no handler sends would be
 * dead-lettered, and one whose handler does nothing is refused by the jobs
 * pattern ("never enqueue a job the handler will no-op on").
 */
export async function paymentRecordedInTx(
    tx: Tx,
    event: PaymentRecordedEvent,
): Promise<void> {
    await ledgerAuditInTx(tx, AuditAction.InvoicePaymentRecorded, event, {
        paymentId: event.paymentId,
        amount: fromCents(event.amountCents),
        currency: event.currency,
        method: event.method,
        paidInFull: event.paidInFull,
    });
}

/** A payment removed by mistake (soft), a cheque in the bank, or bounced. */
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
