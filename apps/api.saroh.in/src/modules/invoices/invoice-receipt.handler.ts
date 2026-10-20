import { Injectable, Logger } from "@nestjs/common";
import type { Job, Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { toMinor } from "../../common/money";
import { dayWords, moneyWordsMinor } from "../../common/words-format";
import type { TransactionalResult } from "../communications/communications.service";
import { CommunicationsService } from "../communications/communications.service";
import { renderInvoiceReceipt } from "../communications/transactional";
import { isLive } from "./invoice-ledger";
import { receiptCanGo, receiptPaymentIdOf } from "./invoice-receipt";
import { firstNameOf, paymentMethodWords } from "./invoice-share-words";
import { CHEQUE_PAYMENT_METHOD, paidSoFarCents } from "./invoice-state";

type Tx = Prisma.TransactionClient;

/** Home's default zone, for a business that never set one. */
const DEFAULT_ZONE = "Asia/Kolkata";

/**
 * Queue the receipt for one payment on the caller's transaction, through
 * the business's own provider (`queueTransactional`, which refuses with no
 * provider or no address, and suppresses it when the customer turned email
 * off). The figures are the invoice's as it stands now: this payment, what
 * is paid so far and what is left. Null when the payment isn't there.
 *
 * The caller holds the payment's row lock and records the Message on it.
 */
export async function queueReceiptInTx(
    tx: Tx,
    comms: CommunicationsService,
    input: {
        organizationId: string;
        paymentId: string;
        createdByUserId: string | null;
    },
): Promise<TransactionalResult | null> {
    const payment = await tx.invoicePayment.findFirst({
        where: { id: input.paymentId, organizationId: input.organizationId },
        select: {
            amountCents: true,
            currency: true,
            method: true,
            receivedAt: true,
            invoice: {
                select: {
                    id: true,
                    number: true,
                    status: true,
                    total: true,
                    paidCents: true,
                    billToName: true,
                    contact: { select: { firstName: true, lastName: true } },
                },
            },
        },
    });
    if (!payment) return null;
    const [org, profile] = await Promise.all([
        tx.organization.findUnique({
            where: { id: input.organizationId },
            select: { name: true },
        }),
        tx.businessProfile.findUnique({
            where: { organizationId: input.organizationId },
            select: { timezone: true },
        }),
    ]);
    const invoice = payment.invoice;
    const totalCents = toMinor(invoice.total);
    const paidCents = paidSoFarCents(invoice);
    const leftCents = Math.max(0, totalCents - paidCents);
    const money = (cents: number) => moneyWordsMinor(cents, payment.currency);
    const name =
        invoice.billToName ??
        [invoice.contact?.firstName, invoice.contact?.lastName]
            .filter(Boolean)
            .join(" ");
    return comms.queueTransactional(tx, input.organizationId, {
        template: "INVOICE_PAYMENT_RECEIVED",
        rendered: renderInvoiceReceipt({
            business: org?.name ?? "",
            firstName: firstNameOf(name),
            number: invoice.number ?? "",
            amount: money(payment.amountCents),
            method: paymentMethodWords(payment.method),
            receivedOn: dayWords(
                payment.receivedAt,
                profile?.timezone ?? DEFAULT_ZONE,
                { year: true },
            ),
            paidSoFar: money(paidCents),
            total: money(totalCents),
            leftToPay: money(leftCents),
            paidInFull: leftCents === 0,
        }),
        recipient: { kind: "INVOICE_BILL_TO", invoiceId: invoice.id },
        invoiceId: invoice.id,
        // Its PDF goes with it (DEC-083) where the provider takes attachments.
        attachInvoicePdf: true,
        createdByUserId: input.createdByUserId,
    });
}

/**
 * `invoice.receipt` (DEC-173, owner 20 Oct): email one payment's receipt
 * once the Undo window has passed (`invoice-receipt.ts` queues it).
 *
 * Idempotent: the payment's row is locked and `receiptMessageId` checked
 * first, and the Message it queues is recorded on the payment in the same
 * transaction, so a job run twice (a retry, a reclaimed lease) emails
 * once. It sends nothing, and completes, when the payment is gone, was
 * removed (Undo) or bounced, already has its receipt, or the business's
 * provider was disconnected or the customer turned email off meanwhile.
 */
@Injectable()
export class InvoiceReceiptHandler {
    private readonly logger = new Logger(InvoiceReceiptHandler.name);

    constructor(private readonly comms: CommunicationsService) {}

    readonly handle = async (job: Job): Promise<void> => {
        const paymentId = receiptPaymentIdOf(job.payload);
        if (!paymentId) {
            this.logger.warn(`invoice.receipt ${job.id} has no payment`);
            return;
        }
        await prisma.$transaction(async (tx) => {
            const locked = await tx.$queryRaw<{ id: string }[]>`
                SELECT id FROM "InvoicePayment" WHERE id = ${paymentId} FOR UPDATE`;
            if (locked.length === 0) return;
            const payment = await tx.invoicePayment.findUnique({
                where: { id: paymentId },
                select: {
                    organizationId: true,
                    invoiceId: true,
                    method: true,
                    removedAt: true,
                    bankStatus: true,
                    receiptMessageId: true,
                    invoice: { select: { status: true } },
                },
            });
            if (!payment || payment.receiptMessageId || !isLive(payment)) {
                return;
            }
            // A cheque's receipt waits for the bank, and a credited or void
            // invoice sends no "paid" receipt (#5, #9).
            if (
                (payment.method === CHEQUE_PAYMENT_METHOD &&
                    payment.bankStatus === "WAITING") ||
                (payment.invoice.status !== "ISSUED" &&
                    payment.invoice.status !== "PAID")
            ) {
                return;
            }
            if (
                !(await receiptCanGo(
                    tx,
                    payment.organizationId,
                    payment.invoiceId,
                ))
            ) {
                return;
            }
            const queued = await queueReceiptInTx(tx, this.comms, {
                organizationId: payment.organizationId,
                paymentId,
                createdByUserId: null,
            });
            if (!queued) return;
            await tx.invoicePayment.update({
                where: { id: paymentId },
                data: { receiptMessageId: queued.id },
            });
        });
    };
}
