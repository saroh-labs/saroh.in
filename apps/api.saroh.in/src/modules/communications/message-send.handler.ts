import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import type { Job, Message } from "@saroh/database";
import { prisma } from "@saroh/database";

import { IssuedInvoicePdf } from "../invoices/issued-invoice-pdf";
import type { EncryptedSecret } from "../payments/crypto";
import { decryptSecret } from "../payments/crypto";
import { stampConfirmedEmail } from "./confirmation-stamp";
import type {
    CommsAttachment,
    CommsCredentials,
    CommsProvider,
    CommsProviderFactory,
} from "./providers/provider.port";
import {
    COMMS_PROVIDER_FACTORY,
    isCommsChannel,
} from "./providers/provider.port";
import { SAROH_PROVIDER, SAROH_STOPPED, SAROH_UNKNOWN } from "./saroh-delivery";
import { deliverThroughSaroh } from "./saroh-send";
import { fillSecretLink, SECRET_LINK_SLOT } from "./transactional";

/** The `type` this handler is registered under (matches the send producer). */
export const MESSAGE_SEND_TYPE = "message.send";

/**
 * Payload the {@link CommunicationsService.sendMessage} enqueues inside the
 * message's transaction. Only the ids are load-bearing — the handler re-derives
 * everything else from the Delivery/Message/Provider so it never trusts stale
 * data.
 */
export interface MessageSendPayload {
    messageId: string;
    deliveryId: string;
    /**
     * A transactional message's secret link (an invoice's pay link, D17),
     * sealed with the credentials' key. It is opened only here, put into the
     * body where the stored one has the slot, and never logged or written
     * back.
     */
    link?: EncryptedSecret;
    /**
     * Send the invoice's PDF with it (DEC-083): the message's own invoice,
     * drawn here at send time and never stored. Only where the provider
     * takes attachments; otherwise, or if it can't be drawn, the email goes
     * with its link alone.
     */
    attach?: typeof INVOICE_PDF_ATTACHMENT;
}

/** The one attachment a message can ask for: its invoice's PDF. */
export const INVOICE_PDF_ATTACHMENT = "INVOICE_PDF";

/**
 * The largest PDF sent as an attachment. The paper is a few hundred KB at
 * most (its logo is capped at 2 MB by `invoice-pdf-logo.ts`); past this,
 * the email goes with its link alone rather than risk a provider's or an
 * inbox's limit.
 */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/** Delivery states that are terminal-success — a re-run must NOT re-send. */
const SENT_STATES = new Set(["SENT", "DELIVERED"]);

/**
 * A Saroh delivery's own terminal states (DEC-086): STOPPED never goes, and
 * UNKNOWN may already have gone, so a re-run must not send either.
 */
const SAROH_TERMINAL_STATES = new Set([SAROH_STOPPED, SAROH_UNKNOWN]);

/**
 * Consumer for the `message.send` job (S6-001): take a QUEUED Delivery and hand
 * its Message to the org's connected provider, then record the outcome for the
 * auditable lifecycle.
 *
 * Delivery is AT-LEAST-ONCE (the job worker may run this more than once), so the
 * handler is idempotent by construction:
 *
 *  - It loads the Delivery FIRST and short-circuits to a no-op if it is already
 *    SENT/DELIVERED — a re-run of the same job never double-sends.
 *  - On a provider success it flips the Delivery QUEUED → SENT (+
 *    providerMessageId, attempts++) and the Message → SENT.
 *  - On a provider failure it records the Delivery FAILED (+ sanitized error,
 *    attempts++) and the Message → FAILED, then RE-THROWS so the durable worker
 *    retries with backoff; the SENT guard keeps a later success from being
 *    undone and keeps a completed send from re-firing.
 *  - Once a booking or order confirmation is accepted, the contact's email
 *    is stamped verified when they made it online with that email (A14,
 *    DEC-049, `confirmation-stamp.ts`). Only after a success: a failed send
 *    stamps nothing.
 *
 * SECURITY: credentials are decrypted in-memory ONLY at the instant of the
 * provider call and never logged; provider errors are already sanitized by the
 * adapters (HTTP status only), so the stored `error` never carries secrets.
 */
@Injectable()
export class MessageSendHandler {
    private readonly logger = new Logger(MessageSendHandler.name);

    constructor(
        @Inject(COMMS_PROVIDER_FACTORY)
        private readonly factory: CommsProviderFactory,
        // The invoice PDF for an invoice email (DEC-083); absent where a
        // test builds the handler by hand, and then nothing is attached.
        @Optional() private readonly invoicePdfs?: IssuedInvoicePdf,
    ) {}

    /** Bound {@link JobHandler} to register with the {@link JobHandlerRegistry}. */
    readonly handle = async (job: Job): Promise<void> => {
        const { messageId, deliveryId, link, attach } =
            job.payload as unknown as MessageSendPayload;

        const delivery = await prisma.delivery.findUnique({
            where: { id: deliveryId },
        });
        if (!delivery) {
            // The delivery vanished (message deleted before the job ran).
            // Nothing to send — complete as a no-op rather than retry forever.
            this.logger.warn(
                `message.send: delivery ${deliveryId} not found; completing as no-op.`,
            );
            return;
        }

        // Idempotency: an already-sent delivery is a no-op. A re-run of the same
        // at-least-once job must never hand the same message to the provider
        // twice.
        if (SENT_STATES.has(delivery.status)) {
            this.logger.log(
                `message.send: delivery ${deliveryId} already ${delivery.status}; skipping.`,
            );
            return;
        }
        if (
            delivery.provider === SAROH_PROVIDER &&
            SAROH_TERMINAL_STATES.has(delivery.status)
        ) {
            this.logger.log(
                `message.send: Saroh delivery ${deliveryId} already ${delivery.status}; skipping.`,
            );
            return;
        }

        const message = await prisma.message.findUnique({
            where: { id: messageId },
        });
        if (!message) {
            this.logger.warn(
                `message.send: message ${messageId} not found; completing as no-op.`,
            );
            return;
        }

        if (!isCommsChannel(message.channel)) {
            await this.recordFailure(
                delivery.id,
                message.id,
                `unsupported channel "${message.channel}"`,
            );
            return;
        }

        // Saroh sends it for a business with no email of its own (DEC-086):
        // the route stamped when it was queued wins, so a provider connected
        // since never sends it a second way.
        if (delivery.provider === SAROH_PROVIDER) {
            if (await deliverThroughSaroh(delivery.id, message)) {
                await this.stamp(message);
            }
            return;
        }

        const providerRow = await prisma.communicationProvider.findUnique({
            where: {
                organizationId_channel: {
                    organizationId: message.organizationId,
                    channel: message.channel,
                },
            },
        });
        if (providerRow?.status !== "CONNECTED") {
            await this.recordFailure(
                delivery.id,
                message.id,
                "no connected provider for channel",
            );
            return;
        }

        // A body waiting for its secret link goes nowhere without it.
        let body = message.body;
        if (body.includes(SECRET_LINK_SLOT)) {
            if (!link) {
                await this.recordFailure(
                    delivery.id,
                    message.id,
                    "secret link missing",
                );
                return;
            }
            body = fillSecretLink(body, decryptSecret(link));
        }

        const credentials = this.openCredentials(providerRow);
        const provider = this.factory.get(
            message.channel,
            providerRow.provider,
        );

        const attachments =
            attach === INVOICE_PDF_ATTACHMENT
                ? await this.invoicePdf(message, provider, providerRow.provider)
                : [];

        try {
            const { providerMessageId } = await provider.send({
                to: message.toAddress,
                from: providerRow.fromAddress ?? undefined,
                subject: message.subject ?? undefined,
                body,
                credentials,
                ...(attachments.length > 0 ? { attachments } : {}),
            });

            await prisma.delivery.update({
                where: { id: delivery.id },
                data: {
                    status: "SENT",
                    providerMessageId,
                    error: null,
                    attempts: { increment: 1 },
                },
            });
            await prisma.message.update({
                where: { id: message.id },
                data: { status: "SENT" },
            });
        } catch (err) {
            // Adapter errors are already sanitized (HTTP status only). Record
            // the failure, then re-throw so the worker retries with backoff.
            const reason = err instanceof Error ? err.message : "send failed";
            await this.recordFailure(delivery.id, message.id, reason);
            throw err;
        }

        await this.stamp(message);
    };

    /**
     * The email went: a confirmation proves the address (A14). The send is
     * done either way, so a failure here is logged, never retried into a
     * second email.
     */
    private async stamp(message: Message): Promise<void> {
        try {
            await stampConfirmedEmail(prisma, message, new Date());
        } catch (err) {
            this.logger.warn(
                `message.send: message ${message.id} sent; its confirmation stamp failed (${
                    err instanceof Error ? err.message : "unknown"
                })`,
            );
        }
    }

    /**
     * The invoice's PDF for its email (DEC-083), or nothing. Nothing when
     * the provider doesn't take attachments (SMTP and SendGrid relays; see
     * `email.provider.ts`), the invoice can't be drawn (gone, a draft, void)
     * or the drawing fails or comes out too large: the email then goes as
     * it always did, with its link to the invoice, and is never failed for
     * the file. Drawn again on a retry; never stored.
     */
    private async invoicePdf(
        message: Pick<Message, "id" | "organizationId" | "invoiceId">,
        provider: CommsProvider,
        providerName: string,
    ): Promise<CommsAttachment[]> {
        if (!message.invoiceId || !this.invoicePdfs) return [];
        if (!provider.takesAttachments?.(providerName)) return [];
        try {
            const pdf = await this.invoicePdfs.draw(
                message.organizationId,
                message.invoiceId,
            );
            if (!pdf) return [];
            if (pdf.file.length > MAX_ATTACHMENT_BYTES) {
                this.logger.warn(
                    `message.send: message ${message.id}'s invoice PDF is ${pdf.file.length} bytes; sent with its link alone.`,
                );
                return [];
            }
            return [
                {
                    fileName: pdf.fileName,
                    contentType: "application/pdf",
                    content: pdf.file,
                },
            ];
        } catch (err) {
            this.logger.warn(
                `message.send: message ${message.id}'s invoice PDF couldn't be drawn (${
                    err instanceof Error ? err.message : "unknown"
                }); sent with its link alone.`,
            );
            return [];
        }
    }

    /** Mark the Delivery FAILED (+ sanitized error, attempts++) and Message FAILED. */
    private async recordFailure(
        deliveryId: string,
        messageId: string,
        error: string,
    ): Promise<void> {
        await prisma.delivery.update({
            where: { id: deliveryId },
            data: {
                status: "FAILED",
                error,
                attempts: { increment: 1 },
            },
        });
        await prisma.message.update({
            where: { id: messageId },
            data: { status: "FAILED" },
        });
    }

    /** Decrypt the org's sealed credential blob into an in-memory string map. */
    private openCredentials(row: {
        encryptedCredentials: string;
        credentialsIv: string;
        credentialsAuthTag: string;
    }): CommsCredentials {
        const json = decryptSecret({
            ciphertext: row.encryptedCredentials,
            iv: row.credentialsIv,
            authTag: row.credentialsAuthTag,
        });
        return JSON.parse(json) as CommsCredentials;
    }
}
