import {
    ConflictException,
    HttpException,
    HttpStatus,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { whatsappChatLink } from "@saroh/block-contract";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { toMinor } from "../../common/money";
import type { OrganizationContext } from "../../common/types/organization-context";
import { whenWords } from "../../common/words-format";
import { CommunicationsService } from "../communications/communications.service";
import { authorize } from "../organizations/organization-policy";
import { assertBusinessDetails } from "./business-details";
import { isLive } from "./invoice-ledger";
import { queueReceiptInTx } from "./invoice-receipt.handler";
import type { SendRow } from "./invoice-send.service";
import {
    firstName,
    InvoiceSendService,
    SEND_SELECT,
} from "./invoice-send.service";
import type { ShareKind } from "./invoice-share-words";
import { shareMessage } from "./invoice-share-words";
import type {
    LoggedShareChannel,
    ShareChannel,
    ShareInvoiceDto,
} from "./invoice-share.dto";
import { isPastDue } from "./invoice-state";
import { InvoicesService } from "./invoices.service";
import { payLinkUrlFor } from "./pay-link-url";
import { invoicePayOnline } from "./pay-online";

type Tx = Prisma.TransactionClient;

/** What a share answers: the link, the message and who it goes to. */
export interface InvoiceShareResult {
    channel: ShareChannel;
    kind: ShareKind;
    /** The fresh link (WhatsApp, link); null for PDF, print and email. */
    url: string | null;
    /** The message, in the business's voice (WhatsApp, link); else null. */
    text: string | null;
    /** The customer's phone (E.164), or null: the sheet asks for one. */
    phone: string | null;
    /** `wa.me` with the message typed in, when there is a phone. */
    whatsappUrl: string | null;
    /** The link takes payment (DEC-070); else it shows the invoice. */
    payOnline: boolean;
    /** A receipt emailed (channel EMAIL): where, and whether it was suppressed. */
    email: { status: "QUEUED" | "SUPPRESSED"; to: string } | null;
    sharedAt: string;
}

/** The channels that make a fresh link, as a send does (DEC-110). */
const MINTS: readonly ShareChannel[] = ["WHATSAPP", "LINK"];

/** The words a 409 says when a receipt can't be emailed. */
export const RECEIPT_NEEDS_EMAIL =
    "Saroh sends receipts from your own email. Connect it in Settings, or share the receipt on WhatsApp.";

/**
 * Sharing one invoice by hand (DEC-173, U5 #1117): Share's WhatsApp, Link,
 * PDF and Print tabs, and the receipt by email.
 *
 * - **WhatsApp is a link, not a sender.** The share mints a fresh link (the
 *   one before stops, DEC-110), words the message and answers the
 *   `wa.me` link with it typed in. Saroh sends nothing and can't know it
 *   went: the log says it was shared.
 * - **Link** mints the same way. **PDF** and **Print** mint nothing.
 * - **Every share is logged** in `InvoiceShare` (channel, kind, who, when);
 *   a WhatsApp reminder counts towards one reminder a day, so a second
 *   reminder the same day, either way, is a 429 with `retryAt`.
 * - **Email** takes only a receipt, for the last live payment, through the
 *   business's own provider; with none it is a 409 and nothing is sent.
 *   A new invoice or a reminder is emailed by `send` and `remind`.
 *
 * Under the invoice's row lock, like a send, so two shares and a send
 * can't race. Who may: `invoice:write`, as for a send.
 */
@Injectable()
export class InvoiceShareService {
    constructor(
        private readonly invoices: InvoicesService,
        private readonly sending: InvoiceSendService,
        private readonly comms: CommunicationsService,
    ) {}

    async share(
        ctx: OrganizationContext,
        invoiceId: string,
        dto: ShareInvoiceDto,
    ): Promise<InvoiceShareResult> {
        authorize(ctx, "invoice:write");
        const organizationId = ctx.organizationId;
        const now = new Date();
        if (dto.channel === "EMAIL") {
            return this.emailReceipt(ctx, invoiceId, dto.kind, now);
        }
        // A link asks to be paid: the business details first (DEC-068).
        if (MINTS.includes(dto.channel)) {
            await assertBusinessDetails(prisma, organizationId);
        }
        return prisma.$transaction(async (tx) => {
            const row = await this.lockedRow(tx, organizationId, invoiceId);
            const kind = dto.kind ?? defaultKind(row, now);
            assertShareable(row, kind);
            const payOnline =
                row.status === "ISSUED" &&
                (await invoicePayOnline(tx, organizationId, row));
            const reach = await this.sending.channelsFor(
                tx,
                organizationId,
                row,
                now,
            );

            // One reminder a day, by email or WhatsApp (DEC-173).
            if (dto.channel === "WHATSAPP" && kind === "REMINDER") {
                const retryAt = await this.sending.nextReminderAt(
                    tx,
                    row.id,
                    now,
                );
                if (retryAt) {
                    const zone = await this.sending.zone(tx, organizationId);
                    throw new HttpException(
                        {
                            message: `One reminder a day. The next can go after ${whenWords(new Date(retryAt), zone)}.`,
                            details: { retryAt },
                        },
                        HttpStatus.TOO_MANY_REQUESTS,
                    );
                }
            }

            let url: string | null = null;
            if (MINTS.includes(dto.channel)) {
                const { token } = await this.invoices.createPayLinkInTx(
                    tx,
                    ctx,
                    row.id,
                    { requireProvider: payOnline, allowPaid: true },
                );
                url = await payLinkUrlFor(organizationId, token, tx);
            }

            let text: string | null = null;
            if (MINTS.includes(dto.channel)) {
                text = shareMessage({
                    kind,
                    business: await this.businessName(tx, organizationId),
                    firstName: firstName(row),
                    number: row.number ?? "",
                    currency: row.currency,
                    totalCents: totalCentsOf(row),
                    paidCents: paidCentsOf(row),
                    dueAt: row.dueAt,
                    overdue: isPastDue(row, now),
                    zone: await this.sending.zone(tx, organizationId),
                    link: url,
                    payOnline,
                    payment:
                        kind === "RECEIPT"
                            ? await lastLivePayment(tx, row.id)
                            : null,
                });
            }

            const logged = await tx.invoiceShare.create({
                data: {
                    organizationId,
                    invoiceId: row.id,
                    channel: dto.channel as LoggedShareChannel,
                    kind,
                    byUserId: ctx.userId,
                },
                select: { createdAt: true },
            });
            const phone = reach.phone;
            return {
                channel: dto.channel,
                kind,
                url,
                text,
                phone,
                whatsappUrl:
                    phone && text ? whatsappChatLink(phone, text) : null,
                payOnline,
                email: null,
                sharedAt: logged.createdAt.toISOString(),
            };
        });
    }

    /**
     * Email the receipt for the invoice's last live payment now, through
     * the business's own provider. Recorded on the payment, so its
     * automatic receipt, if still waiting, doesn't go a second time.
     */
    private async emailReceipt(
        ctx: OrganizationContext,
        invoiceId: string,
        kind: ShareKind | undefined,
        now: Date,
    ): Promise<InvoiceShareResult> {
        if (kind !== undefined && kind !== "RECEIPT") {
            throw new ConflictException(
                kind === "REMINDER"
                    ? "Email a reminder with Send reminder."
                    : "Email the invoice with Send.",
            );
        }
        const organizationId = ctx.organizationId;
        return prisma.$transaction(async (tx) => {
            const row = await this.lockedRow(tx, organizationId, invoiceId);
            assertShareable(row, "RECEIPT");
            if (!(await this.comms.emailConnected(tx, organizationId))) {
                throw new ConflictException(RECEIPT_NEEDS_EMAIL);
            }
            const payment = await lastLivePayment(tx, row.id);
            if (!payment) {
                throw new ConflictException(
                    "Nothing has been paid on this invoice yet.",
                );
            }
            await tx.$queryRaw`SELECT id FROM "InvoicePayment" WHERE id = ${payment.id} FOR UPDATE`;
            const queued = await queueReceiptInTx(tx, this.comms, {
                organizationId,
                paymentId: payment.id,
                createdByUserId: ctx.userId,
            });
            if (!queued) throw new NotFoundException("Payment not found");
            await tx.invoicePayment.updateMany({
                where: { id: payment.id, receiptMessageId: null },
                data: { receiptMessageId: queued.id },
            });
            return {
                channel: "EMAIL" as const,
                kind: "RECEIPT" as const,
                url: null,
                text: null,
                phone: row.contact?.phone ?? null,
                whatsappUrl: null,
                payOnline: false,
                email: { status: queued.status, to: queued.toAddress },
                sharedAt: now.toISOString(),
            };
        });
    }

    /** The invoice under its row lock, as a send takes it; else a 404. */
    private async lockedRow(
        tx: Tx,
        organizationId: string,
        invoiceId: string,
    ): Promise<SendRow> {
        await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId} AND "organizationId" = ${organizationId} FOR UPDATE`;
        const row = await tx.invoice.findFirst({
            where: { id: invoiceId, organizationId },
            select: SEND_SELECT,
        });
        if (!row) throw new NotFoundException("Invoice not found");
        return row;
    }

    private async businessName(
        tx: Tx,
        organizationId: string,
    ): Promise<string> {
        const org = await tx.organization.findUnique({
            where: { id: organizationId },
            select: { name: true },
        });
        return org?.name ?? "";
    }
}

/** The message an invoice says by default: a receipt once paid, a reminder once overdue. */
export function defaultKind(
    row: { status: string; dueAt: Date | null },
    now: Date,
): ShareKind {
    if (row.status === "PAID") return "RECEIPT";
    return isPastDue(row, now) ? "REMINDER" : "NEW";
}

/**
 * The refusals, in the order a person would want to hear them: an order's
 * paper (the order is shared, ADR-008), a credit note, a draft, a void or
 * credited invoice; then a receipt with nothing paid, or a new invoice or
 * reminder for one already paid.
 */
export function assertShareable(
    row: Pick<SendRow, "orderId" | "kind" | "status" | "paidCents">,
    kind: ShareKind,
): void {
    if (row.orderId) {
        throw new ConflictException(
            "This invoice belongs to an order, so share the order instead.",
        );
    }
    if (row.kind === "CREDIT_NOTE") {
        throw new ConflictException("A credit note isn't shared from here.");
    }
    switch (row.status) {
        case "DRAFT":
            throw new ConflictException("Issue the invoice before sharing it.");
        case "VOID":
            throw new ConflictException("A void invoice isn't shared.");
        case "CREDITED":
            throw new ConflictException(
                "This invoice was cancelled by a credit note.",
            );
    }
    if (kind === "RECEIPT") {
        if (row.status !== "PAID" && row.paidCents <= 0) {
            throw new ConflictException(
                "Nothing has been paid on this invoice yet.",
            );
        }
        return;
    }
    if (row.status === "PAID") {
        throw new ConflictException(
            "This invoice is paid. Share the receipt instead.",
        );
    }
}

function totalCentsOf(row: SendRow): number {
    return toMinor(row.total);
}

/** Paid so far: the ledger's cache, or the total once paid. */
function paidCentsOf(row: SendRow): number {
    return row.status === "PAID" ? totalCentsOf(row) : row.paidCents;
}

/** The last live payment on an invoice: what a receipt thanks them for. */
async function lastLivePayment(
    tx: Tx,
    invoiceId: string,
): Promise<{ id: string; amountCents: number; method: string } | null> {
    const rows = await tx.invoicePayment.findMany({
        where: { invoiceId, removedAt: null },
        orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
        select: {
            id: true,
            amountCents: true,
            method: true,
            removedAt: true,
            bankStatus: true,
        },
        take: 20,
    });
    const live = rows.find(isLive);
    return live
        ? { id: live.id, amountCents: live.amountCents, method: live.method }
        : null;
}
