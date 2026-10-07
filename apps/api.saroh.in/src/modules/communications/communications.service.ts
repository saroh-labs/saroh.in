import {
    BadRequestException,
    ConflictException,
    Inject,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import type {
    CommunicationProvider,
    Consent,
    Delivery,
    Message,
    Prisma,
} from "@saroh/database";
import { prisma } from "@saroh/database";

import type { ProviderAttention } from "../../common/providers/provider-attention";
import {
    attentionOf,
    NO_ATTENTION,
} from "../../common/providers/provider-attention";
import type { OrganizationContext } from "../../common/types/organization-context";
import { planMeter } from "../billing/metering.service";
import { isReservedContactEmail } from "../contacts/contact-email";
import { allows, authorize } from "../organizations/organization-policy";
import { encryptSecret } from "../payments/crypto";
import type {
    NoticeChannels,
    NoticeReach,
} from "../site-accounts/notice-reach";
import { contactReach, noticeChannels } from "../site-accounts/notice-reach";
import type { NoticeVars } from "../site-accounts/notify-templates";
import { renderNotice } from "../site-accounts/notify-templates";
import type { EmailSetup } from "./email-setup";
import { readEmailSetup } from "./email-setup";
import type { MessageSendPayload } from "./message-send.handler";
import {
    INVOICE_PDF_ATTACHMENT,
    MESSAGE_SEND_TYPE,
} from "./message-send.handler";
import { assertCommsKeysAccepted } from "./provider-keys";
import type { CommsProviderFactory } from "./providers/provider.port";
import {
    COMMS_PROVIDER_FACTORY,
    isCommsChannel,
    isSupportedComms,
} from "./providers/provider.port";
import type { NotEmailed } from "./saroh-delivery";
import { SAROH_REPRESENTATIVE_NOTICE } from "./saroh-delivery";
import type { SarohEmailState } from "./saroh-email-state";
import { sarohEmailState } from "./saroh-email-state";
import type { EmailRoute } from "./saroh-may-send";
import { emailRoute } from "./saroh-may-send";
import { queueSarohInTx, renderForSaroh } from "./saroh-queue";
import type {
    AutopayTemplate,
    InvoiceMailVars,
    InvoiceTemplate,
    NoticeTemplate,
    RenderedMessage,
    ReviewTemplate,
} from "./transactional";
import { renderTransactional } from "./transactional";

type Db = Prisma.TransactionClient;

/**
 * Who a transactional message may go to — only ever one of three
 * addresses (D17): the bill-to email the invoice kept when it was issued,
 * the email a customer verified when they made their site account, or (a
 * review invitation, D11) the email the order's storefront customer gave
 * when they ordered. (The team's own alerts go from Saroh, not this path:
 * `notifications/team-alert.handler.ts`, DEC-011 amended 2026-10-07.) Never an address the caller typed, so the path cannot be
 * turned into a way to email anyone.
 *
 * ORDER_CUSTOMER mirrors INVOICE_BILL_TO: the address is the one the record
 * already holds, read here by the record's id in this business. A review
 * invitation is about an order, and an order names a storefront customer,
 * not a contact or a site account, so neither of those kinds fits it.
 */
export type TransactionalRecipient =
    | { kind: "INVOICE_BILL_TO"; invoiceId: string }
    | { kind: "SITE_ACCOUNT"; contactId: string }
    | { kind: "ORDER_CUSTOMER"; orderId: string };

/**
 * What a transactional message says: an invoice's template with its
 * values, or one of A14's notices already worded by its handler
 * (`site-accounts/notify-templates.ts`), D14's autopay set-up link
 * (`renderAutopaySetupLink`), or a review invitation.
 */
export type TransactionalWords =
    | { template: InvoiceTemplate; vars: InvoiceMailVars }
    | {
          template: NoticeTemplate | AutopayTemplate | ReviewTemplate;
          rendered: RenderedMessage;
      }
    | {
          /**
           * A14's notice with its values, worded here: through the
           * business's provider as `renderNotice` words it, or (a booking
           * notice with no provider, DEC-086) as Saroh sends it, its names
           * cleaned and Saroh's footer added (`renderSarohNotice`).
           */
          template: NoticeTemplate;
          notice: NoticeVars;
          /**
           * Who emails it, when the caller already decided on this
           * transaction (`emailRoute`, the notify handler): not decided
           * again, so a switch flipped since can't turn it into a 409
           * inside the caller's transaction, and the provider and plan
           * aren't read twice. A route of nobody is still refused.
           */
          route?: EmailRoute;
          /**
           * The booking the notice is about, for Saroh's cap per booking
           * (`SAROH_EMAILS_PER_BOOKING_PER_DAY`); a business's own
           * provider has none.
           */
          bookingId?: string | null;
      };

/** Input for {@link CommunicationsService.queueTransactional}. */
export type TransactionalInput = TransactionalWords & TransactionalSend;

/** Who it goes to and what it carries, whatever it says. */
export interface TransactionalSend {
    recipient: TransactionalRecipient;
    /**
     * Makes the secret link the body points at (a fresh pay link). Called
     * only when the message will really go, so a suppressed send never
     * retires the link the business already shared.
     */
    secretLink?: () => Promise<string>;
    /** The invoice it is about, recorded on the Message. */
    invoiceId?: string;
    /**
     * Attach the invoice's PDF (DEC-083): `invoiceId`'s paper, drawn by the
     * send job when it hands the email over, where the provider takes
     * attachments. Nothing is drawn or stored now.
     */
    attachInvoicePdf?: boolean;
    /** The staff member who sent it; null when Saroh did. */
    createdByUserId: string | null;
}

/** A queued (or suppressed) transactional message. */
export interface TransactionalResult {
    id: string;
    /** SUPPRESSED: they turned email off. */
    status: "QUEUED" | "SUPPRESSED";
    toAddress: string;
    /** Who sends it: the business's own provider, or Saroh (DEC-086). */
    route?: "PROVIDER" | "SAROH";
}

/**
 * A notice given as its values: it may go through Saroh (DEC-086), where it
 * can also be recorded and not emailed — ALLOWANCE_USED, NO_ALLOWANCE or
 * BOOKING_LIMIT (`saroh-queue.ts`).
 */
export interface NoticeTransactionalResult extends Omit<
    TransactionalResult,
    "status"
> {
    status: TransactionalResult["status"] | NotEmailed;
}

/** {@link TransactionalInput} given as a notice's values. */
export type NoticeTransactionalInput = Extract<
    TransactionalInput,
    { notice: NoticeVars }
>;

/** Where an email for this recipient would go, with the contact it is for. */
export interface TransactionalAddress {
    address: string;
    contactId: string | null;
}

/** Validated input for {@link CommunicationsService.connectProvider}. */
export interface ConnectCommsInput {
    channel: string;
    provider: string;
    fromAddress?: string;
    credentials: Record<string, unknown>;
}

/** Validated input for {@link CommunicationsService.setConsent}. */
export interface SetConsentInput {
    contactId: string;
    channel: string;
    status: string;
    source?: string;
}

/** Validated input for {@link CommunicationsService.sendMessage}. */
export interface SendMessageInput {
    channel: string;
    contactId?: string;
    toAddress?: string;
    leadId?: string;
    subject?: string;
    body: string;
}

/** A REDACTED provider view — safe to return; never carries secret material. */
export interface RedactedCommsProvider {
    id: string;
    channel: string;
    provider: string;
    status: string;
    fromAddress: string | null;
    /**
     * Null while it works; else the provider refused these keys on a live
     * send (UX-012) — `{ reason: "KEYS_REFUSED", since }` — until they are
     * entered again.
     */
    attention: ProviderAttention | null;
    createdAt: Date;
    updatedAt: Date;
}

/** The result of queueing a message — the id + its (possibly SUPPRESSED) status. */
export interface QueueMessageResult {
    id: string;
    status: string;
    channel: string;
}

/** Strip every secret/encrypted field — only the safe columns survive. */
function redact(row: CommunicationProvider): RedactedCommsProvider {
    return {
        id: row.id,
        channel: row.channel,
        provider: row.provider,
        status: row.status,
        fromAddress: row.fromAddress ?? null,
        attention: attentionOf(row),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

/**
 * Org communications service (S6-001).
 *
 * Owns the auditable lifecycle of an outbound business message sent over the
 * Organization's OWN connected provider. Every operation is tenant-scoped by
 * `ctx.organizationId` (proven by the guards, never client-supplied):
 *
 *  1. Connect a provider — the org's credential blob is AES-256-GCM sealed
 *     before it ever touches the DB (same crypto as merchant payments); only
 *     ciphertext/iv/authTag (+ the non-secret fromAddress) are stored and
 *     responses are REDACTED, so the secret is never echoed or logged.
 *  2. Record consent — a contact's per-channel opt-in/out, checked before send.
 *  3. Queue a message — resolves the recipient, enforces the consent gate
 *     (a REVOKED consent SUPPRESSES the message with no delivery/job), requires
 *     a CONNECTED provider, then atomically creates the Message + Delivery +
 *     `message.send` outbox Job. Actual delivery happens in the job handler.
 */
@Injectable()
export class CommunicationsService {
    constructor(
        // The adapters, for the connect-time key check (UX-012). Absent
        // where a test builds the service by hand: nothing is checked then.
        @Optional()
        @Inject(COMMS_PROVIDER_FACTORY)
        private readonly factory?: CommsProviderFactory,
    ) {}

    // ---- Providers ---------------------------------------------------------

    /**
     * Connect (or re-connect) the org's provider for a channel. `comms:manage`.
     * The credential map is sealed with {@link encryptSecret} and upserted
     * (unique per org+channel); only the encrypted blob + fromAddress are
     * persisted. Returns a redacted view — never the secret.
     */
    async connectProvider(
        ctx: OrganizationContext,
        input: ConnectCommsInput,
    ): Promise<RedactedCommsProvider> {
        authorize(ctx, "comms:manage");

        const channel = input.channel.toUpperCase();
        if (!isCommsChannel(channel)) {
            throw new BadRequestException(
                `Unsupported channel "${input.channel}"`,
            );
        }
        const provider = input.provider.toUpperCase();
        if (!isSupportedComms(channel, provider)) {
            throw new BadRequestException(
                `Unsupported provider "${input.provider}" for channel "${channel}"`,
            );
        }

        const credentials = this.normalizeCredentials(input.credentials);

        // The key must work before it is kept (UX-012); Resend's sending
        // domain must be verified too. 400 when the provider refuses.
        if (this.factory) {
            await assertCommsKeysAccepted(this.factory.get(channel, provider), {
                provider,
                credentials,
                fromAddress: input.fromAddress ?? null,
            });
        }

        // Seal the whole credential map as one blob. Plaintext is NEVER
        // persisted or logged.
        const sealed = encryptSecret(JSON.stringify(credentials));

        // The plan's integrations cap (U13): a new connection is checked;
        // changing the keys of a connected one adds nothing.
        const row = await planMeter.withRoom(
            ctx.organizationId,
            "integrations",
            (tx) =>
                tx.communicationProvider.upsert({
                    where: {
                        organizationId_channel: {
                            organizationId: ctx.organizationId,
                            channel,
                        },
                    },
                    create: {
                        organizationId: ctx.organizationId,
                        channel,
                        provider,
                        status: "CONNECTED",
                        fromAddress: input.fromAddress ?? null,
                        encryptedCredentials: sealed.ciphertext,
                        credentialsIv: sealed.iv,
                        credentialsAuthTag: sealed.authTag,
                    },
                    update: {
                        provider,
                        status: "CONNECTED",
                        fromAddress: input.fromAddress ?? null,
                        encryptedCredentials: sealed.ciphertext,
                        credentialsIv: sealed.iv,
                        credentialsAuthTag: sealed.authTag,
                        ...NO_ATTENTION,
                    },
                }),
            {
                addingIn: async (tx) =>
                    (await tx.communicationProvider.count({
                        where: {
                            organizationId: ctx.organizationId,
                            channel,
                            status: "CONNECTED",
                        },
                    })) > 0
                        ? 0
                        : 1,
            },
        );

        return redact(row);
    }

    /** List the org's connected providers, redacted. `comms:manage`. */
    async listProviders(
        ctx: OrganizationContext,
    ): Promise<RedactedCommsProvider[]> {
        authorize(ctx, "comms:manage");
        const rows = await prisma.communicationProvider.findMany({
            where: { organizationId: ctx.organizationId },
            orderBy: { createdAt: "desc" },
        });
        return rows.map(redact);
    }

    /**
     * Whether Saroh sends the business's booking emails for it, and how
     * much of the month's allowance is used (DEC-086), for Settings →
     * Providers. `comms:manage`, as the provider list beside it. The same
     * rule as the send (`saroh-email-state.ts`); a failed lookup reads as
     * UNREAD, never as off or a zero.
     */
    /**
     * Whether the business has its own email provider, and if not whether
     * its plan lets it connect one (DEC-011, amended 2026-10-07; DEC-091):
     * what the workspace's "connect your email" prompt is drawn from. For
     * whoever can act on it — `comms:manage` to connect, `billing:read` for
     * the plans — and nobody else.
     */
    async emailSetup(ctx: OrganizationContext): Promise<EmailSetup> {
        if (!allows(ctx, "comms:manage") && !allows(ctx, "billing:read")) {
            authorize(ctx, "comms:manage");
        }
        return readEmailSetup(prisma, ctx.organizationId);
    }

    async sarohEmail(ctx: OrganizationContext): Promise<SarohEmailState> {
        authorize(ctx, "comms:manage");
        return sarohEmailState(prisma, ctx.organizationId);
    }

    /**
     * Disconnect the org's provider for a channel (set DISABLED). `comms:manage`.
     * Cross-tenant or missing → 404. The encrypted credentials are left in place
     * but the row is no longer CONNECTED, so it can't back a new send.
     */
    async disconnectProvider(
        ctx: OrganizationContext,
        channel: string,
    ): Promise<RedactedCommsProvider> {
        authorize(ctx, "comms:manage");

        const name = channel.toUpperCase();
        if (!isCommsChannel(name)) {
            throw new BadRequestException(`Unsupported channel "${channel}"`);
        }
        const row = await prisma.communicationProvider.findUnique({
            where: {
                organizationId_channel: {
                    organizationId: ctx.organizationId,
                    channel: name,
                },
            },
        });
        if (!row) {
            throw new NotFoundException("Provider not found");
        }
        const updated = await prisma.communicationProvider.update({
            where: { id: row.id },
            data: { status: "DISABLED" },
        });
        return redact(updated);
    }

    // ---- Consent -----------------------------------------------------------

    /**
     * Set (upsert) a contact's consent for a channel. `consent:write`. The
     * contact must belong to the org (404 otherwise). The stored row is what
     * {@link sendMessage} checks before ever handing a message to a provider.
     */
    async setConsent(
        ctx: OrganizationContext,
        input: SetConsentInput,
    ): Promise<Consent> {
        authorize(ctx, "consent:write");

        const channel = input.channel.toUpperCase();
        if (!isCommsChannel(channel)) {
            throw new BadRequestException(
                `Unsupported channel "${input.channel}"`,
            );
        }
        const status = input.status.toUpperCase();
        if (status !== "GRANTED" && status !== "REVOKED") {
            throw new BadRequestException(
                `Unsupported status "${input.status}"`,
            );
        }

        await this.requireOwnedContact(ctx.organizationId, input.contactId);

        return prisma.consent.upsert({
            where: {
                contactId_channel: {
                    contactId: input.contactId,
                    channel,
                },
            },
            create: {
                organizationId: ctx.organizationId,
                contactId: input.contactId,
                channel,
                status,
                source: input.source ?? null,
            },
            update: {
                status,
                source: input.source ?? null,
            },
        });
    }

    /**
     * List the org's consents, optionally scoped to one contact. `consent:read`.
     * When a `contactId` is given it must belong to the org (404 otherwise).
     */
    async listConsents(
        ctx: OrganizationContext,
        contactId?: string,
    ): Promise<Consent[]> {
        authorize(ctx, "consent:read");
        if (contactId) {
            await this.requireOwnedContact(ctx.organizationId, contactId);
        }
        return prisma.consent.findMany({
            where: {
                organizationId: ctx.organizationId,
                ...(contactId ? { contactId } : {}),
            },
            orderBy: { createdAt: "desc" },
        });
    }

    /**
     * Get a contact's stored consent for a channel, or `null` when none is on
     * record (absence = allowed, see {@link sendMessage}). `consent:read`. The
     * contact must belong to the org (404 otherwise).
     */
    async getConsent(
        ctx: OrganizationContext,
        contactId: string,
        channel: string,
    ): Promise<Consent | null> {
        authorize(ctx, "consent:read");

        const name = channel.toUpperCase();
        if (!isCommsChannel(name)) {
            throw new BadRequestException(`Unsupported channel "${channel}"`);
        }
        await this.requireOwnedContact(ctx.organizationId, contactId);

        return prisma.consent.findUnique({
            where: { contactId_channel: { contactId, channel: name } },
        });
    }

    // ---- Send --------------------------------------------------------------

    /**
     * Queue an outbound message. `message:write`.
     *
     * - Resolves the recipient: a `contactId` (the org's own Contact, whose
     *   email/phone is used — 404 if cross-tenant/missing) OR an explicit
     *   `toAddress`.
     * - CONSENT GATE: if the contact has a REVOKED {@link Consent} for the
     *   channel, the Message is created SUPPRESSED and NOTHING is sent or
     *   enqueued (auditable that it was blocked). No consent row = allowed.
     * - Requires a CONNECTED provider for the channel (400 if none, 409 if
     *   present but DISABLED).
     * - Atomically creates the Message (QUEUED) + Delivery (QUEUED) + a
     *   `message.send` outbox Job in one `$transaction`, so a committed Message
     *   ALWAYS has a queued delivery job. Returns the message id + status.
     */
    async sendMessage(
        ctx: OrganizationContext,
        input: SendMessageInput,
    ): Promise<QueueMessageResult> {
        authorize(ctx, "message:write");
        return this.queueMessage(ctx.organizationId, ctx.userId, input);
    }

    /**
     * SYSTEM send — queue a message on behalf of the platform (automations,
     * S6-003), NOT a request actor. There is no `authorize` here on purpose: the
     * caller is a background job whose `organizationId` was already resolved from
     * the triggering domain row (e.g. the new Lead), never from client input. The
     * `createdByUserId` is null (a system-authored message). Everything else —
     * recipient resolution, the consent gate, the CONNECTED-provider requirement,
     * and the atomic Message+Delivery+Job outbox — is IDENTICAL to a user send,
     * because it runs through the same {@link queueMessage} core.
     */
    async sendMessageAsSystem(
        organizationId: string,
        input: SendMessageInput,
    ): Promise<QueueMessageResult> {
        return this.queueMessage(organizationId, null, input);
    }

    /**
     * The shared send core behind {@link sendMessage} (user) and
     * {@link sendMessageAsSystem} (automation). Assumes the caller has already
     * authorized: it resolves the recipient, enforces the consent gate, requires
     * a CONNECTED provider, and atomically creates Message + Delivery + Job.
     */
    private async queueMessage(
        organizationId: string,
        createdByUserId: string | null,
        input: SendMessageInput,
    ): Promise<QueueMessageResult> {
        const channel = input.channel.toUpperCase();
        if (!isCommsChannel(channel)) {
            throw new BadRequestException(
                `Unsupported channel "${input.channel}"`,
            );
        }

        // Resolve the recipient — either the org's Contact, or an explicit
        // address.
        let contactId: string | null = null;
        let toAddress: string;
        if (input.contactId) {
            const contact = await this.requireOwnedContact(
                organizationId,
                input.contactId,
            );
            contactId = contact.id;
            const resolved =
                channel === "EMAIL" ? contact.email : contact.phone;
            if (!resolved) {
                throw new BadRequestException(
                    `Contact has no ${channel === "EMAIL" ? "email" : "phone"} for this channel`,
                );
            }
            toAddress = resolved;
        } else if (input.toAddress) {
            toAddress = input.toAddress;
        } else {
            throw new BadRequestException(
                "A contactId or toAddress is required",
            );
        }

        // Validate an optional Lead link belongs to the org.
        if (input.leadId) {
            await this.requireOwnedLead(organizationId, input.leadId);
        }

        // CONSENT GATE: a REVOKED consent for this contact+channel suppresses
        // the send. Recorded as an auditable SUPPRESSED Message with NO delivery
        // and NO job. A missing consent row is treated as allowed (documented).
        if (contactId) {
            const consent = await prisma.consent.findUnique({
                where: {
                    contactId_channel: { contactId, channel },
                },
            });
            if (consent?.status === "REVOKED") {
                const suppressed = await prisma.message.create({
                    data: {
                        organizationId,
                        channel,
                        contactId,
                        leadId: input.leadId ?? null,
                        toAddress,
                        subject: input.subject ?? null,
                        body: input.body,
                        status: "SUPPRESSED",
                        createdByUserId,
                    },
                });
                return {
                    id: suppressed.id,
                    status: suppressed.status,
                    channel: suppressed.channel,
                };
            }
        }

        // Require a CONNECTED provider for the channel.
        const providerRow = await prisma.communicationProvider.findUnique({
            where: {
                organizationId_channel: {
                    organizationId,
                    channel,
                },
            },
        });
        if (!providerRow) {
            throw new BadRequestException(
                `No connected provider for channel "${channel}"`,
            );
        }
        if (providerRow.status !== "CONNECTED") {
            throw new ConflictException(
                `Provider for channel "${channel}" is not connected`,
            );
        }

        // Atomic outbox: Message + Delivery + Job commit together, so a queued
        // message ALWAYS has a pending delivery job (no lost work, no dual-write
        // race). The handler (message.send) performs the actual provider call.
        const message = await prisma.$transaction(async (tx) => {
            const created = await tx.message.create({
                data: {
                    organizationId,
                    channel,
                    contactId,
                    leadId: input.leadId ?? null,
                    toAddress,
                    subject: input.subject ?? null,
                    body: input.body,
                    status: "QUEUED",
                    createdByUserId,
                },
            });

            const delivery = await tx.delivery.create({
                data: {
                    organizationId,
                    messageId: created.id,
                    provider: providerRow.provider,
                    status: "QUEUED",
                },
            });

            await tx.job.create({
                data: {
                    organizationId,
                    type: MESSAGE_SEND_TYPE,
                    payload: {
                        messageId: created.id,
                        deliveryId: delivery.id,
                    },
                },
            });

            return created;
        });

        return {
            id: message.id,
            status: message.status,
            channel: message.channel,
        };
    }

    // ---- Transactional (D17; A14 reuses it) -------------------------------

    /**
     * Whether the business's own email provider is connected. A business's
     * email to its customers — invoices, autopay, notices, review
     * invitations — needs it (DEC-011, amended 2026-10-07). The team's own
     * alerts don't: Saroh sends those.
     */
    async emailConnected(db: Db, organizationId: string): Promise<boolean> {
        const row = await db.communicationProvider.findUnique({
            where: {
                organizationId_channel: { organizationId, channel: "EMAIL" },
            },
            select: { status: true },
        });
        return row?.status === "CONNECTED";
    }

    /**
     * The one address a transactional email for `recipient` may go to, or
     * null when there is none. An invoice's bill-to email comes first (a
     * draft's is the contact's, which issuing copies); a reserved
     * placeholder (DEC-049) is no email, and then the contact's verified
     * site-account email is used, if they have an active account. An order's customer (a
     * review invitation) is the email their storefront customer record
     * holds, unless it is a placeholder; the contact is the one most
     * recently linked to that customer, if any (consent is read on it).
     */
    async transactionalAddress(
        db: Db,
        organizationId: string,
        recipient: TransactionalRecipient,
    ): Promise<TransactionalAddress | null> {
        if (recipient.kind === "ORDER_CUSTOMER") {
            const order = await db.order.findFirst({
                where: { id: recipient.orderId, organizationId },
                select: {
                    customerId: true,
                    customer: { select: { email: true } },
                },
            });
            const email = order?.customer?.email.trim();
            if (!order?.customerId || !email || isReservedContactEmail(email)) {
                return null;
            }
            const link = await db.customerIdentityLink.findFirst({
                where: { organizationId, customerId: order.customerId },
                orderBy: { createdAt: "desc" },
                select: { contactId: true },
            });
            return { address: email, contactId: link?.contactId ?? null };
        }
        let contactId: string | null;
        let candidate: string | null = null;
        if (recipient.kind === "INVOICE_BILL_TO") {
            const invoice = await db.invoice.findFirst({
                where: { id: recipient.invoiceId, organizationId },
                select: {
                    status: true,
                    billToEmail: true,
                    contactId: true,
                    contact: { select: { email: true } },
                },
            });
            if (!invoice) return null;
            contactId = invoice.contactId;
            candidate =
                invoice.status === "DRAFT"
                    ? (invoice.contact?.email ?? null)
                    : invoice.billToEmail;
        } else {
            contactId = recipient.contactId;
        }
        if (candidate?.trim() && !isReservedContactEmail(candidate)) {
            return { address: candidate.trim(), contactId };
        }
        if (!contactId) return null;
        const account = await db.customerAccount.findFirst({
            where: { organizationId, contactId, status: "ACTIVE" },
            orderBy: { linkedAt: "desc" },
            select: { email: true },
        });
        return account ? { address: account.email, contactId } : null;
    }

    /**
     * THE transactional send path (D17). The caller has authorized and
     * holds the transaction, so the message commits or rolls back with what
     * it is about (an invoice's new pay link, say).
     *
     * - The address comes only from {@link transactionalAddress}: none → 409.
     * - The business's own EMAIL provider must be connected: otherwise 409.
     * - A REVOKED email consent still suppresses it: a SUPPRESSED Message is
     *   written for the record, with no delivery and no job, and the secret
     *   link is never made. No marketing opt-in is asked (default 10).
     * - Otherwise Message + Delivery + `message.send` Job, as any send. A
     *   secret link is sealed into the job's payload (AES-256-GCM, the
     *   credentials' key) and put into the email only when the job hands it
     *   to the provider; the stored body keeps the slot.
     */
    async queueTransactional(
        tx: Db,
        organizationId: string,
        input: NoticeTransactionalInput,
    ): Promise<NoticeTransactionalResult>;
    async queueTransactional(
        tx: Db,
        organizationId: string,
        input: Exclude<TransactionalInput, { notice: NoticeVars }>,
    ): Promise<TransactionalResult>;
    async queueTransactional(
        tx: Db,
        organizationId: string,
        input: TransactionalInput,
    ): Promise<NoticeTransactionalResult> {
        const to = await this.transactionalAddress(
            tx,
            organizationId,
            input.recipient,
        );
        if (!to) {
            throw new ConflictException(
                "There's no email address to send this to.",
            );
        }
        // Who emails it, read once (DEC-086): the business's own connected
        // provider; else, for a booking notice, Saroh when the one rule
        // says so; anything else with no provider is refused as ever.
        const route =
            ("notice" in input ? input.route : undefined) ??
            (await emailRoute(
                tx,
                organizationId,
                "notice" in input ? input.template : undefined,
            ));
        if (route.route === null) {
            throw new ConflictException(
                "Connect an email provider in Settings to send this.",
            );
        }
        const saroh = route.route === "SAROH" && "notice" in input;

        const { subject, body } = saroh
            ? await renderForSaroh(tx, organizationId, input)
            : "notice" in input
              ? renderNotice(input.notice)
              : "rendered" in input
                ? input.rendered
                : renderTransactional(input.template, input.vars);
        const base = {
            organizationId,
            channel: "EMAIL",
            contactId: to.contactId,
            toAddress: to.address,
            subject,
            body,
            createdByUserId: input.createdByUserId,
            invoiceId: input.invoiceId ?? null,
            template: input.template,
        };

        const consent = to.contactId
            ? await tx.consent.findUnique({
                  where: {
                      contactId_channel: {
                          contactId: to.contactId,
                          channel: "EMAIL",
                      },
                  },
                  select: { status: true },
              })
            : null;
        if (consent?.status === "REVOKED") {
            const suppressed = await tx.message.create({
                data: { ...base, status: "SUPPRESSED" },
            });
            return {
                id: suppressed.id,
                status: "SUPPRESSED",
                toAddress: to.address,
                route: route.route,
            };
        }

        if (route.route === "SAROH") {
            return queueSarohInTx(
                tx,
                organizationId,
                base,
                { bookingId: "notice" in input ? input.bookingId : null },
                { allowance: route.allowance },
            );
        }

        const link = input.secretLink ? await input.secretLink() : null;
        const message = await tx.message.create({
            data: { ...base, status: "QUEUED" },
        });
        const delivery = await tx.delivery.create({
            data: {
                organizationId,
                messageId: message.id,
                provider: route.provider,
                status: "QUEUED",
            },
        });
        const payload: MessageSendPayload = {
            messageId: message.id,
            deliveryId: delivery.id,
            ...(link ? { link: encryptSecret(link) } : {}),
            ...(input.attachInvoicePdf && input.invoiceId
                ? { attach: INVOICE_PDF_ATTACHMENT }
                : {}),
        };
        await tx.job.create({
            data: {
                organizationId,
                type: MESSAGE_SEND_TYPE,
                payload: payload as unknown as Prisma.InputJsonObject,
            },
        });
        return {
            id: message.id,
            status: "QUEUED",
            toAddress: to.address,
            route: "PROVIDER",
        };
    }

    /**
     * How a notice about a customer's own booking reaches them (A14,
     * R17): the business's channels, and for `contactId` that customer's
     * reach (`site-accounts/notice-reach.ts`). `contact:read`, as the
     * booking peek and the class cancel that ask it. A booking notice, so
     * email counts Saroh's sending too (DEC-086): every booking notice
     * kind reads the same. Another business's contact reads as reaching
     * nobody, never as a 404 that would confirm it exists.
     */
    async noticeReach(
        ctx: OrganizationContext,
        contactId: string | null,
    ): Promise<NoticeChannels & { reach: NoticeReach | null }> {
        authorize(ctx, "contact:read");
        const channels = await noticeChannels(
            prisma,
            ctx.organizationId,
            SAROH_REPRESENTATIVE_NOTICE,
        );
        const reach = contactId
            ? await contactReach(
                  prisma,
                  ctx.organizationId,
                  contactId,
                  channels,
              )
            : null;
        return { ...channels, reach };
    }

    // ---- Reads (auditable lifecycle) --------------------------------------

    /**
     * List the org's messages (+ their deliveries), optionally scoped to a Lead
     * or Contact — the auditable lifecycle view. `message:read`.
     */
    async listMessages(
        ctx: OrganizationContext,
        filter: { leadId?: string; contactId?: string } = {},
    ): Promise<(Message & { deliveries: Delivery[] })[]> {
        authorize(ctx, "message:read");
        return prisma.message.findMany({
            where: {
                organizationId: ctx.organizationId,
                ...(filter.leadId ? { leadId: filter.leadId } : {}),
                ...(filter.contactId ? { contactId: filter.contactId } : {}),
            },
            include: { deliveries: { orderBy: { createdAt: "asc" } } },
            orderBy: { createdAt: "desc" },
        });
    }

    /**
     * Get one of the org's messages (+ its deliveries). `message:read`.
     * Cross-tenant or missing → 404.
     */
    async getMessage(
        ctx: OrganizationContext,
        messageId: string,
    ): Promise<Message & { deliveries: Delivery[] }> {
        authorize(ctx, "message:read");
        const message = await prisma.message.findUnique({
            where: { id: messageId },
            include: { deliveries: { orderBy: { createdAt: "asc" } } },
        });
        if (message?.organizationId !== ctx.organizationId) {
            throw new NotFoundException("Message not found");
        }
        return message;
    }

    // ---- Helpers ----------------------------------------------------------
    // (private tenancy/validation helpers below)

    /**
     * Coerce the inbound credential map to a `Record<string,string>`, rejecting
     * a non-string value (so the sealed blob is always well-formed) and an empty
     * map (a connect with no credentials is a mistake). Never logs a value.
     */
    private normalizeCredentials(
        credentials: Record<string, unknown>,
    ): Record<string, string> {
        const entries = Object.entries(credentials);
        if (entries.length === 0) {
            throw new BadRequestException("credentials must not be empty");
        }
        const out: Record<string, string> = {};
        for (const [key, value] of entries) {
            if (typeof value !== "string") {
                throw new BadRequestException(
                    `credential "${key}" must be a string`,
                );
            }
            out[key] = value;
        }
        return out;
    }

    /**
     * Load a Contact and assert it belongs to `ctx.organizationId`. 404 for a
     * missing OR cross-tenant id — never a 403, so a caller can't probe which
     * contacts exist in another org.
     */
    private async requireOwnedContact(
        organizationId: string,
        contactId: string,
    ) {
        const contact = await prisma.contact.findUnique({
            where: { id: contactId },
        });
        if (contact?.organizationId !== organizationId) {
            throw new NotFoundException("Contact not found");
        }
        return contact;
    }

    /** Load a Lead and assert it belongs to the org. 404 otherwise. */
    private async requireOwnedLead(organizationId: string, leadId: string) {
        const lead = await prisma.lead.findUnique({ where: { id: leadId } });
        if (lead?.organizationId !== organizationId) {
            throw new NotFoundException("Lead not found");
        }
        return lead;
    }
}
