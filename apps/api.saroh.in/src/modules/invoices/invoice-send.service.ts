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

import { mapLimit } from "../../common/map-limit";
import type { OrganizationContext } from "../../common/types/organization-context";
import {
    dayWords,
    moneyWordsMinor,
    whenWords,
} from "../../common/words-format";
import { isRenewalInvoice } from "../billing/online-payments-plan";
import type { AccountThreadPoster } from "../communications/account-thread";
import {
    ACCOUNT_THREAD_POSTER,
    accountThreadOn,
} from "../communications/account-thread";
import type { TransactionalAddress } from "../communications/communications.service";
import { CommunicationsService } from "../communications/communications.service";
import type { InvoiceTemplate } from "../communications/transactional";
import {
    businessPayInstructionsOf,
    payWaysWords,
} from "../organizations/business-pay-instructions";
import { authorize } from "../organizations/organization-policy";
import {
    AUTOPAY_CHARGE_IN_PROGRESS,
    autopayChargeInProgress,
    chargesUnderWay,
    chargeUnderWayOn,
} from "../payments/charge-under-way";
import { assertBusinessDetails } from "./business-details";
import type { InvoiceEventKind, InvoiceEventView } from "./invoice-events";
import {
    JOB_ACTOR,
    personActor,
    readInvoiceEvents,
    recordInvoiceEvent,
    shareNames,
} from "./invoice-events";
import { isPastDue, leftToPayCents } from "./invoice-state";
import { InvoicesService } from "./invoices.service";
import { payLinkUrlFor } from "./pay-link-url";
import { invoicePayOnline } from "./pay-online";
import type {
    InvoiceSendView,
    InvoiceSentView,
    InvoiceSharedView,
    SendBlocker,
    SendChannel,
} from "./send-view";

type Db = Prisma.TransactionClient;

/**
 * How a send is made: by the person pressing Send (the default), or by
 * Saroh on the business's behalf (`automatic`: a renewal's invoice, an
 * overdue reminder), which the history reads as "sent automatically".
 */
export interface SendOptions {
    automatic?: boolean;
}

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

export const SEND_SELECT = {
    id: true,
    number: true,
    status: true,
    kind: true,
    source: true,
    orderId: true,
    // A renewal stays payable online on any plan (`online-payments-plan.ts`).
    subscriptionId: true,
    contactId: true,
    billToName: true,
    currency: true,
    total: true,
    // What is left to pay is what the message asks for (DEC-173).
    paidCents: true,
    dueAt: true,
    // The phone a WhatsApp share opens a chat with (DEC-173).
    contact: { select: { firstName: true, lastName: true, phone: true } },
} as const;

/** The WhatsApp shares that ask to be paid: they count as a send (DEC-173). */
const WHATSAPP_ASKS = ["NEW", "REMINDER"];

/**
 * Why an invoice's email can't go, for the share sheet and the bulk
 * reminder: no provider, no address, or the customer turned email off.
 */
export type EmailBlocker =
    "NO_EMAIL_PROVIDER" | "NO_EMAIL_ADDRESS" | "EMAIL_OFF";

/** How an invoice can reach its customer, for Share and Remind many. */
export interface InvoiceReach {
    /** The address an email would go to, when one can go. */
    emailTo: string | null;
    /** Why no email can go; null when one can. */
    emailBlocked: EmailBlocker | null;
    /** The contact's phone (E.164), for WhatsApp; null when there's none. */
    phone: string | null;
    /** The send flag, as `sendChannels` reads it. */
    send: InvoiceSendView;
}

export type SendRow = Prisma.InvoiceGetPayload<{ select: typeof SEND_SELECT }>;

/**
 * What Remind many reads once for the whole business rather than once per
 * invoice (review #17): whether its email provider is connected, whether
 * its links take payment online (a renewal's may when others don't), and
 * whether the account thread is live. `dispatch` takes it too, so a
 * hundred reminders don't each ask again; each still re-reads its own
 * invoice under its lock.
 */
export interface ReachShared {
    emailOn: boolean;
    payOnline: (row: SendRow) => Promise<boolean>;
    threadOn: boolean;
}

/** At most this many invoices are read or reminded at once (review #17). */
export const REMIND_MANY_CONCURRENCY = 5;

/** What one invoice's send flag is worked out from. */
interface SendInputs {
    nextReminderAt: string | null;
    payOnline: boolean;
    charging: boolean;
    emailOn: boolean;
    to: TransactionalAddress | null;
    threadOn: boolean;
}

/** The channel rule over its inputs: {@link InvoiceSendService.sendChannels}. */
function sendViewOf(row: SendRow, i: SendInputs): InvoiceSendView {
    // Share's WhatsApp tab says who it opens a chat with (U11).
    const phone = row.contact?.phone ? { phone: row.contact.phone } : {};
    const none = (reason: SendBlocker): InvoiceSendView => ({
        channels: [],
        reason,
        payOnline: i.payOnline,
        nextReminderAt: i.nextReminderAt,
        ...phone,
    });
    if (!sendable(row)) return none("NOT_OWED");
    if (i.charging) return none("AUTOPAY_PENDING");
    const channels: SendChannel[] = [];
    if (i.emailOn && i.to) channels.push("email");
    if (i.threadOn) channels.push("thread");
    if (channels.length === 0) {
        return none(i.emailOn ? "NO_EMAIL_ADDRESS" : "NO_EMAIL_PROVIDER");
    }
    return {
        channels,
        ...(channels.includes("email") && i.to
            ? { emailTo: i.to.address }
            : {}),
        payOnline: i.payOnline,
        nextReminderAt: i.nextReminderAt,
        ...phone,
    };
}

/** How it reaches its customer, from its send flag and inputs. */
function reachOf(
    row: SendRow,
    send: InvoiceSendView,
    emailOn: boolean,
    to: TransactionalAddress | null,
    consent: string | null,
): InvoiceReach {
    const phone = row.contact?.phone ?? null;
    if (!emailOn) {
        return {
            emailTo: null,
            emailBlocked: "NO_EMAIL_PROVIDER",
            phone,
            send,
        };
    }
    if (!to) {
        return { emailTo: null, emailBlocked: "NO_EMAIL_ADDRESS", phone, send };
    }
    if (consent === "REVOKED") {
        return { emailTo: null, emailBlocked: "EMAIL_OFF", phone, send };
    }
    return { emailTo: to.address, emailBlocked: null, phone, send };
}

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
 * (default 38). WhatsApp is a click-to-chat share, never a send: the
 * business opens it from Share (`invoice-share.service.ts`, DEC-173), and a
 * WhatsApp reminder counts towards one reminder a day here. A business
 * that doesn't take payment online sends the same link as a view link
 * (DEC-070): the invoice and its PDF, without a Pay button. The invoice's
 * PDF is attached to the email (DEC-083), drawn by the send job where the
 * business's provider takes attachments — the link alone where it doesn't.
 *
 * The channel rule is {@link sendChannels}. A send mints a fresh pay link,
 * as "New link" does, so the one shared before stops working; the token is
 * sealed into the send job and never stored or logged in the clear. It all
 * happens on one transaction under the invoice's row lock, so two clicks
 * can't send twice or both pass the one-reminder-a-day rule.
 *
 * While an autopay charge is under way on the invoice (D13) it is neither
 * sent nor reminded about: the flag says `AUTOPAY_PENDING` and the API
 * answers 409 "Autopay charge in progress".
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
    ): Promise<{
        send: InvoiceSendView;
        sent: InvoiceSentView[];
        shared: InvoiceSharedView[];
        events: InvoiceEventView[];
    }> {
        const [row, sent, shared, events] = await Promise.all([
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
            prisma.invoiceShare.findMany({
                where: { organizationId, invoiceId },
                orderBy: { createdAt: "desc" },
                take: 10,
                select: {
                    id: true,
                    channel: true,
                    kind: true,
                    byUserId: true,
                    createdAt: true,
                },
            }),
            // Who issued, sent, reminded, voided or credited it (U9 #1140).
            readInvoiceEvents(prisma, organizationId, invoiceId),
        ]);
        if (!row) notFound();
        const names = await shareNames(
            prisma,
            shared.map((s) => s.byUserId),
        );
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
            shared: shared.map((s) => ({
                id: s.id,
                channel: s.channel as InvoiceSharedView["channel"],
                kind: s.kind as InvoiceSharedView["kind"],
                byUserId: s.byUserId,
                byName: s.byUserId ? (names.get(s.byUserId) ?? null) : null,
                at: s.createdAt.toISOString(),
            })),
            events,
        };
    }

    /**
     * How this invoice can reach its customer now (DEC-173): the send flag,
     * whether an email can go and why not, and the phone WhatsApp would
     * open. Email can go when the business's provider is connected, there
     * is an address, and the customer hasn't turned email off; a send to
     * someone who has would be written SUPPRESSED, so it isn't offered.
     */
    async channelsFor(
        db: Db,
        organizationId: string,
        row: SendRow,
        now: Date,
    ): Promise<InvoiceReach> {
        const [send, emailOn, to] = await Promise.all([
            this.sendChannels(db, organizationId, row, now),
            this.comms.emailConnected(db, organizationId),
            this.comms.transactionalAddress(db, organizationId, {
                kind: "INVOICE_BILL_TO",
                invoiceId: row.id,
            }),
        ]);
        const consent =
            emailOn && to?.contactId
                ? await db.consent.findUnique({
                      where: {
                          contactId_channel: {
                              contactId: to.contactId,
                              channel: "EMAIL",
                          },
                      },
                      select: { status: true },
                  })
                : null;
        return reachOf(row, send, emailOn, to, consent?.status ?? null);
    }

    /** The business-wide part of {@link channelsFor}, read once (review #17). */
    async readShared(db: Db, organizationId: string): Promise<ReachShared> {
        const [emailOn, threadOn] = await Promise.all([
            this.comms.emailConnected(db, organizationId),
            this.thread
                ? accountThreadOn(organizationId)
                : Promise.resolve(false),
        ]);
        // A renewal's link may take payment online on a plan whose others
        // don't (`invoicePayOnline`): one answer for each kind, asked once.
        const byKind = new Map<boolean, Promise<boolean>>();
        const payOnline = (row: SendRow) => {
            const renewal = isRenewalInvoice(row);
            let read = byKind.get(renewal);
            if (!read) {
                read = invoicePayOnline(db, organizationId, row);
                byKind.set(renewal, read);
            }
            return read;
        };
        return { emailOn, payOnline, threadOn };
    }

    /**
     * {@link channelsFor} for many invoices at once (Remind many, review
     * #17): the business-wide reads once, the per-invoice ones batched with
     * IN (when each was last sent, autopay charges, consents, site
     * accounts), and each invoice's address read with at most
     * {@link REMIND_MANY_CONCURRENCY} in flight. The same rules, row for
     * row, as `channelsFor`.
     */
    async channelsForMany(
        db: Db,
        organizationId: string,
        rows: readonly SendRow[],
        now: Date,
        shared?: ReachShared,
    ): Promise<Map<string, InvoiceReach>> {
        const out = new Map<string, InvoiceReach>();
        if (rows.length === 0) return out;
        const ids = rows.map((r) => r.id);
        const [common, next, charges, addresses] = await Promise.all([
            shared ?? this.readShared(db, organizationId),
            this.nextReminderAtMany(db, ids, now),
            chargesUnderWay(db, organizationId, ids),
            mapLimit(rows, REMIND_MANY_CONCURRENCY, (row) =>
                this.comms.transactionalAddress(db, organizationId, {
                    kind: "INVOICE_BILL_TO",
                    invoiceId: row.id,
                }),
            ),
        ]);
        const contactIds = (list: (string | null | undefined)[]) => [
            ...new Set(list.filter((id): id is string => !!id)),
        ];
        const consentIds = common.emailOn
            ? contactIds(addresses.map((a) => a?.contactId))
            : [];
        const threadIds = common.threadOn
            ? contactIds(rows.map((r) => r.contactId))
            : [];
        const [consents, accounts, payOnline] = await Promise.all([
            consentIds.length > 0
                ? db.consent.findMany({
                      where: {
                          contactId: { in: consentIds },
                          channel: "EMAIL",
                      },
                      select: { contactId: true, status: true },
                  })
                : [],
            threadIds.length > 0
                ? db.customerAccount.findMany({
                      where: {
                          organizationId,
                          contactId: { in: threadIds },
                          status: "ACTIVE",
                      },
                      select: { contactId: true },
                  })
                : [],
            Promise.all(rows.map((row) => common.payOnline(row))),
        ]);
        const consentOf = new Map(consents.map((c) => [c.contactId, c.status]));
        const withAccount = new Set(accounts.map((a) => a.contactId));
        rows.forEach((row, index) => {
            const to = addresses[index] ?? null;
            const send = sendViewOf(row, {
                nextReminderAt: next.get(row.id) ?? null,
                payOnline: payOnline[index] ?? false,
                charging: charges.has(row.id),
                emailOn: common.emailOn,
                to,
                threadOn:
                    common.threadOn &&
                    !!row.contactId &&
                    withAccount.has(row.contactId),
            });
            out.set(
                row.id,
                reachOf(
                    row,
                    send,
                    common.emailOn,
                    to,
                    to?.contactId
                        ? (consentOf.get(to.contactId) ?? null)
                        : null,
                ),
            );
        });
        return out;
    }

    /**
     * The channel rule, served as one flag (D17, reconciling F4):
     * - `email` when the business has a connected email provider and there
     *   is an address to send to (the bill-to email, or a verified account
     *   email when the bill-to is a placeholder);
     * - `thread` when the account thread is live (the `ACCOUNT_THREAD` flag
     *   and A13's poster) and the contact has an active site account;
     * - both, one, or neither: with neither there is no Send.
     *
     * No payment provider is needed (DEC-070): `payOnline` says whether the
     * link sent is a pay link (Payments on, a provider that can take it) or
     * a link to view the invoice. The workspace reads it and never guesses.
     */
    async sendChannels(
        db: Db,
        organizationId: string,
        row: SendRow,
        now: Date,
        // The business-wide reads, when a batch already made them (#17).
        shared?: ReachShared,
    ): Promise<InvoiceSendView> {
        const [nextReminderAt, payOnline] = await Promise.all([
            this.nextReminderAt(db, row.id, now),
            shared
                ? shared.payOnline(row)
                : invoicePayOnline(db, organizationId, row),
        ]);
        const inputs: SendInputs = {
            nextReminderAt,
            payOnline,
            charging: false,
            emailOn: false,
            to: null,
            threadOn: false,
        };
        if (!sendable(row)) return sendViewOf(row, inputs);
        if (await chargeUnderWayOn(db, organizationId, row.id)) {
            return sendViewOf(row, { ...inputs, charging: true });
        }

        const [emailOn, to, threadOn] = await Promise.all([
            shared
                ? shared.emailOn
                : this.comms.emailConnected(db, organizationId),
            this.comms.transactionalAddress(db, organizationId, {
                kind: "INVOICE_BILL_TO",
                invoiceId: row.id,
            }),
            shared && !shared.threadOn
                ? false
                : this.threadOpen(db, organizationId, row.contactId),
        ]);
        return sendViewOf(row, { ...inputs, emailOn, to, threadOn });
    }

    /** `POST :id/send`: the first send, with its pay link. */
    send(
        ctx: OrganizationContext,
        id: string,
        options: SendOptions = {},
    ): Promise<InvoiceSendResult> {
        return this.dispatch(ctx, id, false, undefined, options);
    }

    /**
     * `POST :id/remind`: the same send in reminder words, once a day at
     * most. Remind many passes what it already read for the business
     * (`batch`, review #17): its details checked, and the business-wide
     * reads; the invoice itself is read again under its lock either way.
     */
    remind(
        ctx: OrganizationContext,
        id: string,
        batch?: { shared: ReachShared; detailsChecked: true },
        options: SendOptions = {},
    ): Promise<InvoiceSendResult> {
        return this.dispatch(ctx, id, true, batch, options);
    }

    private async dispatch(
        ctx: OrganizationContext,
        id: string,
        reminder: boolean,
        batch?: { shared: ReachShared; detailsChecked: true },
        options: SendOptions = {},
    ): Promise<InvoiceSendResult> {
        authorize(ctx, "invoice:write");
        const organizationId = ctx.organizationId;
        const now = new Date();
        // It asks to be paid: the business details first (DEC-068).
        if (!batch?.detailsChecked) {
            await assertBusinessDetails(prisma, organizationId);
        }

        return prisma.$transaction(async (tx) => {
            // The invoice's lock serializes sends, reminders and pay links.
            await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${id} AND "organizationId" = ${organizationId} FOR UPDATE`;
            const row = await tx.invoice.findFirst({
                where: { id, organizationId },
                select: SEND_SELECT,
            });
            if (!row) notFound();
            this.assertSendable(row);

            const view = await this.sendChannels(
                tx,
                organizationId,
                row,
                now,
                batch?.shared,
            );
            if (view.reason === "AUTOPAY_PENDING") {
                throw autopayChargeInProgress();
            }
            if (view.channels.length === 0) {
                throw new ConflictException(blockerMessage(view.reason));
            }
            const zone = await this.zone(tx, organizationId);
            if (reminder && view.nextReminderAt) {
                throw new HttpException(
                    {
                        message: `One reminder a day. The next can go after ${whenWords(new Date(view.nextReminderAt), zone)}.`,
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
            let messageId: string | null = null;
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
                            // What is left to pay: a partly paid invoice's
                            // reminder asks for the rest (DEC-173).
                            total: moneyWordsMinor(
                                leftToPayCents(row),
                                row.currency,
                            ),
                            dueOn: row.dueAt
                                ? dayWords(row.dueAt, zone, { year: true })
                                : null,
                            overdue: isPastDue(row, now),
                            payOnline: view.payOnline,
                            // How to pay offline (R32), named, never the
                            // details: those stay on the invoice's page.
                            ...(view.payOnline
                                ? {}
                                : {
                                      payWays: payWaysWords(
                                          await businessPayInstructionsOf(
                                              organizationId,
                                              tx,
                                          ),
                                      ),
                                  }),
                        },
                        recipient: { kind: "INVOICE_BILL_TO", invoiceId: id },
                        // A fresh link, as "New link" makes; the old one
                        // stops. With no way to pay online it is a view
                        // link: the same page, without a Pay button. On the
                        // business's own address (DEC-069, L7), read on
                        // this transaction as the message is composed.
                        secretLink: async () =>
                            payLinkUrlFor(
                                organizationId,
                                (
                                    await this.invoices.createPayLinkInTx(
                                        tx,
                                        ctx,
                                        id,
                                        { requireProvider: view.payOnline },
                                    )
                                ).token,
                                tx,
                            ),
                        invoiceId: id,
                        // Its PDF goes with it (DEC-083): drawn by the send
                        // job, where the business's provider takes
                        // attachments; otherwise the link alone, as before.
                        attachInvoicePdf: true,
                        createdByUserId: ctx.userId,
                    },
                );
                email = { status: queued.status, to: queued.toAddress };
                messageId = queued.id;
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
            // On the invoice's history, in the send's own transaction:
            // who, where, and whether the customer had turned email off.
            await recordInvoiceEvent(tx, {
                organizationId,
                invoiceId: id,
                kind: sendKind(reminder, options.automatic === true),
                actor: options.automatic ? JOB_ACTOR : personActor(ctx),
                channel: email ? "EMAIL" : "THREAD",
                messageId,
                data: email
                    ? { to: email.to, status: email.status, thread }
                    : { thread },
            });
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

    /**
     * When the next reminder may go: a day after the last send that went,
     * by email, into the account thread, or opened on WhatsApp (DEC-173:
     * a WhatsApp reminder counts towards one a day, whichever way the
     * customer was asked).
     */
    async nextReminderAt(
        db: Db,
        invoiceId: string,
        now: Date,
    ): Promise<string | null> {
        const next = await this.nextReminderAtMany(db, [invoiceId], now);
        return next.get(invoiceId) ?? null;
    }

    /**
     * {@link nextReminderAt} for many invoices in three reads (review #17):
     * each invoice's latest send of each kind in the last day. Invoices
     * free to be reminded now are absent.
     */
    async nextReminderAtMany(
        db: Db,
        invoiceIds: readonly string[],
        now: Date,
    ): Promise<Map<string, string>> {
        const out = new Map<string, string>();
        if (invoiceIds.length === 0) return out;
        const ids = [...new Set(invoiceIds)];
        const since = new Date(now.getTime() - DAY_MS);
        // An email that went, or a post into the account thread (A13): a
        // thread-only send counts the same.
        const [emails, posts, whatsapps] = await Promise.all([
            db.message.findMany({
                where: {
                    invoiceId: { in: ids },
                    template: { in: INVOICE_TEMPLATES },
                    status: { in: WENT },
                    createdAt: { gt: since },
                },
                orderBy: { createdAt: "desc" },
                distinct: ["invoiceId"],
                select: { invoiceId: true, createdAt: true },
            }),
            db.customerThreadMessage.findMany({
                where: {
                    invoiceId: { in: ids },
                    event: { in: INVOICE_TEMPLATES },
                    createdAt: { gt: since },
                },
                orderBy: { createdAt: "desc" },
                distinct: ["invoiceId"],
                select: { invoiceId: true, createdAt: true },
            }),
            db.invoiceShare.findMany({
                where: {
                    invoiceId: { in: ids },
                    channel: "WHATSAPP",
                    kind: { in: WHATSAPP_ASKS },
                    createdAt: { gt: since },
                },
                orderBy: { createdAt: "desc" },
                distinct: ["invoiceId"],
                select: { invoiceId: true, createdAt: true },
            }),
        ]);
        const latest = new Map<string, number>();
        for (const sent of [...emails, ...posts, ...whatsapps]) {
            if (!sent.invoiceId) continue;
            const at = sent.createdAt.getTime();
            if (at > (latest.get(sent.invoiceId) ?? -Infinity)) {
                latest.set(sent.invoiceId, at);
            }
        }
        for (const [id, at] of latest) {
            out.set(id, new Date(at + DAY_MS).toISOString());
        }
        return out;
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

    async zone(db: Db, organizationId: string): Promise<string> {
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
        case "NO_EMAIL_PROVIDER":
            return "Connect an email provider in Settings to send invoices. You can copy the pay link instead.";
        case "NO_EMAIL_ADDRESS":
            return "There's no email address to send this to. You can copy the pay link instead.";
        case "AUTOPAY_PENDING":
            return AUTOPAY_CHARGE_IN_PROGRESS;
        default:
            return "This invoice isn't owed, so there's nothing to send.";
    }
}

export function firstName(row: SendRow): string | null {
    const name =
        row.billToName ??
        [row.contact?.firstName, row.contact?.lastName]
            .filter(Boolean)
            .join(" ");
    return name.trim().split(/\s+/)[0] || null;
}

/** The history's word for a send: by hand or automatic, first or reminder. */
function sendKind(reminder: boolean, automatic: boolean): InvoiceEventKind {
    if (automatic) return reminder ? "AUTO_REMINDED" : "AUTO_SENT";
    return reminder ? "REMINDED" : "SENT";
}
