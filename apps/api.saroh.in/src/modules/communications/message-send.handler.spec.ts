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

// The confirmation stamp (A14) has its own spec; here only when it runs.
jest.mock("./confirmation-stamp", () => ({
    stampConfirmedEmail: jest.fn().mockResolvedValue(false),
}));

jest.mock("@saroh/database", () => {
    const client = {
        delivery: { findUnique: jest.fn(), update: jest.fn() },
        message: { findUnique: jest.fn(), update: jest.fn() },
        communicationProvider: { findUnique: jest.fn(), updateMany: jest.fn() },
        job: { create: jest.fn() },
        customerNotice: { findFirst: jest.fn() },
    };
    return {
        prisma: {
            ...client,
            $transaction: jest.fn((cb: (tx: typeof client) => unknown) =>
                cb(client),
            ),
        },
    };
});

import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { ProviderKeysRefusedError } from "../../common/providers/provider-attention";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { encryptSecret } from "../payments/crypto";
import { stampConfirmedEmail } from "./confirmation-stamp";
import { MESSAGE_SEND_TYPE, MessageSendHandler } from "./message-send.handler";
import {
    FakeCommsProvider,
    FakeCommsProviderFactory,
} from "./providers/fake.provider";
import { SECRET_LINK_SLOT } from "./transactional";

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

    it("marks the connection as needing attention when the provider refuses its key, and tells the team once (UX-012)", async () => {
        deliveryFindUnique.mockResolvedValue({ id: "del_1", status: "QUEUED" });
        messageFindUnique.mockResolvedValue(message);
        providerFindUnique.mockResolvedValue(sealedProviderRow());
        const updateMany = prisma.communicationProvider.updateMany as jest.Mock;
        const jobCreate = prisma.job.create as jest.Mock;
        updateMany.mockResolvedValue({ count: 1 });

        const fake = new FakeCommsProvider(
            "EMAIL",
            new ProviderKeysRefusedError("Email send failed (HTTP 403)", 403),
        );
        const handler = new MessageSendHandler(
            new FakeCommsProviderFactory(fake),
        );

        // Still a failed send, retried as before.
        await expect(handler.handle(job())).rejects.toThrow(
            "Email send failed (HTTP 403)",
        );
        expect(updateMany).toHaveBeenCalledWith({
            where: { id: "cp_1", organizationId: "org_1", attentionAt: null },
            data: {
                attentionReason: "KEYS_REFUSED",
                attentionAt: expect.any(Date),
            },
        });
        expect(jobCreate).toHaveBeenCalledWith({
            data: {
                organizationId: "org_1",
                type: "team.alert",
                payload: {
                    event: "provider",
                    change: "down",
                    channel: "EMAIL",
                    providerId: "cp_1",
                    since: expect.any(String),
                },
            },
        });
        expect(JSON.stringify(jobCreate.mock.calls)).not.toContain(
            CREDS.apiKey,
        );

        // Refused again while flagged: nothing more is queued.
        jobCreate.mockClear();
        updateMany.mockResolvedValue({ count: 0 });
        await expect(handler.handle(job())).rejects.toThrow();
        expect(jobCreate).not.toHaveBeenCalled();
    });

    it("clears a refused connection's flag when a send is accepted after all, and tells the team it works again (#555)", async () => {
        const flaggedAt = new Date("2026-10-08T09:00:00Z");
        deliveryFindUnique.mockResolvedValue({ id: "del_1", status: "QUEUED" });
        messageFindUnique.mockResolvedValue(message);
        providerFindUnique.mockResolvedValue(
            sealedProviderRow({ attentionAt: flaggedAt }),
        );
        const updateMany = prisma.communicationProvider.updateMany as jest.Mock;
        const jobCreate = prisma.job.create as jest.Mock;
        const lastTold = prisma.customerNotice.findFirst as jest.Mock;
        updateMany.mockResolvedValue({ count: 1 });
        // The team was told it stopped.
        lastTold.mockResolvedValue({
            eventKey: `team:provider:cp_1:down:${flaggedAt.toISOString()}`,
        });

        const handler = new MessageSendHandler(
            new FakeCommsProviderFactory(new FakeCommsProvider("EMAIL")),
        );
        await handler.handle(job());

        // Only the flag it was read with is cleared.
        expect(updateMany).toHaveBeenCalledWith({
            where: {
                id: "cp_1",
                organizationId: "org_1",
                attentionAt: flaggedAt,
            },
            data: { attentionReason: null, attentionAt: null },
        });
        expect(jobCreate).toHaveBeenCalledWith({
            data: {
                organizationId: "org_1",
                type: "team.alert",
                payload: {
                    event: "provider",
                    change: "back",
                    channel: "EMAIL",
                    providerId: "cp_1",
                    since: expect.any(String),
                    actorUserId: null,
                },
            },
        });
    });

    it("says nothing of working again when the team never heard it stopped, or another send cleared it first", async () => {
        const flaggedAt = new Date("2026-10-08T09:00:00Z");
        deliveryFindUnique.mockResolvedValue({ id: "del_1", status: "QUEUED" });
        messageFindUnique.mockResolvedValue(message);
        providerFindUnique.mockResolvedValue(
            sealedProviderRow({ attentionAt: flaggedAt }),
        );
        const updateMany = prisma.communicationProvider.updateMany as jest.Mock;
        const jobCreate = prisma.job.create as jest.Mock;
        const lastTold = prisma.customerNotice.findFirst as jest.Mock;
        const handler = new MessageSendHandler(
            new FakeCommsProviderFactory(new FakeCommsProvider("EMAIL")),
        );

        // Never told: cleared, nothing queued.
        updateMany.mockResolvedValue({ count: 1 });
        lastTold.mockResolvedValue(null);
        await handler.handle(job());
        expect(updateMany).toHaveBeenCalledTimes(1);
        expect(jobCreate).not.toHaveBeenCalled();

        // Cleared by another send already: nothing queued.
        updateMany.mockResolvedValue({ count: 0 });
        lastTold.mockResolvedValue({ eventKey: "team:provider:cp_1:down:x" });
        await handler.handle(job());
        expect(jobCreate).not.toHaveBeenCalled();
    });

    it("leaves a connection that works alone", async () => {
        deliveryFindUnique.mockResolvedValue({ id: "del_1", status: "QUEUED" });
        messageFindUnique.mockResolvedValue(message);
        providerFindUnique.mockResolvedValue(
            sealedProviderRow({ attentionAt: null }),
        );
        const handler = new MessageSendHandler(
            new FakeCommsProviderFactory(new FakeCommsProvider("EMAIL")),
        );
        await handler.handle(job());
        expect(prisma.communicationProvider.updateMany).not.toHaveBeenCalled();
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("flags nothing on a provider failure that isn't about the key", async () => {
        deliveryFindUnique.mockResolvedValue({ id: "del_1", status: "QUEUED" });
        messageFindUnique.mockResolvedValue(message);
        providerFindUnique.mockResolvedValue(sealedProviderRow());

        const handler = new MessageSendHandler(
            new FakeCommsProviderFactory(
                new FakeCommsProvider(
                    "EMAIL",
                    new Error("Email send failed (HTTP 500)"),
                ),
            ),
        );

        await expect(handler.handle(job())).rejects.toThrow();
        expect(prisma.communicationProvider.updateMany).not.toHaveBeenCalled();
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

    it("never sends a delivery withdrawn by a resend (a review invitation's dead link)", async () => {
        deliveryFindUnique.mockResolvedValue({
            id: "del_1",
            status: "CANCELLED",
            provider: "RESEND",
        });

        const fake = new FakeCommsProvider("EMAIL");
        const handler = new MessageSendHandler(
            new FakeCommsProviderFactory(fake),
        );

        await expect(handler.handle(job())).resolves.toBeUndefined();
        expect(fake.calls).toHaveLength(0);
        expect(messageFindUnique).not.toHaveBeenCalled();
        expect(deliveryUpdate).not.toHaveBeenCalled();
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

    it("puts a sealed secret link into the email only as it goes to the provider (D17)", async () => {
        const link = "https://saroh.app/pay/tok_SECRET";
        deliveryFindUnique.mockResolvedValue({ id: "del_1", status: "QUEUED" });
        messageFindUnique.mockResolvedValue({
            ...message,
            body: `<a href="${SECRET_LINK_SLOT}">${SECRET_LINK_SLOT}</a>`,
        });
        providerFindUnique.mockResolvedValue(sealedProviderRow());
        const fake = new FakeCommsProvider("EMAIL");
        const handler = new MessageSendHandler(
            new FakeCommsProviderFactory(fake),
        );

        await handler.handle({
            ...job(),
            payload: {
                messageId: "msg_1",
                deliveryId: "del_1",
                link: encryptSecret(link),
            },
        } as unknown as Job);

        expect(fake.calls[0]?.body).toBe(`<a href="${link}">${link}</a>`);
        // Nothing written back carries it.
        expect(JSON.stringify(messageUpdate.mock.calls)).not.toContain(
            "tok_SECRET",
        );
        expect(JSON.stringify(deliveryUpdate.mock.calls)).not.toContain(
            "tok_SECRET",
        );
    });

    it("never sends a body still waiting for its link: FAILED, no send", async () => {
        deliveryFindUnique.mockResolvedValue({ id: "del_1", status: "QUEUED" });
        messageFindUnique.mockResolvedValue({
            ...message,
            body: `Pay here: ${SECRET_LINK_SLOT}`,
        });
        providerFindUnique.mockResolvedValue(sealedProviderRow());
        const fake = new FakeCommsProvider("EMAIL");
        const handler = new MessageSendHandler(
            new FakeCommsProviderFactory(fake),
        );

        await handler.handle(job());

        expect(fake.calls).toHaveLength(0);
        expect(deliveryUpdate.mock.calls[0][0].data).toMatchObject({
            status: "FAILED",
            error: "secret link missing",
        });
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

describe("MessageSendHandler — a confirmation proves its address (A14)", () => {
    const stamp = stampConfirmedEmail as jest.Mock;
    const confirmation = {
        ...message,
        contactId: "ct_1",
        template: "BOOKING_CONFIRMED",
    };

    beforeEach(() => {
        jest.clearAllMocks();
        deliveryFindUnique.mockResolvedValue({ id: "del_1", status: "QUEUED" });
        messageFindUnique.mockResolvedValue(confirmation);
        providerFindUnique.mockResolvedValue(sealedProviderRow());
    });

    it("stamps once the provider accepted it", async () => {
        const handler = new MessageSendHandler(
            new FakeCommsProviderFactory(new FakeCommsProvider("EMAIL")),
        );
        await handler.handle(job());
        expect(stamp).toHaveBeenCalledTimes(1);
        expect(stamp.mock.calls[0][1]).toBe(confirmation);
    });

    it("a failed send stamps nothing, and is retried", async () => {
        const handler = new MessageSendHandler(
            new FakeCommsProviderFactory(
                new FakeCommsProvider(
                    "EMAIL",
                    new Error("Email send failed (HTTP 500)"),
                ),
            ),
        );
        await expect(handler.handle(job())).rejects.toThrow();
        expect(stamp).not.toHaveBeenCalled();
    });

    it("a stamp that fails leaves the send done: never a second email", async () => {
        stamp.mockRejectedValueOnce(new Error("db down"));
        const fake = new FakeCommsProvider("EMAIL");
        const handler = new MessageSendHandler(
            new FakeCommsProviderFactory(fake),
        );
        await expect(handler.handle(job())).resolves.toBeUndefined();
        expect(fake.calls).toHaveLength(1);
        expect(messageUpdate).toHaveBeenCalledWith({
            where: { id: "msg_1" },
            data: { status: "SENT" },
        });
    });
});
