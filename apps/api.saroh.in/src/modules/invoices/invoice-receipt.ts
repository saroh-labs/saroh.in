import type { Prisma } from "@saroh/database";

import { isReservedContactEmail } from "../contacts/contact-email";

type Tx = Prisma.TransactionClient;

/**
 * Enqueueing and cancelling a payment's receipt (DEC-173, owner 20 Oct):
 * every payment recorded on an invoice's ledger, full or part, by hand,
 * online or by autopay, is followed by a receipt email to the customer
 * through the business's own email provider. Plain functions on the
 * writer's transaction (the outbox, DEC-008), so the ledger's writers need
 * no Nest wiring. The handler is `invoice-receipt.handler.ts`.
 *
 * - It waits out the Undo window (`RECEIPT_HOLD_MS`): a payment removed by
 *   Undo cancels its job here, and the handler, which re-reads the payment,
 *   sends nothing for one removed anyway.
 * - A cheque's receipt goes when it is marked as in the bank, not while it
 *   waits: a cheque that bounces was never paid.
 * - It is enqueued only when it can go (the jobs pattern: never enqueue a
 *   job the handler will no-op on): the business's email provider is
 *   connected, the customer has an address, and they haven't turned email
 *   off. Without a provider nothing is sent; Saroh's own address never
 *   carries it (DEC-086 reversed, DEC-091).
 */

/** The `type` the handler is registered under. */
export const INVOICE_RECEIPT_TYPE = "invoice.receipt";

/** What `invoice.receipt` carries: the payment, never the words. */
export interface InvoiceReceiptPayload {
    paymentId: string;
}

/** The payment a receipt job is for, or null for a payload that isn't one. */
export function receiptPaymentIdOf(payload: unknown): string | null {
    const id = (payload as { paymentId?: unknown } | null)?.paymentId;
    return typeof id === "string" && id !== "" ? id : null;
}

/**
 * Whether a receipt for this invoice can go now: the business's email
 * provider is connected, the bill-to has an address (the one
 * `CommunicationsService.transactionalAddress` would use: the bill-to
 * email unless it is a placeholder, else the contact's active site
 * account's), and they haven't turned email off.
 */
export async function receiptCanGo(
    tx: Pick<
        Tx,
        "communicationProvider" | "invoice" | "customerAccount" | "consent"
    >,
    organizationId: string,
    invoiceId: string,
): Promise<boolean> {
    const provider = await tx.communicationProvider.findUnique({
        where: { organizationId_channel: { organizationId, channel: "EMAIL" } },
        select: { status: true },
    });
    if (provider?.status !== "CONNECTED") return false;
    const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, organizationId },
        select: { billToEmail: true, contactId: true },
    });
    if (!invoice) return false;
    const billTo = invoice.billToEmail?.trim();
    let reachable = Boolean(billTo) && !isReservedContactEmail(billTo);
    if (!reachable && invoice.contactId) {
        reachable =
            (await tx.customerAccount.count({
                where: {
                    organizationId,
                    contactId: invoice.contactId,
                    status: "ACTIVE",
                },
            })) > 0;
    }
    if (!reachable) return false;
    if (!invoice.contactId) return true;
    const consent = await tx.consent.findUnique({
        where: {
            contactId_channel: {
                contactId: invoice.contactId,
                channel: "EMAIL",
            },
        },
        select: { status: true },
    });
    return consent?.status !== "REVOKED";
}

/**
 * Queue a payment's receipt on the writer's transaction, to run at
 * `runAt`, if it can go ({@link receiptCanGo}). Returns whether one was
 * queued.
 */
export async function enqueueReceiptInTx(
    tx: Tx,
    input: {
        organizationId: string;
        invoiceId: string;
        paymentId: string;
        runAt: Date;
    },
): Promise<boolean> {
    if (!(await receiptCanGo(tx, input.organizationId, input.invoiceId))) {
        return false;
    }
    const payload: InvoiceReceiptPayload = { paymentId: input.paymentId };
    await tx.job.create({
        data: {
            organizationId: input.organizationId,
            type: INVOICE_RECEIPT_TYPE,
            payload: payload as unknown as Prisma.InputJsonObject,
            runAt: input.runAt,
        },
        select: { id: true },
    });
    return true;
}

/**
 * A payment removed (Undo, or by mistake later): take back its receipt if
 * it hasn't gone. Returns whether one was waiting.
 */
export async function cancelReceiptInTx(
    tx: Pick<Tx, "job">,
    organizationId: string,
    paymentId: string,
): Promise<boolean> {
    const { count } = await tx.job.deleteMany({
        where: {
            organizationId,
            type: INVOICE_RECEIPT_TYPE,
            status: "PENDING",
            payload: { path: ["paymentId"], equals: paymentId },
        },
    });
    return count > 0;
}
