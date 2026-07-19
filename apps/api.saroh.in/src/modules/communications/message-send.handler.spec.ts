// DB-free + network-free unit tests. @saroh/database is mocked so nothing
// touches Postgres; env is mocked with a real 32-byte key so the REAL
// AES-256-GCM crypto round-trips the sealed provider credentials the handler
// decrypts. The provider is a FakeCommsProvider — no network.
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    },
}));

jest.mock("@saroh/database", () => ({
    prisma: {
        delivery: { findUnique: jest.fn(), update: jest.fn() },
        message: { findUnique: jest.fn(), update: jest.fn() },
        communicationProvider: { findUnique: jest.fn() },
    },
}));

import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { encryptSecret } from "../payments/crypto";
import { MESSAGE_SEND_TYPE, MessageSendHandler } from "./message-send.handler";
import {
    FakeCommsProvider,
    FakeCommsProviderFactory,
} from "./providers/fake.provider";

const deliveryFindUnique = prisma.delivery.findUnique as jest.Mock;
const deliveryUpdate = prisma.delivery.update as jest.Mock;
const messageFindUnique = prisma.message.findUnique as jest.Mock;
const messageUpdate = prisma.message.update as jest.Mock;
const providerFindUnique = prisma.communicationProvider.findUnique as jest.Mock;

const CREDS = { apiKey: "sk_live_SECRET_xyz" };

/** A provider row whose sealed blob decrypts back to {@link CREDS}. */
function sealedProviderRow(over: Record<string, unknown> = {}) {
    const sealed = encryptSecret(JSON.stringify(CREDS));
    return {
        id: "cp_1",
        organizationId: "org_1",
        channel: "EMAIL",
        provider: "RESEND",
        status: "CONNECTED",
        fromAddress: "hi@acme.com",
        encryptedCredentials: sealed.ciphertext,
        credentialsIv: sealed.iv,
        credentialsAuthTag: sealed.authTag,
        ...over,
    };
}

function job(): Job {
    return {
        id: "job_1",
        type: MESSAGE_SEND_TYPE,
        payload: { messageId: "msg_1", deliveryId: "del_1" },
    } as unknown as Job;
}

const message = {
    id: "msg_1",
    organizationId: "org_1",
    channel: "EMAIL",
    toAddress: "a@b.com",
    subject: "Hi",
    body: "hello there",
};

describe("MessageSendHandler", () => {
    beforeEach(() => jest.clearAllMocks());

    it("sends via the connected provider and moves Delivery QUEUED→SENT (+ providerMessageId) and Message→SENT", async () => {
        deliveryFindUnique.mockResolvedValue({ id: "del_1", status: "QUEUED" });
        messageFindUnique.mockResolvedValue(message);
        providerFindUnique.mockResolvedValue(sealedProviderRow());

        const fake = new FakeCommsProvider("EMAIL");
        const handler = new MessageSendHandler(
            new FakeCommsProviderFactory(fake),
        );

        await handler.handle(job());

        // The adapter received the resolved recipient, the org's fromAddress,
        // and the DECRYPTED credentials — only at the instant of the call.
        expect(fake.calls).toHaveLength(1);
        expect(fake.calls[0]).toMatchObject({
            to: "a@b.com",
            from: "hi@acme.com",
            subject: "Hi",
            body: "hello there",
            credentials: CREDS,
        });

        // Delivery QUEUED → SENT with the provider id, attempts incremented.
        expect(deliveryUpdate).toHaveBeenCalledWith({
            where: { id: "del_1" },
            data: {
                status: "SENT",
                providerMessageId: "fake_email_1",
                error: null,
                attempts: { increment: 1 },
            },
        });
        // Message → SENT.
        expect(messageUpdate).toHaveBeenCalledWith({
            where: { id: "msg_1" },
            data: { status: "SENT" },
        });
    });

    it("records a provider failure as Delivery FAILED (+ sanitized error) and Message FAILED, then re-throws for retry", async () => {
        deliveryFindUnique.mockResolvedValue({ id: "del_1", status: "QUEUED" });
        messageFindUnique.mockResolvedValue(message);
        providerFindUnique.mockResolvedValue(sealedProviderRow());

        const fake = new FakeCommsProvider(
            "EMAIL",
            new Error("Email send failed (HTTP 500)"),
        );
        const handler = new MessageSendHandler(
            new FakeCommsProviderFactory(fake),
        );

        await expect(handler.handle(job())).rejects.toThrow(
            "Email send failed (HTTP 500)",
        );

        expect(deliveryUpdate).toHaveBeenCalledWith({
            where: { id: "del_1" },
            data: {
                status: "FAILED",
                error: "Email send failed (HTTP 500)",
                attempts: { increment: 1 },
            },
        });
        expect(messageUpdate).toHaveBeenCalledWith({
            where: { id: "msg_1" },
            data: { status: "FAILED" },
        });
        // The sanitized error carries no secret material.
        expect(deliveryUpdate.mock.calls[0][0].data.error).not.toContain(
            CREDS.apiKey,
        );
    });

    it("is idempotent: a re-run on an already-SENT delivery is a no-op (never double-sends)", async () => {
        deliveryFindUnique.mockResolvedValue({ id: "del_1", status: "SENT" });

        const fake = new FakeCommsProvider("EMAIL");
        const handler = new MessageSendHandler(
            new FakeCommsProviderFactory(fake),
        );

        await expect(handler.handle(job())).resolves.toBeUndefined();

        expect(fake.calls).toHaveLength(0);
        expect(messageFindUnique).not.toHaveBeenCalled();
        expect(deliveryUpdate).not.toHaveBeenCalled();
        expect(messageUpdate).not.toHaveBeenCalled();
    });

    it("records FAILED (no send) when no provider is connected for the channel", async () => {
        deliveryFindUnique.mockResolvedValue({ id: "del_1", status: "QUEUED" });
        messageFindUnique.mockResolvedValue(message);
        providerFindUnique.mockResolvedValue(null);

        const fake = new FakeCommsProvider("EMAIL");
        const handler = new MessageSendHandler(
            new FakeCommsProviderFactory(fake),
        );

        await handler.handle(job());

        expect(fake.calls).toHaveLength(0);
        expect(deliveryUpdate.mock.calls[0][0].data).toMatchObject({
            status: "FAILED",
        });
        expect(messageUpdate).toHaveBeenCalledWith({
            where: { id: "msg_1" },
            data: { status: "FAILED" },
        });
    });

    it("completes as a no-op when the delivery no longer exists", async () => {
        deliveryFindUnique.mockResolvedValue(null);

        const fake = new FakeCommsProvider("EMAIL");
        const handler = new MessageSendHandler(
            new FakeCommsProviderFactory(fake),
        );

        await expect(handler.handle(job())).resolves.toBeUndefined();
        expect(fake.calls).toHaveLength(0);
        expect(deliveryUpdate).not.toHaveBeenCalled();
    });

    it("registers under the message.send job type", () => {
        const registry = new JobHandlerRegistry();
        const handler = new MessageSendHandler(
            new FakeCommsProviderFactory(new FakeCommsProvider()),
        );

        registry.register(MESSAGE_SEND_TYPE, handler.handle);

        expect(registry.has("message.send")).toBe(true);
        expect(registry.get("message.send")).toBe(handler.handle);
    });
});
