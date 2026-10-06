// `message.send` for a delivery stamped SAROH (DEC-086), DB- and
// network-free: the stamp wins over a provider connected since, the
// switches are asked again, and each of the sender's outcomes lands as it
// should (sent; failed → retried; unknown → never retried).
jest.mock("../../env", () => ({ env: {} }));

jest.mock("./confirmation-stamp", () => ({
    stampConfirmedEmail: jest.fn().mockResolvedValue(false),
}));

jest.mock("./providers/saroh-email.sender", () => ({
    sendSarohBusinessEmail: jest.fn(),
}));

jest.mock("./saroh-may-send", () => ({
    sarohSwitchesOn: jest.fn(),
}));

jest.mock("@saroh/database", () => ({
    prisma: {
        delivery: { findUnique: jest.fn(), update: jest.fn() },
        message: { findUnique: jest.fn(), update: jest.fn() },
        communicationProvider: { findUnique: jest.fn() },
        organization: { findUnique: jest.fn() },
        businessProfile: { findUnique: jest.fn() },
    },
}));

import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { stampConfirmedEmail } from "./confirmation-stamp";
import { MESSAGE_SEND_TYPE, MessageSendHandler } from "./message-send.handler";
import {
    FakeCommsProvider,
    FakeCommsProviderFactory,
} from "./providers/fake.provider";
import { sendSarohBusinessEmail } from "./providers/saroh-email.sender";
import { sarohSwitchesOn } from "./saroh-may-send";

const send = sendSarohBusinessEmail as jest.Mock;
const switchesOn = sarohSwitchesOn as jest.Mock;
const deliveryUpdate = prisma.delivery.update as jest.Mock;
const messageUpdate = prisma.message.update as jest.Mock;

const job = {
    id: "job_1",
    type: MESSAGE_SEND_TYPE,
    attempts: 0,
    maxAttempts: 5,
    payload: { messageId: "msg_1", deliveryId: "del_1" },
} as unknown as Job;

const message = {
    id: "msg_1",
    organizationId: "org_1",
    channel: "EMAIL",
    toAddress: "asha@example.com",
    subject: "Your booking with Rye is confirmed",
    body: "<p>Hi Asha,</p>",
};

let fake: FakeCommsProvider;
let handler: MessageSendHandler;

beforeEach(() => {
    jest.clearAllMocks();
    (prisma.delivery.findUnique as jest.Mock).mockResolvedValue({
        id: "del_1",
        status: "QUEUED",
        provider: "SAROH",
    });
    (prisma.message.findUnique as jest.Mock).mockResolvedValue(message);
    (prisma.organization.findUnique as jest.Mock).mockResolvedValue({
        name: "Rye & Co.",
        slug: "rye-co",
    });
    (prisma.businessProfile.findUnique as jest.Mock).mockResolvedValue({
        contactEmail: "hello@rye.example",
    });
    switchesOn.mockResolvedValue(true);
    send.mockResolvedValue("sent");
    fake = new FakeCommsProvider("EMAIL");
    handler = new MessageSendHandler(new FakeCommsProviderFactory(fake));
});

describe("message.send through Saroh (DEC-086)", () => {
    it("hands it to Saroh's sender with the business's name and reply address now, and records SENT", async () => {
        await handler.handle(job);
        expect(send).toHaveBeenCalledWith({
            organizationId: "org_1",
            businessName: "Rye & Co.",
            fallbackName: "rye-co",
            contactEmail: "hello@rye.example",
            to: "asha@example.com",
            subject: message.subject,
            html: message.body,
        });
        expect(deliveryUpdate.mock.calls[0][0]).toMatchObject({
            where: { id: "del_1" },
            data: { status: "SENT", error: null },
        });
        expect(messageUpdate.mock.calls[0][0].data).toEqual({
            status: "SENT",
        });
        // A confirmation sent proves the address, as through a provider.
        expect(stampConfirmedEmail).toHaveBeenCalled();
    });

    it("honours the stamp: a provider connected since never sends it a second way", async () => {
        (
            prisma.communicationProvider.findUnique as jest.Mock
        ).mockResolvedValue({ status: "CONNECTED", provider: "RESEND" });
        await handler.handle(job);
        expect(send).toHaveBeenCalledTimes(1);
        expect(fake.calls).toHaveLength(0);
        expect(prisma.communicationProvider.findUnique).not.toHaveBeenCalled();
    });

    it("a switch turned off since: no SES call, STOPPED, never retried", async () => {
        switchesOn.mockResolvedValue(false);
        await expect(handler.handle(job)).resolves.toBeUndefined();
        expect(send).not.toHaveBeenCalled();
        expect(deliveryUpdate.mock.calls[0][0].data).toMatchObject({
            status: "STOPPED",
        });
        expect(messageUpdate.mock.calls[0][0].data).toEqual({
            status: "FAILED",
        });
        expect(stampConfirmedEmail).not.toHaveBeenCalled();
    });

    it("a failed send is FAILED and thrown, so the worker retries it as any send", async () => {
        send.mockResolvedValue("failed");
        await expect(handler.handle(job)).rejects.toThrow(
            "Saroh's email couldn't send it",
        );
        expect(deliveryUpdate.mock.calls[0][0].data).toMatchObject({
            status: "FAILED",
            error: "Saroh's email couldn't send it",
            attempts: { increment: 1 },
        });
        expect(stampConfirmedEmail).not.toHaveBeenCalled();
    });

    it("no mail set up is retried too, and says so", async () => {
        send.mockResolvedValue("not-configured");
        await expect(handler.handle(job)).rejects.toThrow(
            "Saroh's email isn't set up on this server",
        );
    });

    it("unknown (it may have gone) is never retried: UNKNOWN, nothing thrown", async () => {
        send.mockResolvedValue("unknown");
        await expect(handler.handle(job)).resolves.toBeUndefined();
        expect(deliveryUpdate.mock.calls[0][0].data).toMatchObject({
            status: "UNKNOWN",
        });
        expect(messageUpdate.mock.calls[0][0].data).toEqual({
            status: "UNKNOWN",
        });
        expect(stampConfirmedEmail).not.toHaveBeenCalled();
    });

    it("a delivery already SENT is never sent again", async () => {
        (prisma.delivery.findUnique as jest.Mock).mockResolvedValue({
            id: "del_1",
            status: "SENT",
            provider: "SAROH",
        });
        await handler.handle(job);
        expect(send).not.toHaveBeenCalled();
    });

    it.each(["UNKNOWN", "STOPPED"])(
        "a re-run on a Saroh delivery already %s never sends it",
        async (status) => {
            (prisma.delivery.findUnique as jest.Mock).mockResolvedValue({
                id: "del_1",
                status,
                provider: "SAROH",
            });
            await expect(handler.handle(job)).resolves.toBeUndefined();
            expect(send).not.toHaveBeenCalled();
            expect(deliveryUpdate).not.toHaveBeenCalled();
            expect(messageUpdate).not.toHaveBeenCalled();
        },
    );
});
