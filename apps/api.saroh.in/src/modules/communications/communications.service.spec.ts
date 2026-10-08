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
        invoice: { findFirst: jest.fn() },
        customerAccount: { findFirst: jest.fn() },
        order: { findFirst: jest.fn() },
        customerIdentityLink: { findFirst: jest.fn() },
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

import type { CredentialCheck } from "../../common/providers/provider-attention";
import type { OrganizationContext } from "../../common/types/organization-context";
import { decryptSecret } from "../payments/crypto";
import { CommunicationsService } from "./communications.service";
import { renderReviewInvitation } from "./transactional";

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
            attention: null,
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

describe("CommunicationsService.connectProvider — the key checked first (UX-012)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        providerUpsert.mockImplementation(
            ({ create }: { create: Record<string, unknown> }) =>
                Promise.resolve({
                    id: "cp_1",
                    ...create,
                    createdAt: new Date(0),
                    updatedAt: new Date(0),
                }),
        );
    });

    /** A factory whose adapter answers the key check with `check`. */
    function serviceAnswering(check: CredentialCheck | null) {
        const verifyCredentials = jest.fn().mockResolvedValue(check);
        const adapter = {
            channel: "EMAIL" as const,
            supports: () => true,
            verifyCredentials,
            send: jest.fn(),
        };
        return {
            service: new CommunicationsService({ get: () => adapter }),
            verifyCredentials,
        };
    }

    const RESEND = {
        channel: "email",
        provider: "resend",
        fromAddress: "hello@bakery.in",
        credentials: { apiKey: SECRET },
    };

    it("refuses a key Resend rejects: 400 under the key, nothing stored", async () => {
        const { service, verifyCredentials } = serviceAnswering("REJECTED");

        const err = await service
            .connectProvider(ctx(), RESEND)
            .catch((e: unknown) => e);

        expect(err).toBeInstanceOf(BadRequestException);
        expect((err as BadRequestException).getResponse()).toEqual({
            message: expect.stringContaining(
                "Resend didn't accept this API key",
            ),
            field: "apiKey",
        });
        expect(
            JSON.stringify((err as BadRequestException).getResponse()),
        ).not.toContain(SECRET);
        expect(providerUpsert).not.toHaveBeenCalled();
        expect(verifyCredentials).toHaveBeenCalledWith({
            provider: "RESEND",
            credentials: { apiKey: SECRET },
            fromAddress: "hello@bakery.in",
        });
    });

    it("refuses a sending address whose domain Resend hasn't verified, under that field", async () => {
        const { service } = serviceAnswering("DOMAIN_UNVERIFIED");

        const err = await service
            .connectProvider(ctx(), RESEND)
            .catch((e: unknown) => e);

        expect((err as BadRequestException).getResponse()).toEqual({
            message: expect.stringContaining("hasn't verified bakery.in"),
            field: "fromAddress",
        });
        expect(providerUpsert).not.toHaveBeenCalled();
    });

    it("keeps a key the provider accepts, clearing an earlier Needs attention", async () => {
        const { service } = serviceAnswering("ACCEPTED");

        const result = await service.connectProvider(ctx(), RESEND);

        expect(providerUpsert.mock.calls[0][0].update).toEqual(
            expect.objectContaining({
                attentionReason: null,
                attentionAt: null,
            }),
        );
        expect(result.attention).toBeNull();
    });

    it("lets through a provider the adapter can't check (an SMTP relay)", async () => {
        const { service } = serviceAnswering(null);

        await service.connectProvider(ctx(), {
            ...RESEND,
            provider: "smtp",
            credentials: { host: "smtp.example.in", pass: "x" },
        });

        expect(providerUpsert).toHaveBeenCalledTimes(1);
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

// ---- D17: the transactional path ------------------------------------------

describe("CommunicationsService.queueTransactional (D17)", () => {
    const invoiceFindFirst = prisma.invoice.findFirst as jest.Mock;
    const accountFindFirst = prisma.customerAccount.findFirst as jest.Mock;
    const tx = prisma as unknown as Parameters<
        CommunicationsService["queueTransactional"]
    >[0];
    const vars = {
        business: "Rye & Co.",
        firstName: "Asha",
        number: "INV-0042",
        total: "₹2,400.00",
        dueOn: "3 Oct 2026",
        overdue: false,
    };
    const input = (
        secretLink = jest.fn().mockResolvedValue("https://saroh.app/pay/tok_1"),
    ) => ({
        template: "INVOICE_SENT" as const,
        vars,
        recipient: { kind: "INVOICE_BILL_TO" as const, invoiceId: "inv_1" },
        secretLink,
        invoiceId: "inv_1",
        createdByUserId: "user_1",
    });

    beforeEach(() => {
        jest.clearAllMocks();
        invoiceFindFirst.mockResolvedValue({
            status: "ISSUED",
            billToEmail: "asha@example.com",
            contactId: "contact_1",
            contact: { email: "asha@example.com" },
        });
        accountFindFirst.mockResolvedValue(null);
        providerFindUnique.mockResolvedValue({
            provider: "RESEND",
            status: "CONNECTED",
        });
        consentFindUnique.mockResolvedValue(null);
        messageCreate.mockImplementation(
            ({ data }: { data: { status: string } }) =>
                Promise.resolve({ id: "msg_1", ...data }),
        );
        deliveryCreate.mockResolvedValue({ id: "del_1" });
        jobCreate.mockResolvedValue({ id: "job_1" });
    });

    it("queues Message + Delivery + job on the caller's transaction, the link sealed in the job", async () => {
        const res = await new CommunicationsService().queueTransactional(
            tx,
            "org_1",
            input(),
        );
        expect(res).toEqual({
            id: "msg_1",
            status: "QUEUED",
            toAddress: "asha@example.com",
            route: "PROVIDER",
        });
        expect(messageCreate.mock.calls[0][0].data).toMatchObject({
            organizationId: "org_1",
            channel: "EMAIL",
            contactId: "contact_1",
            toAddress: "asha@example.com",
            invoiceId: "inv_1",
            template: "INVOICE_SENT",
            createdByUserId: "user_1",
            status: "QUEUED",
        });
        const payload = jobCreate.mock.calls[0][0].data.payload;
        expect(payload).toMatchObject({
            messageId: "msg_1",
            deliveryId: "del_1",
        });
        expect(JSON.stringify(payload)).not.toContain("tok_1");
        expect(decryptSecret(payload.link)).toBe("https://saroh.app/pay/tok_1");
        expect(JSON.stringify(messageCreate.mock.calls)).not.toContain("tok_1");
        // It never opens a transaction of its own.
        expect($transaction).not.toHaveBeenCalled();
    });

    it("asks the send job to attach the invoice's PDF, and stores no file (DEC-083)", async () => {
        await new CommunicationsService().queueTransactional(tx, "org_1", {
            ...input(),
            attachInvoicePdf: true,
        });
        const payload = jobCreate.mock.calls[0][0].data.payload;
        expect(payload).toMatchObject({ attach: "INVOICE_PDF" });
        expect(JSON.stringify(messageCreate.mock.calls)).not.toContain(
            "INVOICE_PDF",
        );
    });

    it("attaches nothing unless asked", async () => {
        await new CommunicationsService().queueTransactional(
            tx,
            "org_1",
            input(),
        );
        expect(jobCreate.mock.calls[0][0].data.payload).not.toHaveProperty(
            "attach",
        );
    });

    it("a revoked email consent suppresses it and never makes the link", async () => {
        consentFindUnique.mockResolvedValue({ status: "REVOKED" });
        const link = jest.fn();
        const res = await new CommunicationsService().queueTransactional(
            tx,
            "org_1",
            input(link),
        );
        expect(res.status).toBe("SUPPRESSED");
        expect(link).not.toHaveBeenCalled();
        expect(deliveryCreate).not.toHaveBeenCalled();
        expect(jobCreate).not.toHaveBeenCalled();
    });

    it("needs no marketing opt-in: a GRANTED or absent consent both send", async () => {
        consentFindUnique.mockResolvedValue({ status: "GRANTED" });
        const res = await new CommunicationsService().queueTransactional(
            tx,
            "org_1",
            input(),
        );
        expect(res.status).toBe("QUEUED");
    });

    it("refuses with 409 when the business has no connected email provider", async () => {
        providerFindUnique.mockResolvedValue({
            provider: "RESEND",
            status: "DISABLED",
        });
        const link = jest.fn();
        await expect(
            new CommunicationsService().queueTransactional(
                tx,
                "org_1",
                input(link),
            ),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(link).not.toHaveBeenCalled();
        expect(messageCreate).not.toHaveBeenCalled();
    });

    it("a placeholder bill-to goes to the verified account email instead", async () => {
        invoiceFindFirst.mockResolvedValue({
            status: "ISSUED",
            billToEmail: "account+contact_1@account.invalid",
            contactId: "contact_1",
            contact: null,
        });
        accountFindFirst.mockResolvedValue({ email: "meera@example.com" });
        const res = await new CommunicationsService().queueTransactional(
            tx,
            "org_1",
            input(),
        );
        expect(res.toAddress).toBe("meera@example.com");
        expect(accountFindFirst.mock.calls[0][0].where).toEqual({
            organizationId: "org_1",
            contactId: "contact_1",
            status: "ACTIVE",
        });
    });

    it("with neither a bill-to email nor an account: 409, nothing written", async () => {
        invoiceFindFirst.mockResolvedValue({
            status: "ISSUED",
            billToEmail: "removed+contact_1@removed.invalid",
            contactId: "contact_1",
            contact: null,
        });
        await expect(
            new CommunicationsService().queueTransactional(
                tx,
                "org_1",
                input(),
            ),
        ).rejects.toThrow("There's no email address to send this to.");
        expect(messageCreate).not.toHaveBeenCalled();
    });

    it("reads the invoice only within the business", async () => {
        invoiceFindFirst.mockResolvedValue(null);
        await expect(
            new CommunicationsService().queueTransactional(
                tx,
                "org_1",
                input(),
            ),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(invoiceFindFirst.mock.calls[0][0].where).toEqual({
            id: "inv_1",
            organizationId: "org_1",
        });
    });
});

// A review invitation (D11): to the order's storefront customer, through the
// business's own provider only, its review link a secret link.
describe("CommunicationsService.queueTransactional — review invitation", () => {
    const orderFindFirst = prisma.order.findFirst as jest.Mock;
    const linkFindFirst = prisma.customerIdentityLink.findFirst as jest.Mock;
    const tx = prisma as unknown as Parameters<
        CommunicationsService["queueTransactional"]
    >[0];
    const input = () => ({
        template: "REVIEW_INVITATION" as const,
        rendered: renderReviewInvitation({ store: "High Street", days: 30 }),
        recipient: { kind: "ORDER_CUSTOMER" as const, orderId: "o_1" },
        secretLink: () =>
            Promise.resolve("https://renderer.test/review/tok_review"),
        createdByUserId: "user_1",
    });

    beforeEach(() => {
        jest.clearAllMocks();
        orderFindFirst.mockResolvedValue({
            customerId: "cu_1",
            customer: { email: " ananya@example.com " },
        });
        linkFindFirst.mockResolvedValue({ contactId: "contact_1" });
        providerFindUnique.mockResolvedValue({
            provider: "RESEND",
            status: "CONNECTED",
        });
        consentFindUnique.mockResolvedValue(null);
        messageCreate.mockImplementation(
            ({ data }: { data: { status: string } }) =>
                Promise.resolve({ id: "msg_1", ...data }),
        );
        deliveryCreate.mockResolvedValue({ id: "del_1" });
        jobCreate.mockResolvedValue({ id: "job_1" });
    });

    it("goes to the order's customer, read in this business, the link sealed in the job", async () => {
        const res = await new CommunicationsService().queueTransactional(
            tx,
            "org_1",
            input(),
        );
        expect(res).toMatchObject({
            status: "QUEUED",
            toAddress: "ananya@example.com",
            route: "PROVIDER",
        });
        expect(orderFindFirst.mock.calls[0][0].where).toEqual({
            id: "o_1",
            organizationId: "org_1",
        });
        expect(linkFindFirst.mock.calls[0][0].where).toEqual({
            organizationId: "org_1",
            customerId: "cu_1",
        });
        expect(messageCreate.mock.calls[0][0].data).toMatchObject({
            contactId: "contact_1",
            template: "REVIEW_INVITATION",
        });
        expect(JSON.stringify(messageCreate.mock.calls)).not.toContain(
            "tok_review",
        );
        const payload = jobCreate.mock.calls[0][0].data.payload;
        expect(decryptSecret(payload.link)).toBe(
            "https://renderer.test/review/tok_review",
        );
    });

    it("reads consent on the linked contact", async () => {
        consentFindUnique.mockResolvedValue({ status: "REVOKED" });
        const res = await new CommunicationsService().queueTransactional(
            tx,
            "org_1",
            input(),
        );
        expect(res.status).toBe("SUPPRESSED");
        expect(jobCreate).not.toHaveBeenCalled();
    });

    it("never goes through Saroh: with no provider it is refused", async () => {
        providerFindUnique.mockResolvedValue(null);
        await expect(
            new CommunicationsService().queueTransactional(
                tx,
                "org_1",
                input(),
            ),
        ).rejects.toThrow(
            "Connect an email provider in Settings to send this.",
        );
        expect(messageCreate).not.toHaveBeenCalled();
    });

    it.each([
        ["another business's order", null],
        ["a walk-in", { customerId: null, customer: null }],
        [
            "a phone-only placeholder",
            {
                customerId: "cu_1",
                customer: { email: "phone+x@phone.invalid" },
            },
        ],
    ])("has no address for %s: 409, nothing written", async (_, order) => {
        orderFindFirst.mockResolvedValue(order);
        await expect(
            new CommunicationsService().queueTransactional(
                tx,
                "org_1",
                input(),
            ),
        ).rejects.toThrow("There's no email address to send this to.");
        expect(messageCreate).not.toHaveBeenCalled();
    });
});
