/**
 * Sending an invoice with its pay link (round-2 D17) against a real
 * Postgres: the send queues a Message through the business's own provider,
 * the email that reaches the provider carries a pay link that works (its
 * token hashes to the invoice's), the stored body and the job never carry
 * the token in the clear, the refusals (sent already, a reminder the same
 * day, paid, no provider), a revoked email consent, and the account thread
 * behind its flag and A14's poster.
 *
 * Only the app env is stubbed (for the credential key); the email provider
 * is the network-free fake. Runs in the integration project.
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
        RENDERER_URL: "https://saroh.app",
    },
}));

import { HttpException } from "@nestjs/common";
import type { Job, Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type {
    AccountThreadPost,
    AccountThreadPoster,
} from "../communications/account-thread";
import { CommunicationsService } from "../communications/communications.service";
import { MessageSendHandler } from "../communications/message-send.handler";
import {
    FakeCommsProvider,
    FakeCommsProviderFactory,
} from "../communications/providers/fake.provider";
import { SECRET_LINK_SLOT } from "../communications/transactional";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import { AccountThreadPosterService } from "../site-accounts/thread-poster";
import { InvoiceSendService } from "./invoice-send.service";
import { InvoicesService } from "./invoices.service";
import { hashPayToken } from "./pay-token";

const comms = new CommunicationsService();
const invoices = new InvoicesService();
const payments = new PaymentsService(
    new FakeProviderFactory(new FakeMerchantProvider("RAZORPAY")),
);

class RecordingPoster implements AccountThreadPoster {
    readonly posts: AccountThreadPost[] = [];
    post(_tx: Prisma.TransactionClient, input: AccountThreadPost) {
        this.posts.push(input);
        return Promise.resolve();
    }
}

const sending = new InvoiceSendService(invoices, comms);

let owner: OrganizationContext;
let contactId: string;

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: `invoice-send-${process.pid}` },
    });
    owner = { organizationId: org.id, userId: "user_1", role: "OWNER" };
    contactId = (
        await prisma.contact.create({
            data: {
                organizationId: org.id,
                email: "asha@example.com",
                firstName: "Asha",
                lastName: "Rao",
            },
        })
    ).id;
    await payments.connectProvider(owner, {
        provider: "RAZORPAY",
        publicKey: "rzp_test_Public1",
        keyId: "rzp_test_Public1",
        keySecret: "rzp_secret",
        webhookSecret: "whsec",
    });
    await comms.connectProvider(owner, {
        channel: "EMAIL",
        provider: "RESEND",
        fromAddress: "hello@rye.example",
        credentials: { apiKey: "re_test_key" },
    });
});

async function issued(forContact = contactId): Promise<string> {
    const draft = await invoices.createDraft(owner, {
        contactId: forContact,
        currency: "INR",
        lines: [
            {
                description: "Monthly membership",
                quantity: 1,
                unitPrice: "2400",
            },
        ],
    });
    await invoices.issue(owner, draft.id);
    return draft.id;
}

async function jobFor(messageId: string): Promise<Job> {
    const jobs = await prisma.job.findMany({
        where: { organizationId: owner.organizationId, type: "message.send" },
    });
    const job = jobs.find(
        (j) => (j.payload as { messageId?: string }).messageId === messageId,
    );
    if (!job) throw new Error("no job");
    return job;
}

async function status(p: Promise<unknown>): Promise<number | undefined> {
    try {
        await p;
        return undefined;
    } catch (e) {
        return e instanceof HttpException ? e.getStatus() : -1;
    }
}

describe("sending an invoice (real database)", () => {
    it("offers email, queues one Message, and the email's pay link works", async () => {
        const id = await issued();
        const before = await sending.readFor(owner.organizationId, id);
        expect(before.send).toEqual({
            channels: ["email"],
            emailTo: "asha@example.com",
            nextReminderAt: null,
        });

        const res = await sending.send(owner, id);
        expect(res).toEqual({
            channels: ["email"],
            email: { status: "QUEUED", to: "asha@example.com" },
            thread: false,
        });

        const [message] = await prisma.message.findMany({
            where: { invoiceId: id },
        });
        expect(message).toMatchObject({
            template: "INVOICE_SENT",
            status: "QUEUED",
            toAddress: "asha@example.com",
            contactId,
            createdByUserId: "user_1",
        });
        expect(message?.subject).toContain("Rye & Co.");
        expect(message?.body).toContain(SECRET_LINK_SLOT);
        expect(message?.body).toContain("₹2,400.00");

        const job = await jobFor(message!.id);
        const fake = new FakeCommsProvider("EMAIL");
        await new MessageSendHandler(new FakeCommsProviderFactory(fake)).handle(
            job,
        );
        const sentBody = fake.calls[0]?.body ?? "";
        const token = /https:\/\/saroh\.app\/pay\/([A-Za-z0-9_-]{43})/.exec(
            sentBody,
        )?.[1];
        expect(token).toBeDefined();
        const invoice = await prisma.invoice.findUniqueOrThrow({
            where: { id },
        });
        expect(invoice.payTokenHash).toBe(hashPayToken(token!));
        // The token lives only in the email: not the Message, not the job.
        const stored = await prisma.message.findUniqueOrThrow({
            where: { id: message!.id },
        });
        expect(stored.body).not.toContain(token);
        expect(stored.status).toBe("SENT");
        expect(JSON.stringify(job.payload)).not.toContain(token);

        const after = await sending.readFor(owner.organizationId, id);
        expect(after.sent).toEqual([
            expect.objectContaining({
                to: "asha@example.com",
                reminder: false,
                status: "SENT",
            }),
        ]);
        expect(after.send.nextReminderAt).not.toBeNull();
    });

    it("a second send is refused; a reminder the same day is 429 with the next time", async () => {
        const id = await issued();
        await sending.send(owner, id);
        expect(await status(sending.send(owner, id))).toBe(409);

        const err = await sending.remind(owner, id).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(429);
        const body = (err as HttpException).getResponse() as {
            message: string;
            details: { retryAt: string };
        };
        expect(body.message).toMatch(
            /^One reminder a day\. The next can go after /,
        );
        const [sent] = await prisma.message.findMany({
            where: { invoiceId: id },
        });
        expect(new Date(body.details.retryAt).getTime()).toBe(
            sent!.createdAt.getTime() + 24 * 60 * 60 * 1000,
        );
    });

    it("a reminder goes once the day has passed, in reminder words, with a new link", async () => {
        const id = await issued();
        await sending.send(owner, id);
        const first = await prisma.invoice.findUniqueOrThrow({ where: { id } });
        await prisma.message.updateMany({
            where: { invoiceId: id },
            data: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
        });

        await sending.remind(owner, id);
        const reminder = await prisma.message.findFirstOrThrow({
            where: { invoiceId: id, template: "INVOICE_REMINDER" },
        });
        expect(reminder.subject).toMatch(/^Reminder: invoice /);
        const after = await prisma.invoice.findUniqueOrThrow({ where: { id } });
        expect(after.payTokenHash).not.toBe(first.payTokenHash);
    });

    it("a revoked email consent suppresses it and keeps the link already shared", async () => {
        const other = (
            await prisma.contact.create({
                data: {
                    organizationId: owner.organizationId,
                    email: "farah@example.com",
                    firstName: "Farah",
                },
            })
        ).id;
        await comms.setConsent(owner, {
            contactId: other,
            channel: "EMAIL",
            status: "REVOKED",
        });
        const id = await issued(other);
        await invoices.createPayLink(owner, id);
        const before = await prisma.invoice.findUniqueOrThrow({
            where: { id },
        });

        const res = await sending.send(owner, id);
        expect(res.email).toEqual({
            status: "SUPPRESSED",
            to: "farah@example.com",
        });
        const messages = await prisma.message.findMany({
            where: { invoiceId: id },
            include: { deliveries: true },
        });
        expect(messages).toHaveLength(1);
        expect(messages[0]?.status).toBe("SUPPRESSED");
        expect(messages[0]?.deliveries).toHaveLength(0);
        const after = await prisma.invoice.findUniqueOrThrow({ where: { id } });
        expect(after.payTokenHash).toBe(before.payTokenHash);
        // Suppressed isn't sent: it doesn't block a later send or reminder.
        const read = await sending.readFor(owner.organizationId, id);
        expect(read.send.nextReminderAt).toBeNull();
        expect(read.sent[0]?.status).toBe("SUPPRESSED");
    });

    it("refuses a paid invoice with 409 Already paid", async () => {
        const id = await issued();
        await invoices.recordPayment(owner, id, { method: "CASH" });
        await expect(sending.send(owner, id)).rejects.toThrow("Already paid.");
        const read = await sending.readFor(owner.organizationId, id);
        expect(read.send).toEqual({
            channels: [],
            reason: "NOT_OWED",
            nextReminderAt: null,
        });
    });

    it("a draft is offered (it will be sent once issued) but not sent yet", async () => {
        const draft = await invoices.createDraft(owner, {
            contactId,
            currency: "INR",
            lines: [{ description: "Class", quantity: 1, unitPrice: "500" }],
        });
        const read = await sending.readFor(owner.organizationId, draft.id);
        expect(read.send.channels).toEqual(["email"]);
        expect(read.send.emailTo).toBe("asha@example.com");
        await expect(sending.send(owner, draft.id)).rejects.toThrow(
            "Issue the invoice before sending it.",
        );
    });

    it("with no email provider and no thread: no channel, and the API answers 409", async () => {
        const id = await issued();
        await comms.disconnectProvider(owner, "EMAIL");
        try {
            const read = await sending.readFor(owner.organizationId, id);
            expect(read.send).toEqual({
                channels: [],
                reason: "NO_EMAIL_PROVIDER",
                nextReminderAt: null,
            });
            expect(await status(sending.send(owner, id))).toBe(409);
            expect(await status(sending.remind(owner, id))).toBe(409);
            expect(
                await prisma.message.count({ where: { invoiceId: id } }),
            ).toBe(0);
        } finally {
            await comms.connectProvider(owner, {
                channel: "EMAIL",
                provider: "RESEND",
                fromAddress: "hello@rye.example",
                credentials: { apiKey: "re_test_key" },
            });
        }
    });

    describe("the account thread", () => {
        let accountContact: string;

        beforeAll(async () => {
            accountContact = (
                await prisma.contact.create({
                    data: {
                        organizationId: owner.organizationId,
                        email: "meera@example.com",
                        firstName: "Meera",
                    },
                })
            ).id;
            await prisma.customerAccount.create({
                data: {
                    organizationId: owner.organizationId,
                    contactId: accountContact,
                    email: "meera@example.com",
                    emailVerifiedAt: new Date(),
                },
            });
        });

        afterEach(() =>
            prisma.featureFlag.deleteMany({ where: { key: "ACCOUNT_THREAD" } }),
        );

        it("is never offered before A14's poster exists, even with the flag on", async () => {
            await prisma.featureFlag.create({
                data: { key: "ACCOUNT_THREAD", enabledByDefault: true },
            });
            const id = await issued(accountContact);
            const read = await sending.readFor(owner.organizationId, id);
            expect(read.send.channels).toEqual(["email"]);
        });

        it("is never offered while the flag is off (A13 not yet live)", async () => {
            const poster = new RecordingPoster();
            const withThread = new InvoiceSendService(invoices, comms, poster);
            const id = await issued(accountContact);
            const read = await withThread.readFor(owner.organizationId, id);
            expect(read.send.channels).toEqual(["email"]);
            await withThread.send(owner, id);
            expect(poster.posts).toHaveLength(0);
        });

        it("with the flag on and a poster: both channels, posted once", async () => {
            await prisma.featureFlag.create({
                data: { key: "ACCOUNT_THREAD", enabledByDefault: true },
            });
            const poster = new RecordingPoster();
            const withThread = new InvoiceSendService(invoices, comms, poster);
            const id = await issued(accountContact);
            const res = await withThread.send(owner, id);
            expect(res.channels).toEqual(["email", "thread"]);
            expect(res.thread).toBe(true);
            expect(poster.posts).toEqual([
                {
                    organizationId: owner.organizationId,
                    contactId: accountContact,
                    invoiceId: id,
                    kind: "INVOICE_SENT",
                    actorUserId: "user_1",
                },
            ]);
        });

        it("with no email provider: the thread alone, and no Message", async () => {
            await prisma.featureFlag.create({
                data: { key: "ACCOUNT_THREAD", enabledByDefault: true },
            });
            await comms.disconnectProvider(owner, "EMAIL");
            try {
                const poster = new RecordingPoster();
                const withThread = new InvoiceSendService(
                    invoices,
                    comms,
                    poster,
                );
                const id = await issued(accountContact);
                const res = await withThread.send(owner, id);
                expect(res).toEqual({
                    channels: ["thread"],
                    email: null,
                    thread: true,
                });
                expect(poster.posts).toHaveLength(1);
                expect(
                    await prisma.message.count({ where: { invoiceId: id } }),
                ).toBe(0);
            } finally {
                await comms.connectProvider(owner, {
                    channel: "EMAIL",
                    provider: "RESEND",
                    fromAddress: "hello@rye.example",
                    credentials: { apiKey: "re_test_key" },
                });
            }
        });

        it("A13's poster writes the invoice into the thread, and a thread-only send counts once", async () => {
            await prisma.featureFlag.create({
                data: { key: "ACCOUNT_THREAD", enabledByDefault: true },
            });
            await comms.disconnectProvider(owner, "EMAIL");
            try {
                const withThread = new InvoiceSendService(
                    invoices,
                    comms,
                    new AccountThreadPosterService(),
                );
                const id = await issued(accountContact);
                const res = await withThread.send(owner, id);
                expect(res).toEqual({
                    channels: ["thread"],
                    email: null,
                    thread: true,
                });
                const posts = await prisma.customerThreadMessage.findMany({
                    where: { invoiceId: id },
                    include: { thread: { select: { contactId: true } } },
                });
                expect(posts).toHaveLength(1);
                expect(posts[0]).toMatchObject({
                    author: "SYSTEM",
                    event: "INVOICE_SENT",
                    authorUserId: "user_1",
                    thread: { contactId: accountContact },
                });
                expect(posts[0].body).toMatch(
                    /^Invoice .+ for ₹2,400\.00 is ready to pay\./,
                );
                // The pay link is never in a message that is kept.
                expect(posts[0].body).not.toMatch(/pay\//);

                // Once sent, by the thread alone: a second send is refused,
                // and a reminder the same day waits (D17's rules hold).
                await expect(withThread.send(owner, id)).rejects.toThrow(
                    "This invoice has been sent. Send a reminder instead.",
                );
                await expect(withThread.remind(owner, id)).rejects.toThrow(
                    /One reminder a day/,
                );
                const read = await withThread.readFor(owner.organizationId, id);
                expect(read.send.nextReminderAt).not.toBeNull();
            } finally {
                await comms.connectProvider(owner, {
                    channel: "EMAIL",
                    provider: "RESEND",
                    fromAddress: "hello@rye.example",
                    credentials: { apiKey: "re_test_key" },
                });
            }
        });
    });
});
