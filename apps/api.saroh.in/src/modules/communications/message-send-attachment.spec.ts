// DEC-083: the invoice email carries the invoice's PDF, drawn by the send
// job, where the business's provider takes attachments — and goes with its
// link alone, never failed, where it doesn't or the PDF can't be drawn.
// DB-free and network-free, as `message-send.handler.spec.ts`.
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    },
}));

jest.mock("./confirmation-stamp", () => ({
    stampConfirmedEmail: jest.fn().mockResolvedValue(false),
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

import type { IssuedInvoicePdf } from "../invoices/issued-invoice-pdf";
import { encryptSecret } from "../payments/crypto";
import {
    MAX_ATTACHMENT_BYTES,
    MESSAGE_SEND_TYPE,
    MessageSendHandler,
} from "./message-send.handler";
import {
    FakeCommsProvider,
    FakeCommsProviderFactory,
} from "./providers/fake.provider";

const deliveryFindUnique = prisma.delivery.findUnique as jest.Mock;
const deliveryUpdate = prisma.delivery.update as jest.Mock;
const messageFindUnique = prisma.message.findUnique as jest.Mock;
const providerFindUnique = prisma.communicationProvider.findUnique as jest.Mock;

const PDF = Buffer.from("%PDF-1.7 the paper");

function providerRow() {
    const sealed = encryptSecret(JSON.stringify({ apiKey: "sk_test" }));
    return {
        id: "cp_1",
        organizationId: "org_1",
        channel: "EMAIL",
        provider: "RESEND",
        status: "CONNECTED",
        fromAddress: "hi@rye.example",
        encryptedCredentials: sealed.ciphertext,
        credentialsIv: sealed.iv,
        credentialsAuthTag: sealed.authTag,
    };
}

function job(attach = true): Job {
    return {
        id: "job_1",
        type: MESSAGE_SEND_TYPE,
        payload: {
            messageId: "msg_1",
            deliveryId: "del_1",
            ...(attach ? { attach: "INVOICE_PDF" } : {}),
        },
    } as unknown as Job;
}

function handlerWith(
    fake: FakeCommsProvider,
    draw: jest.Mock = jest
        .fn()
        .mockResolvedValue({ file: PDF, fileName: "INV-0042.pdf" }),
) {
    const pdfs = { draw } as unknown as IssuedInvoicePdf;
    return {
        handler: new MessageSendHandler(
            new FakeCommsProviderFactory(fake),
            pdfs,
        ),
        draw,
    };
}

function sentStatus(): string | undefined {
    return (deliveryUpdate.mock.calls[0]?.[0] as { data: { status: string } })
        ?.data.status;
}

describe("the invoice PDF on the invoice email (DEC-083)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        deliveryFindUnique.mockResolvedValue({ id: "del_1", status: "QUEUED" });
        messageFindUnique.mockResolvedValue({
            id: "msg_1",
            organizationId: "org_1",
            channel: "EMAIL",
            toAddress: "asha@example.com",
            subject: "Invoice INV-0042 from Rye",
            body: "<p>Your invoice</p>",
            invoiceId: "inv_1",
            template: "INVOICE_SENT",
        });
        providerFindUnique.mockResolvedValue(providerRow());
    });

    it("attaches the invoice's PDF, drawn at send time for its own business", async () => {
        const fake = new FakeCommsProvider("EMAIL");
        const { handler, draw } = handlerWith(fake);
        await handler.handle(job());
        expect(draw).toHaveBeenCalledWith("org_1", "inv_1");
        expect(fake.calls[0]?.attachments).toEqual([
            {
                fileName: "INV-0042.pdf",
                contentType: "application/pdf",
                content: PDF,
            },
        ]);
        expect(sentStatus()).toBe("SENT");
    });

    it("a provider that can't take attachments: the link-only email, nothing drawn", async () => {
        const fake = new FakeCommsProvider("EMAIL", undefined, false);
        const { handler, draw } = handlerWith(fake);
        await handler.handle(job());
        expect(draw).not.toHaveBeenCalled();
        expect(fake.calls).toHaveLength(1);
        expect(fake.calls[0]).not.toHaveProperty("attachments");
        expect(sentStatus()).toBe("SENT");
    });

    it("a message that didn't ask for it: nothing drawn", async () => {
        const fake = new FakeCommsProvider("EMAIL");
        const { handler, draw } = handlerWith(fake);
        await handler.handle(job(false));
        expect(draw).not.toHaveBeenCalled();
        expect(fake.calls[0]).not.toHaveProperty("attachments");
    });

    it.each([
        ["can't be drawn (a void or vanished invoice)", () => null],
        [
            "fails to draw",
            () => {
                throw new Error("storage down");
            },
        ],
        [
            "comes out too large",
            () => ({
                file: Buffer.alloc(MAX_ATTACHMENT_BYTES + 1),
                fileName: "INV-0042.pdf",
            }),
        ],
    ])(
        "a PDF that %s: the email still goes, with its link alone",
        async (_label, impl) => {
            const fake = new FakeCommsProvider("EMAIL");
            const { handler } = handlerWith(
                fake,
                jest.fn().mockImplementation(async () => impl()),
            );
            await handler.handle(job());
            expect(fake.calls).toHaveLength(1);
            expect(fake.calls[0]).not.toHaveProperty("attachments");
            expect(sentStatus()).toBe("SENT");
        },
    );

    it("a handler built without the drawer sends the link alone", async () => {
        const fake = new FakeCommsProvider("EMAIL");
        await new MessageSendHandler(new FakeCommsProviderFactory(fake)).handle(
            job(),
        );
        expect(fake.calls[0]).not.toHaveProperty("attachments");
    });
});
