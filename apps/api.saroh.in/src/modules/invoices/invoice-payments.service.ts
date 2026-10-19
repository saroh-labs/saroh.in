import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { AuditAction } from "../audit/audit.service";
import { authorize } from "../organizations/organization-policy";
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

/**
 * A repeat of the same record within this long answers as the first did
 * (the desk-take rule), so a double tap can't record a payment twice.
 */
export const REPEAT_WINDOW_MS = 10 * 60 * 1000;

/** How far ahead a date may be, for a phone a time zone ahead of the API. */
const FUTURE_SLACK_MS = 24 * 60 * 60 * 1000;

/** The reason a payment is removed with when none is given. */
export const DEFAULT_REMOVE_REASON = "Recorded by mistake";

/** The invoice after a payment was recorded, and which payment it was. */
export type RecordedPaymentView = InvoiceViewModel & {
    recorded: {
        /** The payment written, or the one a repeat matched: what Undo removes. */
        paymentId: string;
        /** A repeat of a record made moments ago: nothing new was written. */
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
} as const;

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

        const recorded = await prisma.$transaction(async (tx) => {
            const invoice = await lockInvoiceForLedgerOr404(
                tx,
                ctx.organizationId,
                invoiceId,
            );
            assertLedgerPaper(invoice);
            const again = await this.repeatOf(tx, invoice.id, {
                method: dto.method,
                reference: dto.reference ?? null,
                chequeNumber: cheque ? (dto.chequeNumber ?? null) : null,
                amountCents,
                nothingLeft: ledgerLeftCents(invoice) === 0,
                now,
            });
            if (again) return { paymentId: again, replayed: true };
            const { paymentId } = await recordLedgerPaymentInTx(tx, invoice, {
                amountCents: amountCents ?? ledgerLeftCents(invoice),
                method: dto.method,
                reference: dto.reference,
                note: dto.note,
                receivedAt,
                chequeNumber: dto.chequeNumber,
                chequeBank: dto.chequeBank,
                actor,
            });
            return { paymentId, replayed: false };
        });
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
     * A waiting cheque marked as bounced: it leaves the live sum, so what
     * it paid is owed again (and overdue once past due). No bounce charge.
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
            const payment = await this.waitingCheque(tx, invoice, paymentId);
            this.assertMoneyCanMove(invoice.status);
            if (bouncedAt < payment.receivedAt) {
                fieldError(
                    "A cheque bounces after it is received.",
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

    /**
     * The payment a repeat of this record matches, if any: not removed,
     * written within the window, by the same method with the same reference
     * (and cheque number), for the same amount. With no amount sent ("what
     * is left"), it matches only once nothing is left: the first tap paid
     * it, and the second would otherwise be refused as already paid.
     */
    private async repeatOf(
        tx: Tx,
        invoiceId: string,
        r: {
            method: string;
            reference: string | null;
            chequeNumber: string | null;
            amountCents: number | undefined;
            nothingLeft: boolean;
            now: Date;
        },
    ): Promise<string | null> {
        if (r.amountCents === undefined && !r.nothingLeft) return null;
        const last = await tx.invoicePayment.findFirst({
            where: {
                invoiceId,
                removedAt: null,
                method: r.method,
                reference: r.reference,
                chequeNumber: r.chequeNumber,
                createdAt: {
                    gte: new Date(r.now.getTime() - REPEAT_WINDOW_MS),
                },
                ...(r.amountCents !== undefined
                    ? { amountCents: r.amountCents }
                    : {}),
            },
            orderBy: { createdAt: "desc" },
            select: { id: true },
        });
        return last?.id ?? null;
    }

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
        const payment = await this.payment(tx, invoice, paymentId);
        if (payment.method !== CHEQUE_PAYMENT_METHOD) {
            throw new ConflictException("Only a cheque goes to the bank.");
        }
        if (payment.removedAt) {
            throw new ConflictException("This payment was removed.");
        }
        if (payment.bankStatus === "CLEARED") {
            throw new ConflictException("This cheque is already in the bank.");
        }
        if (payment.bankStatus === "BOUNCED") {
            throw new ConflictException("This cheque already bounced.");
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
