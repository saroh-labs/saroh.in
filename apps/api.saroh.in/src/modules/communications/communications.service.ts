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
} from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { authorize } from "../organizations/organization-policy";
import { encryptSecret } from "../payments/crypto";
import { MESSAGE_SEND_TYPE } from "./message-send.handler";
import { isCommsChannel, isSupportedComms } from "./providers/provider.port";

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

        const row = await prisma.communicationProvider.upsert({
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
        });

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

        await this.requireOwnedContact(ctx, input.contactId);

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
            await this.requireOwnedContact(ctx, contactId);
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
        await this.requireOwnedContact(ctx, contactId);

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
                ctx,
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
            await this.requireOwnedLead(ctx, input.leadId);
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
                        organizationId: ctx.organizationId,
                        channel,
                        contactId,
                        leadId: input.leadId ?? null,
                        toAddress,
                        subject: input.subject ?? null,
                        body: input.body,
                        status: "SUPPRESSED",
                        createdByUserId: ctx.userId,
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
                    organizationId: ctx.organizationId,
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
                    organizationId: ctx.organizationId,
                    channel,
                    contactId,
                    leadId: input.leadId ?? null,
                    toAddress,
                    subject: input.subject ?? null,
                    body: input.body,
                    status: "QUEUED",
                    createdByUserId: ctx.userId,
                },
            });

            const delivery = await tx.delivery.create({
                data: {
                    organizationId: ctx.organizationId,
                    messageId: created.id,
                    provider: providerRow.provider,
                    status: "QUEUED",
                },
            });

            await tx.job.create({
                data: {
                    organizationId: ctx.organizationId,
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
        ctx: OrganizationContext,
        contactId: string,
    ) {
        const contact = await prisma.contact.findUnique({
            where: { id: contactId },
        });
        if (contact?.organizationId !== ctx.organizationId) {
            throw new NotFoundException("Contact not found");
        }
        return contact;
    }

    /** Load a Lead and assert it belongs to the org. 404 otherwise. */
    private async requireOwnedLead(ctx: OrganizationContext, leadId: string) {
        const lead = await prisma.lead.findUnique({ where: { id: leadId } });
        if (lead?.organizationId !== ctx.organizationId) {
            throw new NotFoundException("Lead not found");
        }
        return lead;
    }
}
