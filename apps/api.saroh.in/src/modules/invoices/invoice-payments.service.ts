import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { prismaErrorCode } from "../../common/prisma-errors";
import type { OrganizationContext } from "../../common/types/organization-context";
import { AuditAction } from "../audit/audit.service";
import { authorize } from "../organizations/organization-policy";
import {
    autopayChargeInProgress,
    chargeUnderWayOn,
} from "../payments/charge-under-way";
import {
    assertLedgerPaper,
    ledgerLeftCents,
    lockInvoiceForLedgerOr404,
    MAX_LEDGER_CENTS,
    recordLedgerPaymentInTx,
    settleFromLedger,
} from "./invoice-ledger";
import type { LedgerActor } from "./invoice-payment-events";
import { paymentChangedInTx } from "./invoice-payment-events";
import type {
    ChequeBouncedDto,
    ChequeClearedDto,
    RecordPaymentDto,
    RemovePaymentDto,
} from "./invoice-payments.dto";
import type { BankStatus } from "./invoice-state";
import { CHEQUE_PAYMENT_METHOD, ONLINE_PAYMENT_METHOD } from "./invoice-state";
import type { InvoiceViewModel } from "./serialize";
import { INVOICE_DETAIL_SELECT, serializeInvoice } from "./serialize";
import { toCents } from "./totals";

type Tx = Prisma.TransactionClient;

/** How far ahead a date may be, for a phone a time zone ahead of the API. */
const FUTURE_SLACK_MS = 24 * 60 * 60 * 1000;

/** The reason a payment is removed with when none is given. */
export const DEFAULT_REMOVE_REASON = "Recorded by mistake";

/** The invoice after a payment was recorded, and which payment it was. */
export type RecordedPaymentView = InvoiceViewModel & {
    recorded: {
        /** The payment written, or the one a retry matched: what Undo removes. */
        paymentId: string;
        /**
         * A retry of a record already made (the same idempotency key):
         * nothing new was written. The app says "Already recorded" and
         * offers no Undo.
         */
        replayed: boolean;
    };
};

function fieldError(message: string, field: string): never {
    throw new BadRequestException({ message, details: { field } });
}

/** A date from the client, never further ahead than a day. */
function dateOf(value: string | undefined, now: Date, field: string): Date {
    if (!value) return now;
    const at = new Date(value);
    if (at.getTime() > now.getTime() + FUTURE_SLACK_MS) {
        fieldError("That date is in the future.", field);
    }
    return at;
}

const PAYMENT_SELECT = {
    id: true,
    amountCents: true,
    currency: true,
    method: true,
    receivedAt: true,
    bankStatus: true,
    removedAt: true,
    clearedAt: true,
} as const;

/** Words for a cheque that is in the bank, or was, when asked to bounce. */
export const CHEQUE_ALREADY_BOUNCED = "This cheque already bounced.";

/**
 * Payments on an invoice, recorded by hand (DEC-173, U2 #1114): part
 * payments and cheques, a payment removed by mistake, and a cheque marked
 * in the bank or bounced. Every write locks the invoice, changes the
 * ledger and settles the invoice from it in one transaction
 * (`invoice-ledger.ts`), and writes its event to the invoice's history.
 *
 * Who may: `invoice:write` on every route, the check Record payment has
 * always made: money follows permissions, never a role name (DEC-098), and
 * a Member, who holds no money permission, is refused.
 */
@Injectable()
export class InvoicePaymentsService {
    async record(
        ctx: OrganizationContext,
        invoiceId: string,
        dto: RecordPaymentDto,
    ): Promise<RecordedPaymentView> {
        authorize(ctx, "invoice:write");
        const now = new Date();
        const amountCents =
            dto.amount !== undefined ? toCents(dto.amount) : undefined;
        if (amountCents !== undefined && amountCents <= 0) {
            fieldError("Enter an amount above 0.", "amount");
        }
        if (amountCents !== undefined && amountCents > MAX_LEDGER_CENTS) {
            fieldError(
                "That is more than one payment can hold. Record it in parts.",
                "amount",
            );
        }
        const cheque = dto.method === CHEQUE_PAYMENT_METHOD;
        if (!cheque && (dto.chequeNumber || dto.chequeBank)) {
            fieldError(
                "A cheque number and bank are only for a cheque.",
                dto.chequeNumber ? "chequeNumber" : "chequeBank",
            );
        }
        const receivedAt = dateOf(
            dto.receivedAt ?? dto.paidAt,
            now,
            dto.receivedAt ? "receivedAt" : "paidAt",
        );
        const actor = actorOf(ctx);
        const key = dto.idempotencyKey ?? null;

        let recorded: { paymentId: string; replayed: boolean };
        try {
            recorded = await prisma.$transaction(async (tx) => {
                const invoice = await lockInvoiceForLedgerOr404(
                    tx,
                    ctx.organizationId,
                    invoiceId,
                );
                assertLedgerPaper(invoice);
                // A retry of this very record (the sheet's key, one per
                // opening) answers with what it wrote. Two real payments
                // of the same amount carry two keys, and both count.
                if (key) {
                    const again = await keyedPayment(tx, invoice.id, key);
                    if (again) return { paymentId: again, replayed: true };
                }
                // One charge at a time (D13): Pay, Remind and the desk wait
                // while autopay is charging this invoice, and so does this.
                if (
                    await chargeUnderWayOn(tx, ctx.organizationId, invoice.id)
                ) {
                    throw autopayChargeInProgress();
                }
                const { paymentId } = await recordLedgerPaymentInTx(
                    tx,
                    invoice,
                    {
                        amountCents: amountCents ?? ledgerLeftCents(invoice),
                        method: dto.method,
                        reference: dto.reference,
                        note: dto.note,
                        receivedAt,
                        chequeNumber: dto.chequeNumber,
                        chequeBank: dto.chequeBank,
                        idempotencyKey: key,
                        actor,
                    },
                );
                return { paymentId, replayed: false };
            });
        } catch (err) {
            // Two of the same retry raced past the lookup: the unique index
            // kept one, and this answers with it.
            if (!key || prismaErrorCode(err) !== "P2002") throw err;
            const again = await keyedPayment(prisma, invoiceId, key);
            if (!again) throw err;
            recorded = { paymentId: again, replayed: true };
        }
        return {
            ...(await this.read(ctx.organizationId, invoiceId)),
            recorded,
        };
    }

    /**
     * Remove a payment recorded by mistake: soft, with a reason, and kept
     * in the history. The invoice is settled again from what is left, so
     * removing the only payment leaves it owed. Undo after recording calls
     * this. A payment that came in online is refunded, never removed.
     */
    async remove(
        ctx: OrganizationContext,
        invoiceId: string,
        paymentId: string,
        dto: RemovePaymentDto,
    ): Promise<InvoiceViewModel> {
        authorize(ctx, "invoice:write");
        await prisma.$transaction(async (tx) => {
            const invoice = await lockInvoiceForLedgerOr404(
                tx,
                ctx.organizationId,
                invoiceId,
            );
            const payment = await this.payment(tx, invoice, paymentId);
            if (payment.removedAt) {
                throw new ConflictException(
                    "This payment was already removed.",
                );
            }
            if (payment.method === ONLINE_PAYMENT_METHOD) {
                throw new ConflictException(
                    "This payment came in online, so it can't be removed. Refund it instead.",
                );
            }
            this.assertMoneyCanMove(invoice.status);
            await tx.invoicePayment.update({
                where: { id: payment.id },
                data: {
                    removedAt: new Date(),
                    removedById: ctx.userId,
                    removedReason: dto.reason ?? DEFAULT_REMOVE_REASON,
                },
            });
            const settled = await settleFromLedger(tx, invoice);
            await paymentChangedInTx(tx, AuditAction.InvoicePaymentRemoved, {
                ...eventOf(invoice, payment, actorOf(ctx)),
                paidInFull: settled.paid,
            });
        });
        return this.read(ctx.organizationId, invoiceId);
    }

    /** A waiting cheque marked as in the bank. The money doesn't move. */
    async cleared(
        ctx: OrganizationContext,
        invoiceId: string,
        paymentId: string,
        dto: ChequeClearedDto,
    ): Promise<InvoiceViewModel> {
        authorize(ctx, "invoice:write");
        const clearedAt = dateOf(dto.clearedAt, new Date(), "clearedAt");
        await prisma.$transaction(async (tx) => {
            const invoice = await lockInvoiceForLedgerOr404(
                tx,
                ctx.organizationId,
                invoiceId,
            );
            const payment = await this.waitingCheque(tx, invoice, paymentId);
            // A credited or void invoice's payments stand as they were: no
            // cheque goes into the bank on it, and no "paid" receipt goes.
            this.assertMoneyCanMove(invoice.status);
            if (clearedAt < payment.receivedAt) {
                fieldError(
                    "A cheque goes into the bank after it is received.",
                    "clearedAt",
                );
            }
            const status: BankStatus = "CLEARED";
            await tx.invoicePayment.update({
                where: { id: payment.id },
                data: { bankStatus: status, clearedAt },
            });
            const settled = await settleFromLedger(tx, invoice);
            await paymentChangedInTx(tx, AuditAction.InvoiceChequeCleared, {
                ...eventOf(invoice, payment, actorOf(ctx)),
                paidInFull: settled.paid,
            });
        });
        return this.read(ctx.organizationId, invoiceId);
    }

    /**
     * A cheque marked as bounced: it leaves the live sum, so what it paid is
     * owed again (and overdue once past due). No bounce charge. A cheque
     * already marked as in the bank can bounce too: banks return cheques
     * days later. It keeps its `clearedAt`, so its history and the pay page
     * say it was returned after it was banked.
     */
    async bounced(
        ctx: OrganizationContext,
        invoiceId: string,
        paymentId: string,
        dto: ChequeBouncedDto,
    ): Promise<InvoiceViewModel> {
        authorize(ctx, "invoice:write");
        const bouncedAt = dateOf(dto.bouncedAt, new Date(), "bouncedAt");
        await prisma.$transaction(async (tx) => {
            const invoice = await lockInvoiceForLedgerOr404(
                tx,
                ctx.organizationId,
                invoiceId,
            );
            const payment = await this.livingCheque(tx, invoice, paymentId);
            this.assertMoneyCanMove(invoice.status);
            if (bouncedAt < payment.receivedAt) {
                fieldError(
                    "A cheque bounces after it is received.",
                    "bouncedAt",
                );
            }
            if (payment.clearedAt && bouncedAt < payment.clearedAt) {
                fieldError(
                    "A cheque in the bank comes back after it went in.",
                    "bouncedAt",
                );
            }
            const status: BankStatus = "BOUNCED";
            await tx.invoicePayment.update({
                where: { id: payment.id },
                data: {
                    bankStatus: status,
                    bouncedAt,
                    bounceReason: dto.reason ?? null,
                },
            });
            const settled = await settleFromLedger(tx, invoice);
            await paymentChangedInTx(tx, AuditAction.InvoiceChequeBounced, {
                ...eventOf(invoice, payment, actorOf(ctx)),
                paidInFull: settled.paid,
            });
        });
        return this.read(ctx.organizationId, invoiceId);
    }

    // — internals —————————————————————————————————————————————————

    /** One payment on this invoice; another invoice's (or business's) is a 404. */
    private async payment(
        tx: Tx,
        invoice: { id: string; organizationId: string },
        paymentId: string,
    ) {
        const payment = await tx.invoicePayment.findFirst({
            where: {
                id: paymentId,
                invoiceId: invoice.id,
                organizationId: invoice.organizationId,
            },
            select: PAYMENT_SELECT,
        });
        if (!payment) throw new NotFoundException("Payment not found");
        return payment;
    }

    /** A cheque still waiting for the bank, or the reason it isn't one. */
    private async waitingCheque(
        tx: Tx,
        invoice: { id: string; organizationId: string },
        paymentId: string,
    ) {
        const payment = await this.livingCheque(tx, invoice, paymentId);
        if (payment.bankStatus === "CLEARED") {
            throw new ConflictException("This cheque is already in the bank.");
        }
        return payment;
    }

    /**
     * A cheque, not removed and not bounced, or the reason it isn't one.
     * Waiting or in the bank, it can still come back unpaid.
     */
    private async livingCheque(
        tx: Tx,
        invoice: { id: string; organizationId: string },
        paymentId: string,
    ) {
        const payment = await this.payment(tx, invoice, paymentId);
        if (payment.method !== CHEQUE_PAYMENT_METHOD) {
            throw new ConflictException("Only a cheque goes to the bank.");
        }
        if (payment.removedAt) {
            throw new ConflictException("This payment was removed.");
        }
        if (payment.bankStatus === "BOUNCED") {
            throw new ConflictException(CHEQUE_ALREADY_BOUNCED);
        }
        return payment;
    }

    /**
     * Money on an invoice moves only while it is ISSUED or PAID: a credited
     * or void invoice's payments stand as they were.
     */
    private assertMoneyCanMove(status: string): void {
        if (status === "ISSUED" || status === "PAID") return;
        throw new ConflictException(
            status === "CREDITED"
                ? "This invoice was credited, so its payments stay as they are."
                : "This invoice is void, so its payments stay as they are.",
        );
    }

    private async read(
        organizationId: string,
        invoiceId: string,
    ): Promise<InvoiceViewModel> {
        const row = await prisma.invoice.findFirst({
            where: { id: invoiceId, organizationId },
            select: INVOICE_DETAIL_SELECT,
        });
        if (!row) throw new NotFoundException("Invoice not found");
        return serializeInvoice(row, new Date(), { detail: true });
    }
}

/** The payment this invoice already has under this key, if any. */
async function keyedPayment(
    db: Pick<Tx, "invoicePayment">,
    invoiceId: string,
    idempotencyKey: string,
): Promise<string | null> {
    const row = await db.invoicePayment.findUnique({
        where: { invoiceId_idempotencyKey: { invoiceId, idempotencyKey } },
        select: { id: true },
    });
    return row?.id ?? null;
}

function actorOf(ctx: OrganizationContext): LedgerActor {
    return { userId: ctx.userId, roleKey: ctx.roleKey };
}

function eventOf(
    invoice: { id: string; organizationId: string },
    payment: {
        id: string;
        amountCents: number;
        currency: string;
        method: string;
    },
    actor: LedgerActor,
) {
    return {
        organizationId: invoice.organizationId,
        invoiceId: invoice.id,
        paymentId: payment.id,
        amountCents: payment.amountCents,
        currency: payment.currency,
        method: payment.method,
        actor,
    };
}
