// DB-free, network-free unit tests. @saroh/database is mocked so nothing touches
// Postgres; the `$transaction` mock invokes its callback with the SAME mocked
// client so the Message + Delivery + Job writes are asserted in one transaction.
// env is mocked with a real 32-byte key so the REAL AES-256-GCM crypto runs
// (round-trips), but no real app env is validated.
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    },
}));

jest.mock("@saroh/database", () => {
    const client = {
        communicationProvider: {
            upsert: jest.fn(),
            findMany: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
        },
        consent: {
            upsert: jest.fn(),
            findMany: jest.fn(),
            findUnique: jest.fn(),
        },
        message: {
            create: jest.fn(),
            findMany: jest.fn(),
            findUnique: jest.fn(),
        },
        delivery: { create: jest.fn() },
        job: { create: jest.fn() },
        contact: { findUnique: jest.fn() },
        lead: { findUnique: jest.fn() },
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

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { decryptSecret } from "../payments/crypto";
import { CommunicationsService } from "./communications.service";

const providerUpsert = prisma.communicationProvider.upsert as jest.Mock;
const providerFindMany = prisma.communicationProvider.findMany as jest.Mock;
const providerFindUnique = prisma.communicationProvider.findUnique as jest.Mock;
const providerUpdate = prisma.communicationProvider.update as jest.Mock;
const consentUpsert = prisma.consent.upsert as jest.Mock;
const consentFindUnique = prisma.consent.findUnique as jest.Mock;
const messageCreate = prisma.message.create as jest.Mock;
const messageFindUnique = prisma.message.findUnique as jest.Mock;
const messageFindMany = prisma.message.findMany as jest.Mock;
const deliveryCreate = prisma.delivery.create as jest.Mock;
const jobCreate = prisma.job.create as jest.Mock;
const contactFindUnique = prisma.contact.findUnique as jest.Mock;
const $transaction = prisma.$transaction as jest.Mock;

function ctx(over: Partial<OrganizationContext> = {}): OrganizationContext {
    return {
        organizationId: "org_1",
        userId: "user_1",
        role: "ADMIN",
        ...over,
    };
}

const SECRET = "sk_live_SUPER_SECRET_abc123";

describe("CommunicationsService.connectProvider", () => {
    beforeEach(() => jest.clearAllMocks());

    it("seals credentials at rest (only ciphertext persisted, no plaintext) and returns a redacted view", async () => {
        const service = new CommunicationsService();
        providerUpsert.mockImplementation(
            ({ create }: { create: Record<string, unknown> }) =>
                Promise.resolve({
                    id: "cp_1",
                    ...create,
                    createdAt: new Date(0),
                    updatedAt: new Date(0),
                }),
        );

        const result = await service.connectProvider(ctx(), {
            channel: "email",
            provider: "resend",
            fromAddress: "hi@acme.com",
            credentials: { apiKey: SECRET },
        });

        expect(providerUpsert).toHaveBeenCalledTimes(1);
        const call = providerUpsert.mock.calls[0][0];
        const data = call.create;

        // Normalized, scoped, CONNECTED.
        expect(data).toMatchObject({
            organizationId: "org_1",
            channel: "EMAIL",
            provider: "RESEND",
            status: "CONNECTED",
            fromAddress: "hi@acme.com",
        });

        // Only the sealed blob is stored — never a plaintext credentials field.
        expect(data.encryptedCredentials).toBeDefined();
        expect(data.credentialsIv).toBeDefined();
        expect(data.credentialsAuthTag).toBeDefined();
        expect((data as Record<string, unknown>).credentials).toBeUndefined();

        // The secret appears NOWHERE in the persisted payload.
        expect(JSON.stringify(call)).not.toContain(SECRET);

        // ...but the sealed blob round-trips back to the real credentials.
        expect(
            JSON.parse(
                decryptSecret({
                    ciphertext: data.encryptedCredentials,
                    iv: data.credentialsIv,
                    authTag: data.credentialsAuthTag,
                }),
            ),
        ).toEqual({ apiKey: SECRET });

        // The response is redacted — no secret / encrypted material ever echoed.
        expect(result).toEqual({
            id: "cp_1",
            channel: "EMAIL",
            provider: "RESEND",
            status: "CONNECTED",
            fromAddress: "hi@acme.com",
            createdAt: new Date(0),
            updatedAt: new Date(0),
        });
        expect(JSON.stringify(result)).not.toContain(SECRET);
    });

    it("rejects an unsupported (channel, provider) pair with 400 and never writes", async () => {
        const service = new CommunicationsService();
        await expect(
            service.connectProvider(ctx(), {
                channel: "EMAIL",
                provider: "TWILIO", // WhatsApp-only provider
                credentials: { apiKey: SECRET },
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(providerUpsert).not.toHaveBeenCalled();
    });

    it("rejects an empty credentials map with 400", async () => {
        const service = new CommunicationsService();
        await expect(
            service.connectProvider(ctx(), {
                channel: "EMAIL",
                provider: "RESEND",
                credentials: {},
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(providerUpsert).not.toHaveBeenCalled();
    });

    it("denies a MEMBER (comms:manage is OWNER/ADMIN-only) before any I/O", async () => {
        const service = new CommunicationsService();
        await expect(
            service.connectProvider(ctx({ role: "MEMBER" }), {
                channel: "EMAIL",
                provider: "RESEND",
                credentials: { apiKey: SECRET },
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(providerUpsert).not.toHaveBeenCalled();
    });
});

describe("CommunicationsService.listProviders / disconnect", () => {
    beforeEach(() => jest.clearAllMocks());

    it("returns redacted rows and never leaks encrypted material", async () => {
        const service = new CommunicationsService();
        providerFindMany.mockResolvedValue([
            {
                id: "cp_1",
                organizationId: "org_1",
                channel: "EMAIL",
                provider: "RESEND",
                status: "CONNECTED",
                fromAddress: "hi@acme.com",
                encryptedCredentials: "CIPHER",
                credentialsIv: "IV",
                credentialsAuthTag: "TAG",
                createdAt: new Date(0),
                updatedAt: new Date(0),
            },
        ]);

        const rows = await service.listProviders(ctx());

        expect(providerFindMany).toHaveBeenCalledWith({
            where: { organizationId: "org_1" },
            orderBy: { createdAt: "desc" },
        });
        expect(rows[0]).not.toHaveProperty("encryptedCredentials");
        expect(JSON.stringify(rows)).not.toContain("CIPHER");
    });

    it("disconnect sets DISABLED for an owned channel; missing → 404", async () => {
        const service = new CommunicationsService();
        providerFindUnique.mockResolvedValueOnce({
            id: "cp_1",
            organizationId: "org_1",
            channel: "EMAIL",
        });
        providerUpdate.mockResolvedValue({
            id: "cp_1",
            channel: "EMAIL",
            provider: "RESEND",
            status: "DISABLED",
            fromAddress: null,
            createdAt: new Date(0),
            updatedAt: new Date(0),
        });

        const res = await service.disconnectProvider(ctx(), "email");
        expect(providerUpdate).toHaveBeenCalledWith({
            where: { id: "cp_1" },
            data: { status: "DISABLED" },
        });
        expect(res.status).toBe("DISABLED");

        providerFindUnique.mockResolvedValueOnce(null);
        await expect(
            service.disconnectProvider(ctx(), "WHATSAPP"),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});

describe("CommunicationsService.setConsent", () => {
    beforeEach(() => jest.clearAllMocks());

    it("upserts consent for an owned contact on (contactId, channel)", async () => {
        const service = new CommunicationsService();
        contactFindUnique.mockResolvedValue({
            id: "contact_1",
            organizationId: "org_1",
            email: "a@b.com",
        });
        consentUpsert.mockResolvedValue({ id: "con_1", status: "REVOKED" });

        await service.setConsent(ctx(), {
            contactId: "contact_1",
            channel: "email",
            status: "revoked",
            source: "unsubscribe-link",
        });

        expect(consentUpsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    contactId_channel: {
                        contactId: "contact_1",
                        channel: "EMAIL",
                    },
                },
                create: expect.objectContaining({
                    organizationId: "org_1",
                    contactId: "contact_1",
                    channel: "EMAIL",
                    status: "REVOKED",
                    source: "unsubscribe-link",
                }),
                update: { status: "REVOKED", source: "unsubscribe-link" },
            }),
        );
    });

    it("rejects a cross-tenant contact with 404 and never writes", async () => {
        const service = new CommunicationsService();
        contactFindUnique.mockResolvedValue({
            id: "contact_1",
            organizationId: "org_OTHER",
        });
        await expect(
            service.setConsent(ctx(), {
                contactId: "contact_1",
                channel: "EMAIL",
                status: "GRANTED",
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(consentUpsert).not.toHaveBeenCalled();
    });

    it("denies a MEMBER before any I/O", async () => {
        const service = new CommunicationsService();
        await expect(
            service.setConsent(ctx({ role: "MEMBER" }), {
                contactId: "contact_1",
                channel: "EMAIL",
                status: "GRANTED",
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(contactFindUnique).not.toHaveBeenCalled();
    });
});

describe("CommunicationsService.sendMessage — consent gate", () => {
    beforeEach(() => jest.clearAllMocks());

    function ownedEmailContact() {
        contactFindUnique.mockResolvedValue({
            id: "contact_1",
            organizationId: "org_1",
            email: "a@b.com",
            phone: null,
        });
    }

    it("a REVOKED consent SUPPRESSES the message: no delivery, no job, no transaction", async () => {
        const service = new CommunicationsService();
        ownedEmailContact();
        consentFindUnique.mockResolvedValue({
            id: "con_1",
            status: "REVOKED",
        });
        messageCreate.mockResolvedValue({
            id: "msg_1",
            status: "SUPPRESSED",
            channel: "EMAIL",
        });

        const res = await service.sendMessage(ctx(), {
            channel: "EMAIL",
            contactId: "contact_1",
            body: "hello",
        });

        // The Message is recorded SUPPRESSED — auditable that it was blocked.
        expect(messageCreate).toHaveBeenCalledTimes(1);
        expect(messageCreate.mock.calls[0][0].data).toMatchObject({
            status: "SUPPRESSED",
            channel: "EMAIL",
            contactId: "contact_1",
            toAddress: "a@b.com",
        });
        // Nothing is sent or enqueued.
        expect(deliveryCreate).not.toHaveBeenCalled();
        expect(jobCreate).not.toHaveBeenCalled();
        expect($transaction).not.toHaveBeenCalled();
        expect(providerFindUnique).not.toHaveBeenCalled();
        expect(res).toEqual({
            id: "msg_1",
            status: "SUPPRESSED",
            channel: "EMAIL",
        });
    });

    it("an absent consent is allowed: QUEUED Message + Delivery + message.send Job atomically", async () => {
        const service = new CommunicationsService();
        ownedEmailContact();
        consentFindUnique.mockResolvedValue(null); // no consent row = allowed
        providerFindUnique.mockResolvedValue({
            id: "cp_1",
            organizationId: "org_1",
            channel: "EMAIL",
            provider: "RESEND",
            status: "CONNECTED",
        });
        messageCreate.mockResolvedValue({
            id: "msg_1",
            status: "QUEUED",
            channel: "EMAIL",
        });
        deliveryCreate.mockResolvedValue({ id: "del_1" });
        jobCreate.mockResolvedValue({ id: "job_1" });

        const res = await service.sendMessage(ctx(), {
            channel: "EMAIL",
            contactId: "contact_1",
            subject: "Hi",
            body: "hello",
        });

        // One atomic transaction created all three rows.
        expect($transaction).toHaveBeenCalledTimes(1);
        expect(messageCreate.mock.calls[0][0].data).toMatchObject({
            status: "QUEUED",
            channel: "EMAIL",
            toAddress: "a@b.com",
            createdByUserId: "user_1",
        });
        expect(deliveryCreate.mock.calls[0][0].data).toMatchObject({
            organizationId: "org_1",
            messageId: "msg_1",
            provider: "RESEND",
            status: "QUEUED",
        });
        expect(jobCreate.mock.calls[0][0].data).toMatchObject({
            organizationId: "org_1",
            type: "message.send",
            payload: { messageId: "msg_1", deliveryId: "del_1" },
        });
        expect(res).toEqual({
            id: "msg_1",
            status: "QUEUED",
            channel: "EMAIL",
        });
    });

    it("a GRANTED consent is allowed and enqueues the send", async () => {
        const service = new CommunicationsService();
        ownedEmailContact();
        consentFindUnique.mockResolvedValue({ status: "GRANTED" });
        providerFindUnique.mockResolvedValue({
            id: "cp_1",
            channel: "EMAIL",
            provider: "RESEND",
            status: "CONNECTED",
        });
        messageCreate.mockResolvedValue({
            id: "msg_1",
            status: "QUEUED",
            channel: "EMAIL",
        });
        deliveryCreate.mockResolvedValue({ id: "del_1" });
        jobCreate.mockResolvedValue({ id: "job_1" });

        const res = await service.sendMessage(ctx(), {
            channel: "EMAIL",
            contactId: "contact_1",
            body: "hello",
        });

        expect(jobCreate).toHaveBeenCalledTimes(1);
        expect(res.status).toBe("QUEUED");
    });
});

describe("CommunicationsService.sendMessage — provider + recipient guards", () => {
    beforeEach(() => jest.clearAllMocks());

    it("400 when no provider is connected for the channel", async () => {
        const service = new CommunicationsService();
        consentFindUnique.mockResolvedValue(null);
        providerFindUnique.mockResolvedValue(null);

        await expect(
            service.sendMessage(ctx(), {
                channel: "EMAIL",
                toAddress: "a@b.com",
                body: "hi",
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect($transaction).not.toHaveBeenCalled();
    });

    it("409 when the connected provider is DISABLED", async () => {
        const service = new CommunicationsService();
        providerFindUnique.mockResolvedValue({
            id: "cp_1",
            channel: "EMAIL",
            provider: "RESEND",
            status: "DISABLED",
        });

        await expect(
            service.sendMessage(ctx(), {
                channel: "EMAIL",
                toAddress: "a@b.com",
                body: "hi",
            }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect($transaction).not.toHaveBeenCalled();
    });

    it("rejects a cross-tenant contact with 404 and never sends", async () => {
        const service = new CommunicationsService();
        contactFindUnique.mockResolvedValue({
            id: "contact_1",
            organizationId: "org_OTHER",
        });

        await expect(
            service.sendMessage(ctx(), {
                channel: "EMAIL",
                contactId: "contact_1",
                body: "hi",
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(providerFindUnique).not.toHaveBeenCalled();
        expect($transaction).not.toHaveBeenCalled();
    });

    it("400 when neither contactId nor toAddress is given", async () => {
        const service = new CommunicationsService();
        await expect(
            service.sendMessage(ctx(), { channel: "EMAIL", body: "hi" }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("denies a MEMBER before any I/O", async () => {
        const service = new CommunicationsService();
        await expect(
            service.sendMessage(ctx({ role: "MEMBER" }), {
                channel: "EMAIL",
                toAddress: "a@b.com",
                body: "hi",
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(contactFindUnique).not.toHaveBeenCalled();
    });
});

describe("CommunicationsService reads (auditable lifecycle)", () => {
    beforeEach(() => jest.clearAllMocks());

    it("listMessages scopes to the org and includes deliveries, newest first", async () => {
        const service = new CommunicationsService();
        messageFindMany.mockResolvedValue([]);

        await service.listMessages(ctx(), { leadId: "lead_1" });

        expect(messageFindMany).toHaveBeenCalledWith({
            where: { organizationId: "org_1", leadId: "lead_1" },
            include: { deliveries: { orderBy: { createdAt: "asc" } } },
            orderBy: { createdAt: "desc" },
        });
    });

    it("getMessage returns an owned message with its deliveries", async () => {
        const service = new CommunicationsService();
        messageFindUnique.mockResolvedValue({
            id: "msg_1",
            organizationId: "org_1",
            deliveries: [{ id: "del_1", status: "SENT" }],
        });

        const res = await service.getMessage(ctx(), "msg_1");
        expect(res.deliveries[0].status).toBe("SENT");
    });

    it("getMessage on a cross-tenant message → 404", async () => {
        const service = new CommunicationsService();
        messageFindUnique.mockResolvedValue({
            id: "msg_1",
            organizationId: "org_OTHER",
            deliveries: [],
        });
        await expect(service.getMessage(ctx(), "msg_1")).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it("denies a MEMBER on reads", async () => {
        const service = new CommunicationsService();
        await expect(
            service.listMessages(ctx({ role: "MEMBER" })),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(messageFindMany).not.toHaveBeenCalled();
    });
});
