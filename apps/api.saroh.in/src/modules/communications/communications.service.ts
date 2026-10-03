import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type {
    CommunicationProvider,
    Consent,
    Delivery,
    Message,
    Prisma,
} from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { planMeter } from "../billing/metering.service";
import { isReservedContactEmail } from "../contacts/contact-email";
import { authorize } from "../organizations/organization-policy";
import { encryptSecret } from "../payments/crypto";
import type {
    NoticeChannels,
    NoticeReach,
} from "../site-accounts/notice-reach";
import { contactReach, noticeChannels } from "../site-accounts/notice-reach";
import type { MessageSendPayload } from "./message-send.handler";
import { MESSAGE_SEND_TYPE } from "./message-send.handler";
import { isCommsChannel, isSupportedComms } from "./providers/provider.port";
import type {
    AutopayTemplate,
    InvoiceMailVars,
    InvoiceTemplate,
    NoticeTemplate,
    RenderedMessage,
    TeamTemplate,
} from "./transactional";
import { renderTransactional } from "./transactional";

type Db = Prisma.TransactionClient;

/**
 * Who a transactional message may go to — only ever one of three addresses
 * (D17): the bill-to email the invoice kept when it was issued, the email
 * a customer verified when they made their site account, or (F14) the
 * sign-in email of someone on the business's own team. Never an address
 * the caller typed, so the path cannot be turned into a way to email
 * anyone.
 */
export type TransactionalRecipient =
    | { kind: "INVOICE_BILL_TO"; invoiceId: string }
    | { kind: "SITE_ACCOUNT"; contactId: string }
    | { kind: "TEAM_MEMBER"; userId: string };

/**
 * What a transactional message says: an invoice's template with its
 * values, or one of A14's notices or F14's team alerts, already worded by
 * its handler (`site-accounts/notify-templates.ts`,
 * `notifications/team-alert.handler.ts`), or D14's autopay set-up link
 * (`renderAutopaySetupLink`).
 */
export type TransactionalWords =
    | { template: InvoiceTemplate; vars: InvoiceMailVars }
    | {
          template: NoticeTemplate | TeamTemplate | AutopayTemplate;
          rendered: RenderedMessage;
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
    /** The staff member who sent it; null when Saroh did. */
    createdByUserId: string | null;
}

/** A queued (or suppressed) transactional message. */
export interface TransactionalResult {
    id: string;
    status: "QUEUED" | "SUPPRESSED";
    toAddress: string;
}

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
     * Whether the business can send email at all: its own provider,
     * connected. Saroh's own email is never used for a business's customers
     * (DEC-011, default 38).
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
     * site-account email is used, if they have an active account. A team
     * member (F14) is their sign-in email, only while they are on this
     * business's team; no contact is involved.
     */
    async transactionalAddress(
        db: Db,
        organizationId: string,
        recipient: TransactionalRecipient,
    ): Promise<TransactionalAddress | null> {
        if (recipient.kind === "TEAM_MEMBER") {
            const member = await db.membership.findUnique({
                where: {
                    organizationId_userId: {
                        organizationId,
                        userId: recipient.userId,
                    },
                },
                select: { user: { select: { email: true } } },
            });
            const email = member?.user.email.trim();
            return email ? { address: email, contactId: null } : null;
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
        input: TransactionalInput,
    ): Promise<TransactionalResult> {
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
        const provider = await tx.communicationProvider.findUnique({
            where: {
                organizationId_channel: { organizationId, channel: "EMAIL" },
            },
        });
        if (provider?.status !== "CONNECTED") {
            throw new ConflictException(
                "Connect an email provider in Settings to send this.",
            );
        }

        const { subject, body } =
            "rendered" in input
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
            };
        }

        const link = input.secretLink ? await input.secretLink() : null;
        const message = await tx.message.create({
            data: { ...base, status: "QUEUED" },
        });
        const delivery = await tx.delivery.create({
            data: {
                organizationId,
                messageId: message.id,
                provider: provider.provider,
                status: "QUEUED",
            },
        });
        const payload: MessageSendPayload = {
            messageId: message.id,
            deliveryId: delivery.id,
            ...(link ? { link: encryptSecret(link) } : {}),
        };
        await tx.job.create({
            data: {
                organizationId,
                type: MESSAGE_SEND_TYPE,
                payload: payload as unknown as Prisma.InputJsonObject,
            },
        });
        return { id: message.id, status: "QUEUED", toAddress: to.address };
    }

    /**
     * How a notice about a customer's own booking or order reaches them
     * (A14, R17): the business's channels, and for `contactId` that
     * customer's reach (`site-accounts/notice-reach.ts`). `contact:read`,
     * as the booking peek that asks it. Another business's contact reads
     * as reaching nobody, never as a 404 that would confirm it exists.
     */
    async noticeReach(
        ctx: OrganizationContext,
        contactId: string | null,
    ): Promise<NoticeChannels & { reach: NoticeReach | null }> {
        authorize(ctx, "contact:read");
        const channels = await noticeChannels(prisma, ctx.organizationId);
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
