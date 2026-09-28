import {
    ConflictException,
    HttpException,
    HttpStatus,
    Inject,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { toMoneyString } from "../../common/money";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { AccountThreadPoster } from "../communications/account-thread";
import {
    ACCOUNT_THREAD_POSTER,
    accountThreadOn,
} from "../communications/account-thread";
import { CommunicationsService } from "../communications/communications.service";
import type { InvoiceTemplate } from "../communications/transactional";
import { authorize } from "../organizations/organization-policy";
import { isPastDue } from "./invoice-state";
import { InvoicesService } from "./invoices.service";
import { payLinkUrl } from "./pay-link-url";
import type {
    InvoiceSendView,
    InvoiceSentView,
    SendBlocker,
    SendChannel,
} from "./send-view";

type Db = Prisma.TransactionClient;

export interface InvoiceSendResult {
    channels: SendChannel[];
    email: { status: "QUEUED" | "SUPPRESSED"; to: string } | null;
    thread: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Home's default zone (`home-needs.ts`), for a business that never set one. */
const DEFAULT_ZONE = "Asia/Kolkata";
const INVOICE_TEMPLATES: InvoiceTemplate[] = [
    "INVOICE_SENT",
    "INVOICE_REMINDER",
];
/** A send that went, or is going: a failed or suppressed one doesn't count. */
const WENT = ["QUEUED", "SENT"];

const SEND_SELECT = {
    id: true,
    number: true,
    status: true,
    kind: true,
    source: true,
    orderId: true,
    contactId: true,
    billToName: true,
    currency: true,
    total: true,
    dueAt: true,
    contact: { select: { firstName: true, lastName: true } },
} as const;

type SendRow = Prisma.InvoiceGetPayload<{ select: typeof SEND_SELECT }>;

function notFound(): never {
    throw new NotFoundException("Invoice not found");
}

/** Owed, or a draft that will be once issued: the paper a pay link is for. */
function sendable(row: SendRow): boolean {
    if (row.orderId || row.kind === "CREDIT_NOTE") return false;
    if (row.status === "DRAFT") return row.source !== "BOOKING";
    return row.status === "ISSUED";
}

/**
 * Send an invoice, or a reminder, with its pay link (round-2 D17), through
 * the business's own connected provider — Saroh's email is never used
 * (default 38), and there is no WhatsApp share (default 106).
 *
 * The channel rule is {@link sendChannels}. A send mints a fresh pay link,
 * as "New link" does, so the one shared before stops working; the token is
 * sealed into the send job and never stored or logged in the clear. It all
 * happens on one transaction under the invoice's row lock, so two clicks
 * can't send twice or both pass the one-reminder-a-day rule.
 *
 * Not here yet: D13's "Autopay charge in progress" refusal. D13 adds the
 * mandate charge, and with it the check that an invoice with a PENDING
 * mandate intent is neither sent nor reminded about (409).
 */
@Injectable()
export class InvoiceSendService {
    constructor(
        private readonly invoices: InvoicesService,
        private readonly comms: CommunicationsService,
        @Optional()
        @Inject(ACCOUNT_THREAD_POSTER)
        private readonly thread?: AccountThreadPoster,
    ) {}

    /** The send flag and what has been sent, for the invoice read. */
    async readFor(
        organizationId: string,
        invoiceId: string,
        now = new Date(),
    ): Promise<{ send: InvoiceSendView; sent: InvoiceSentView[] }> {
        const [row, sent] = await Promise.all([
            prisma.invoice.findFirst({
                where: { id: invoiceId, organizationId },
                select: SEND_SELECT,
            }),
            prisma.message.findMany({
                where: {
                    organizationId,
                    invoiceId,
                    template: { in: INVOICE_TEMPLATES },
                },
                orderBy: { createdAt: "desc" },
                take: 10,
                select: {
                    id: true,
                    toAddress: true,
                    createdAt: true,
                    template: true,
                    status: true,
                },
            }),
        ]);
        if (!row) notFound();
        return {
            send: await this.sendChannels(prisma, organizationId, row, now),
            sent: sent.map((m) => ({
                id: m.id,
                channel: "email",
                to: m.toAddress,
                at: m.createdAt.toISOString(),
                reminder: m.template === "INVOICE_REMINDER",
                status: m.status,
            })),
        };
    }

    /**
     * The channel rule, served as one flag (D17, reconciling F4):
     * - `email` when the business has a connected email provider and there
     *   is an address to send to (the bill-to email, or a verified account
     *   email when the bill-to is a placeholder);
     * - `thread` when the account thread is live (the `ACCOUNT_THREAD` flag
     *   and A13's poster) and the contact has an active site account;
     * - both, one, or neither: with neither there is no Send.
     * A pay link needs a connected payment provider, so without one there
     * is nothing to send.
     */
    async sendChannels(
        db: Db,
        organizationId: string,
        row: SendRow,
        now: Date,
    ): Promise<InvoiceSendView> {
        const nextReminderAt = await this.nextReminderAt(db, row.id, now);
        const none = (reason: SendBlocker): InvoiceSendView => ({
            channels: [],
            reason,
            nextReminderAt,
        });
        if (!sendable(row)) return none("NOT_OWED");

        const [payments, emailOn, to, threadOn] = await Promise.all([
            db.merchantPaymentProvider.count({
                where: { organizationId, status: "CONNECTED" },
            }),
            this.comms.emailConnected(db, organizationId),
            this.comms.transactionalAddress(db, organizationId, {
                kind: "INVOICE_BILL_TO",
                invoiceId: row.id,
            }),
            this.threadOpen(db, organizationId, row.contactId),
        ]);
        if (payments === 0) return none("NO_PAYMENT_PROVIDER");

        const channels: SendChannel[] = [];
        if (emailOn && to) channels.push("email");
        if (threadOn) channels.push("thread");
        if (channels.length === 0) {
            return none(emailOn ? "NO_EMAIL_ADDRESS" : "NO_EMAIL_PROVIDER");
        }
        return {
            channels,
            ...(channels.includes("email") && to
                ? { emailTo: to.address }
                : {}),
            nextReminderAt,
        };
    }

    /** `POST :id/send`: the first send, with its pay link. */
    send(ctx: OrganizationContext, id: string): Promise<InvoiceSendResult> {
        return this.dispatch(ctx, id, false);
    }

    /** `POST :id/remind`: the same send in reminder words, once a day at most. */
    remind(ctx: OrganizationContext, id: string): Promise<InvoiceSendResult> {
        return this.dispatch(ctx, id, true);
    }

    private async dispatch(
        ctx: OrganizationContext,
        id: string,
        reminder: boolean,
    ): Promise<InvoiceSendResult> {
        authorize(ctx, "invoice:write");
        const organizationId = ctx.organizationId;
        const now = new Date();

        return prisma.$transaction(async (tx) => {
            // The invoice's lock serializes sends, reminders and pay links.
            await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${id} AND "organizationId" = ${organizationId} FOR UPDATE`;
            const row = await tx.invoice.findFirst({
                where: { id, organizationId },
                select: SEND_SELECT,
            });
            if (!row) notFound();
            this.assertSendable(row);

            const view = await this.sendChannels(tx, organizationId, row, now);
            if (view.channels.length === 0) {
                throw new ConflictException(blockerMessage(view.reason));
            }
            const zone = await this.zone(tx, organizationId);
            if (reminder && view.nextReminderAt) {
                throw new HttpException(
                    {
                        message: `One reminder a day. The next can go after ${formatWhen(new Date(view.nextReminderAt), zone)}.`,
                        details: { retryAt: view.nextReminderAt },
                    },
                    HttpStatus.TOO_MANY_REQUESTS,
                );
            }
            if (!reminder && (await this.alreadySent(tx, id))) {
                throw new ConflictException(
                    "This invoice has been sent. Send a reminder instead.",
                );
            }

            const template: InvoiceTemplate = reminder
                ? "INVOICE_REMINDER"
                : "INVOICE_SENT";
            let email: InvoiceSendResult["email"] = null;
            if (view.channels.includes("email")) {
                const org = await tx.organization.findUnique({
                    where: { id: organizationId },
                    select: { name: true },
                });
                const queued = await this.comms.queueTransactional(
                    tx,
                    organizationId,
                    {
                        template,
                        vars: {
                            business: org?.name ?? "",
                            firstName: firstName(row),
                            number: row.number ?? "",
                            total: formatMoney(row.total, row.currency),
                            dueOn: row.dueAt
                                ? formatDay(row.dueAt, zone)
                                : null,
                            overdue: isPastDue(row, now),
                        },
                        recipient: { kind: "INVOICE_BILL_TO", invoiceId: id },
                        // A fresh link, as "New link" makes; the old one stops.
                        secretLink: async () =>
                            payLinkUrl(
                                (
                                    await this.invoices.createPayLinkInTx(
                                        tx,
                                        ctx,
                                        id,
                                    )
                                ).token,
                            ),
                        invoiceId: id,
                        createdByUserId: ctx.userId,
                    },
                );
                email = { status: queued.status, to: queued.toAddress };
            }

            let thread = false;
            if (
                view.channels.includes("thread") &&
                this.thread &&
                row.contactId
            ) {
                await this.thread.post(tx, {
                    organizationId,
                    contactId: row.contactId,
                    invoiceId: id,
                    kind: template,
                    actorUserId: ctx.userId,
                });
                thread = true;
            }
            return { channels: view.channels, email, thread };
        });
    }

    /** The refusals, in the order a person would want to hear them. */
    private assertSendable(row: SendRow): void {
        if (row.orderId) {
            throw new ConflictException(
                "This invoice belongs to an order, so it has no pay link to send.",
            );
        }
        if (row.kind === "CREDIT_NOTE") {
            throw new ConflictException(
                "A credit note isn't sent for payment.",
            );
        }
        switch (row.status) {
            case "ISSUED":
                return;
            case "DRAFT":
                throw new ConflictException(
                    "Issue the invoice before sending it.",
                );
            case "PAID":
                throw new ConflictException("Already paid.");
            case "CREDITED":
                throw new ConflictException(
                    "This invoice was cancelled by a credit note.",
                );
            default:
                throw new ConflictException("A void invoice isn't sent.");
        }
    }

    /** When the next reminder may go: a day after the last send that went. */
    private async nextReminderAt(
        db: Db,
        invoiceId: string,
        now: Date,
    ): Promise<string | null> {
        const since = new Date(now.getTime() - DAY_MS);
        // An email that went, or a post into the account thread (A13): a
        // thread-only send counts the same.
        const [email, post] = await Promise.all([
            db.message.findFirst({
                where: {
                    invoiceId,
                    template: { in: INVOICE_TEMPLATES },
                    status: { in: WENT },
                    createdAt: { gt: since },
                },
                orderBy: { createdAt: "desc" },
                select: { createdAt: true },
            }),
            db.customerThreadMessage.findFirst({
                where: {
                    invoiceId,
                    event: { in: INVOICE_TEMPLATES },
                    createdAt: { gt: since },
                },
                orderBy: { createdAt: "desc" },
                select: { createdAt: true },
            }),
        ]);
        const times = [email?.createdAt, post?.createdAt]
            .filter((at): at is Date => at !== undefined)
            .map((at) => at.getTime());
        return times.length > 0
            ? new Date(Math.max(...times) + DAY_MS).toISOString()
            : null;
    }

    private async alreadySent(db: Db, invoiceId: string): Promise<boolean> {
        const [emails, posts] = await Promise.all([
            db.message.count({
                where: {
                    invoiceId,
                    template: { in: INVOICE_TEMPLATES },
                    status: { in: WENT },
                },
            }),
            // A post into the account thread is a send too (A13).
            db.customerThreadMessage.count({
                where: { invoiceId, event: { in: INVOICE_TEMPLATES } },
            }),
        ]);
        return emails + posts > 0;
    }

    /** The thread is offered only once it is live and they have an account. */
    private async threadOpen(
        db: Db,
        organizationId: string,
        contactId: string | null,
    ): Promise<boolean> {
        if (!this.thread || !contactId) return false;
        if (!(await accountThreadOn(organizationId))) return false;
        const account = await db.customerAccount.count({
            where: { organizationId, contactId, status: "ACTIVE" },
        });
        return account > 0;
    }

    private async zone(db: Db, organizationId: string): Promise<string> {
        const profile = await db.businessProfile.findUnique({
            where: { organizationId },
            select: { timezone: true },
        });
        return profile?.timezone ?? DEFAULT_ZONE;
    }
}

/** The sentence a 409 says when nothing can carry the invoice. */
export function blockerMessage(reason: SendBlocker | undefined): string {
    switch (reason) {
        case "NO_PAYMENT_PROVIDER":
            return "Connect a payment provider to send a pay link.";
        case "NO_EMAIL_PROVIDER":
            return "Connect an email provider in Settings to send invoices. You can copy the pay link instead.";
        case "NO_EMAIL_ADDRESS":
            return "There's no email address to send this to. You can copy the pay link instead.";
        default:
            return "This invoice isn't owed, so there's nothing to send.";
    }
}

function firstName(row: SendRow): string | null {
    const name =
        row.billToName ??
        [row.contact?.firstName, row.contact?.lastName]
            .filter(Boolean)
            .join(" ");
    return name.trim().split(/\s+/)[0] || null;
}

/** "₹2,400.00", from the decimal string: the amount itself never floats. */
export function formatMoney(
    total: { toString(): string },
    currency: string,
): string {
    const amount = toMoneyString(total);
    const [whole = "0", frac = "00"] = amount.replace("-", "").split(".");
    const grouped = new Intl.NumberFormat("en-IN").format(BigInt(whole));
    const symbol =
        new Intl.NumberFormat("en-IN", { style: "currency", currency })
            .formatToParts(0)
            .find((p) => p.type === "currency")?.value ?? currency;
    return `${amount.startsWith("-") ? "-" : ""}${symbol}${grouped}.${frac}`;
}

/** "3 Oct 2026", in the business's zone. */
export function formatDay(at: Date, timeZone: string): string {
    return new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone,
    }).format(at);
}

/** "4 Oct, 10:05 am", in the business's zone. */
export function formatWhen(at: Date, timeZone: string): string {
    return new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone,
    }).format(at);
}
