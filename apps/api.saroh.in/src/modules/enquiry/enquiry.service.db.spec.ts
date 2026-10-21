/**
 * The enquiry auto-reply, "we got your message" (DEC-174 U15, #1146),
 * against a real Postgres: from the public submit, through the
 * `customer.notify` job, to the business's own email provider.
 *
 * - An enquiry with an email, provider connected: one reply, their message
 *   quoted, from the business's address, never in the account thread.
 * - No provider, the switch off, or obvious spam: no reply; the team's
 *   `enquiry.notify` is queued exactly as before.
 * - One reply per address per business in 24 hours, however many times
 *   the form is sent; another business, or a day later, replies again.
 * - An address that bounced gets none; a job run twice sends once.
 *
 * Only the app env is stubbed (the credential key); the email provider is
 * the network-free fake. Runs in the integration project, plain and under
 * `TEST_RLS=on`.
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { CommunicationsService } from "../communications/communications.service";
import { MessageSendHandler } from "../communications/message-send.handler";
import {
    FakeCommsProvider,
    FakeCommsProviderFactory,
} from "../communications/providers/fake.provider";
import { CUSTOMER_NOTIFY_TYPE } from "../site-accounts/customer-notify-queue";
import {
    CustomerNotifyHandler,
    CustomerNotifyService,
} from "../site-accounts/customer-notify.handler";
import { EnquiryService } from "./enquiry.service";

const comms = new CommunicationsService();
const customerNotify = new CustomerNotifyHandler(
    new CustomerNotifyService(comms),
);
const enquiries = new EnquiryService();

const FIELDS = [
    { name: "email", label: "Email", type: "email", required: true },
    { name: "name", label: "Name", type: "text", required: true },
    { name: "message", label: "Message", type: "textarea" },
];

let seq = 0;
let ownerUserId: string;

beforeAll(async () => {
    ownerUserId = (
        await prisma.user.create({
            data: { email: `u15-owner-${process.pid}@example.com` },
        })
    ).id;
});

afterEach(() =>
    prisma.featureFlag.deleteMany({ where: { key: "ACCOUNT_THREAD" } }),
);

interface Business {
    owner: OrganizationContext;
    formId: string;
}

/** A business with an enquiry form, and its own email unless told not. */
async function business(opts: { email?: boolean } = {}): Promise<Business> {
    seq += 1;
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: `u15-${process.pid}-${seq}` },
    });
    const owner: OrganizationContext = {
        organizationId: org.id,
        userId: ownerUserId,
        role: "OWNER",
    };
    const form = await prisma.form.create({
        data: {
            organizationId: org.id,
            name: "Contact us",
            fields: FIELDS,
        },
    });
    if (opts.email !== false) {
        await comms.connectProvider(owner, {
            channel: "EMAIL",
            provider: "RESEND",
            fromAddress: "hello@rye.example",
            credentials: { apiKey: "re_test_key" },
        });
    }
    return { owner, formId: form.id };
}

function submit(
    b: Business,
    over: Record<string, unknown> = {},
): ReturnType<EnquiryService["submit"]> {
    return enquiries.submit(
        b.formId,
        {
            email: "asha@example.com",
            name: "Asha Rao",
            message: "Do you open on Sundays?",
            ...over,
        },
        undefined,
        undefined,
    );
}

async function jobsOf(organizationId: string, type: string): Promise<Job[]> {
    return prisma.job.findMany({
        where: { organizationId, type },
        orderBy: { createdAt: "asc" },
    });
}

/** Run every queued auto-reply, then hand every email to the fake. */
async function runAll(organizationId: string): Promise<FakeCommsProvider> {
    for (const job of await jobsOf(organizationId, CUSTOMER_NOTIFY_TYPE)) {
        await customerNotify.handle(job);
    }
    const fake = new FakeCommsProvider("EMAIL");
    const send = new MessageSendHandler(new FakeCommsProviderFactory(fake));
    for (const job of await jobsOf(organizationId, "message.send")) {
        await send.handle(job).catch(() => undefined);
    }
    return fake;
}

function repliesOf(organizationId: string) {
    return prisma.message.findMany({
        where: { organizationId, template: "ENQUIRY_RECEIVED" },
        orderBy: { createdAt: "asc" },
    });
}

describe("the enquiry auto-reply (real database)", () => {
    it("an enquiry with an email, provider connected: one reply through the business's own email, their message quoted, not in the thread", async () => {
        await prisma.featureFlag.create({
            data: { key: "ACCOUNT_THREAD", enabledByDefault: true },
        });
        const b = await business();
        const sent = await submit(b);

        const [job] = await jobsOf(
            b.owner.organizationId,
            CUSTOMER_NOTIFY_TYPE,
        );
        expect(job.payload).toEqual({
            kind: "ENQUIRY_RECEIVED",
            eventKey: `enquiry-received:${sent.submissionId}`,
            submissionId: sent.submissionId,
        });
        // The team's notice is its own job, unchanged.
        expect(
            await jobsOf(b.owner.organizationId, "enquiry.notify"),
        ).toHaveLength(1);

        const fake = await runAll(b.owner.organizationId);
        const [reply] = await repliesOf(b.owner.organizationId);
        expect(reply).toMatchObject({
            toAddress: "asha@example.com",
            contactId: sent.contactId,
            subject: "Rye & Co. got your message",
            createdByUserId: null,
            status: "SENT",
        });
        expect(reply.body).toContain("Hi Asha,");
        expect(reply.body).toContain(
            "<blockquote>Do you open on Sundays?</blockquote>",
        );
        expect(fake.calls).toHaveLength(1);
        expect(fake.calls[0]).toMatchObject({
            to: "asha@example.com",
            from: "hello@rye.example",
        });
        // Email only: nothing in the account thread, even with it on.
        expect(
            await prisma.customerThreadMessage.count({
                where: { organizationId: b.owner.organizationId },
            }),
        ).toBe(0);
        expect(
            await prisma.customerNotice.findUnique({
                where: {
                    organizationId_eventKey: {
                        organizationId: b.owner.organizationId,
                        eventKey: `enquiry-received:${sent.submissionId}`,
                    },
                },
            }),
        ).toMatchObject({ contactId: sent.contactId, messageId: reply.id });
    });

    it("no provider: nothing queued or sent, by the business or by Saroh; the team's notice unchanged", async () => {
        const b = await business({ email: false });
        await submit(b);
        expect(
            await jobsOf(b.owner.organizationId, CUSTOMER_NOTIFY_TYPE),
        ).toHaveLength(0);
        expect(
            await jobsOf(b.owner.organizationId, "enquiry.notify"),
        ).toHaveLength(1);
        expect(
            await prisma.message.count({
                where: { organizationId: b.owner.organizationId },
            }),
        ).toBe(0);
    });

    it("the provider disconnected after it was queued: the job claims and sends nothing", async () => {
        const b = await business();
        await submit(b);
        await prisma.communicationProvider.updateMany({
            where: { organizationId: b.owner.organizationId },
            data: { status: "DISCONNECTED" },
        });
        await runAll(b.owner.organizationId);
        expect(await repliesOf(b.owner.organizationId)).toHaveLength(0);
        expect(
            await prisma.customerNotice.count({
                where: { organizationId: b.owner.organizationId },
            }),
        ).toBe(0);
    });

    it("two enquiries from one address within an hour: one reply; another address gets its own", async () => {
        const b = await business();
        await submit(b);
        await submit(b, { message: "And on Mondays?" });
        await submit(b, {
            email: "ravi@example.com",
            name: "Ravi",
            message: "Hi",
        });
        expect(
            await jobsOf(b.owner.organizationId, CUSTOMER_NOTIFY_TYPE),
        ).toHaveLength(3);

        const fake = await runAll(b.owner.organizationId);
        const replies = await repliesOf(b.owner.organizationId);
        expect(replies.map((m) => m.toAddress).sort()).toEqual([
            "asha@example.com",
            "ravi@example.com",
        ]);
        expect(fake.calls).toHaveLength(2);
        // The one that went quotes the first message.
        expect(
            replies.find((m) => m.toAddress === "asha@example.com")?.body,
        ).toContain("Do you open on Sundays?");
    });

    it("the same address in another case counts as the same address", async () => {
        const b = await business();
        await submit(b);
        await runAll(b.owner.organizationId);
        await submit(b, { email: "ASHA@Example.com" });
        await runAll(b.owner.organizationId);
        expect(await repliesOf(b.owner.organizationId)).toHaveLength(1);
    });

    it("a day after the last reply, the same address is answered again", async () => {
        const b = await business();
        await submit(b);
        await runAll(b.owner.organizationId);
        await prisma.message.updateMany({
            where: { organizationId: b.owner.organizationId },
            data: { createdAt: new Date(Date.now() - 25 * 3600_000) },
        });
        await submit(b, { message: "Me again" });
        await runAll(b.owner.organizationId);
        expect(await repliesOf(b.owner.organizationId)).toHaveLength(2);
    });

    it("another business's reply to the same address doesn't count", async () => {
        const a = await business();
        const other = await business();
        await submit(a);
        await runAll(a.owner.organizationId);
        await submit(other);
        await runAll(other.owner.organizationId);
        expect(await repliesOf(a.owner.organizationId)).toHaveLength(1);
        expect(await repliesOf(other.owner.organizationId)).toHaveLength(1);
    });

    it("a spam-flagged submission: no reply; the lead and the team's notice as ever", async () => {
        const b = await business();
        const sent = await submit(b, {
            message:
                "Cheap https://a.example.com https://b.example.com https://c.example.com",
        });
        expect(sent.leadId).not.toBe("");
        expect(
            await jobsOf(b.owner.organizationId, CUSTOMER_NOTIFY_TYPE),
        ).toHaveLength(0);
        expect(
            await jobsOf(b.owner.organizationId, "enquiry.notify"),
        ).toHaveLength(1);
    });

    it("a message with one link is answered without quoting it", async () => {
        const b = await business();
        await submit(b, { message: "Do you stock https://example.com/x ?" });
        await runAll(b.owner.organizationId);
        const [reply] = await repliesOf(b.owner.organizationId);
        expect(reply.body).not.toContain("example.com/x");
        expect(reply.body).not.toContain("<blockquote>");
    });

    it("the switch off: nothing queued; the team's notice unchanged", async () => {
        const b = await business();
        await prisma.customerNoticeSetting.create({
            data: {
                organizationId: b.owner.organizationId,
                kind: "ENQUIRY_REPLY",
                enabled: false,
            },
        });
        await submit(b);
        expect(
            await jobsOf(b.owner.organizationId, CUSTOMER_NOTIFY_TYPE),
        ).toHaveLength(0);
        expect(
            await jobsOf(b.owner.organizationId, "enquiry.notify"),
        ).toHaveLength(1);
    });

    it("the switch turned off after it was queued: nothing is sent", async () => {
        const b = await business();
        await submit(b);
        await prisma.customerNoticeSetting.create({
            data: {
                organizationId: b.owner.organizationId,
                kind: "ENQUIRY_REPLY",
                enabled: false,
            },
        });
        await runAll(b.owner.organizationId);
        expect(await repliesOf(b.owner.organizationId)).toHaveLength(0);
    });

    it("an address an email from this business bounced at: no reply", async () => {
        const b = await business();
        const earlier = await prisma.message.create({
            data: {
                organizationId: b.owner.organizationId,
                channel: "EMAIL",
                toAddress: "asha@example.com",
                body: "Earlier",
                status: "SENT",
            },
        });
        await prisma.delivery.create({
            data: {
                organizationId: b.owner.organizationId,
                messageId: earlier.id,
                provider: "RESEND",
                status: "BOUNCED",
            },
        });
        await submit(b);
        await runAll(b.owner.organizationId);
        expect(await repliesOf(b.owner.organizationId)).toHaveLength(0);
    });

    it("the job delivered twice: one reply", async () => {
        const b = await business();
        await submit(b);
        const [job] = await jobsOf(
            b.owner.organizationId,
            CUSTOMER_NOTIFY_TYPE,
        );
        await customerNotify.handle(job);
        await customerNotify.handle(job);
        expect(await repliesOf(b.owner.organizationId)).toHaveLength(1);
    });
});
