import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { decryptSecret } from "../payments/crypto";
import type {
    CommsCredentials,
    CommsProviderFactory,
} from "./providers/provider.port";
import {
    COMMS_PROVIDER_FACTORY,
    isCommsChannel,
} from "./providers/provider.port";

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
}

/** Delivery states that are terminal-success — a re-run must NOT re-send. */
const SENT_STATES = new Set(["SENT", "DELIVERED"]);

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
    ) {}

    /** Bound {@link JobHandler} to register with the {@link JobHandlerRegistry}. */
    readonly handle = async (job: Job): Promise<void> => {
        const { messageId, deliveryId } =
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

        const credentials = this.openCredentials(providerRow);
        const provider = this.factory.get(
            message.channel,
            providerRow.provider,
        );

        try {
            const { providerMessageId } = await provider.send({
                to: message.toAddress,
                from: providerRow.fromAddress ?? undefined,
                subject: message.subject ?? undefined,
                body: message.body,
                credentials,
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
    };

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
