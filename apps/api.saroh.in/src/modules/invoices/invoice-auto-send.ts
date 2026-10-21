import type { Prisma } from "@saroh/database";

import { noticeOn } from "../communications/notice-settings";

type Tx = Prisma.TransactionClient;

/**
 * Enqueueing a membership's renewal invoice to be sent (automatic notices
 * U10, DEC-174 R3): the renewal job issues it, and `invoice.auto-send`
 * sends it through the invoice's own send path as the business, so nobody
 * has to press Send. A plain function on the renewal's transaction (the
 * outbox, DEC-008), so the subscriptions service needs no Nest wiring for
 * it. The handler is `invoice-auto-send.handler.ts`.
 *
 * - Only a renewal's invoice (`source: SUBSCRIPTION`, issued by the job).
 *   An invoice made by hand, or at the desk, keeps its Send button.
 * - Not one that live autopay will charge: the caller leaves it out when
 *   its charge was queued, and the receipt (DEC-173) tells the customer
 *   once the charge goes through.
 * - Not when the business turned "Renewal invoices" off (`noticeOn`,
 *   asked here on the renewal's transaction and again when it runs).
 */

/** The `type` the handler is registered under. */
export const INVOICE_AUTO_SEND_TYPE = "invoice.auto-send";

/** Why it is sent automatically: only a renewal, so far. */
export type AutoSendReason = "RENEWAL";

/** What `invoice.auto-send` carries: the invoice, never the words. */
export interface InvoiceAutoSendPayload {
    invoiceId: string;
    reason: AutoSendReason;
}

/** The payload, or null for one that isn't. */
export function autoSendPayloadOf(
    payload: unknown,
): InvoiceAutoSendPayload | null {
    const p = payload as Partial<InvoiceAutoSendPayload> | null;
    if (typeof p?.invoiceId !== "string" || p.invoiceId === "") return null;
    return p.reason === "RENEWAL"
        ? { invoiceId: p.invoiceId, reason: p.reason }
        : null;
}

/**
 * Queue a renewal invoice's send on the renewal's transaction, unless the
 * business turned renewal invoices off. Returns whether one was queued.
 */
export async function enqueueRenewalSendInTx(
    tx: Pick<Tx, "job" | "customerNoticeSetting">,
    input: { organizationId: string; invoiceId: string; runAt?: Date },
): Promise<boolean> {
    if (!(await noticeOn(tx, input.organizationId, "RENEWAL_INVOICE"))) {
        return false;
    }
    const payload: InvoiceAutoSendPayload = {
        invoiceId: input.invoiceId,
        reason: "RENEWAL",
    };
    await tx.job.create({
        data: {
            organizationId: input.organizationId,
            type: INVOICE_AUTO_SEND_TYPE,
            payload: payload as unknown as Prisma.InputJsonObject,
            ...(input.runAt ? { runAt: input.runAt } : {}),
        },
        select: { id: true },
    });
    return true;
}
