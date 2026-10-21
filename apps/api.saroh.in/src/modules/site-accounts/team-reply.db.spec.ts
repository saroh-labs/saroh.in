/**
 * A team reply in Messages, emailed to the customer (DEC-174 U14, #1145),
 * against a real Postgres: the team's reply queues a notice held a minute;
 * its run emails the reply through the business's own provider with the
 * way back to Messages; three replies inside the minute are one email; a
 * message the customer wrote in between doesn't stop it; a reply after an
 * email carries only itself; no provider, the switch off or email turned
 * off by the customer send nothing; and the Messages tab's read says where
 * a reply is emailed, only when it is.
 *
 * Only the app env is stubbed (the credential key, and the account area
 * on); the email provider is the network-free fake. Runs in the
 * integration project, plain and with TEST_RLS=on.
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
        SITE_ACCOUNT_AREA: "on",
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
import { CUSTOMER_NOTIFY_TYPE } from "./customer-notify-queue";
import {
    CustomerNotifyHandler,
    CustomerNotifyService,
} from "./customer-notify.handler";
import { TEAM_REPLY_HOLD_MS } from "./notices/thread-reply";
import { appendMessage } from "./thread-store";
import { ThreadsService } from "./threads.service";

const comms = new CommunicationsService();
const customerNotify = new CustomerNotifyHandler(
    new CustomerNotifyService(comms),
);
const threads = new ThreadsService();

let seq = 0;
let staffId: string;

beforeAll(async () => {
    staffId = (
        await prisma.user.create({
            data: {
                email: `u14-staff-${process.pid}@example.com`,
                name: "Meera",
            },
        })
    ).id;
});

interface Business {
    owner: OrganizationContext;
    contactId: string;
}

/** Rye & Co. and its customer Asha, with no site account. */
async function business(opts: { email?: boolean } = {}): Promise<Business> {
    seq += 1;
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: `u14-${process.pid}-${seq}` },
    });
    const owner: OrganizationContext = {
        organizationId: org.id,
        userId: staffId,
        role: "OWNER",
    };
    const contact = await prisma.contact.create({
        data: {
            organizationId: org.id,
            email: "asha@example.com",
            firstName: "Asha",
            lastName: "Rao",
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
    return { owner, contactId: contact.id };
}

const jobsOf = (organizationId: string, type: string): Promise<Job[]> =>
    prisma.job.findMany({
        where: { organizationId, type },
        orderBy: { createdAt: "asc" },
    });

const emailsOf = (organizationId: string) =>
    prisma.message.findMany({
        where: { organizationId, template: "THREAD_REPLY" },
        orderBy: { createdAt: "asc" },
    });

async function sendAll(organizationId: string): Promise<FakeCommsProvider> {
    const fake = new FakeCommsProvider("EMAIL");
    const handler = new MessageSendHandler(new FakeCommsProviderFactory(fake));
    for (const job of await jobsOf(organizationId, "message.send")) {
        await handler.handle(job).catch(() => undefined);
    }
    return fake;
}

/** Run every queued team-reply notice, in the order given. */
async function runNotices(organizationId: string, order: "asc" | "desc") {
    const jobs = await jobsOf(organizationId, CUSTOMER_NOTIFY_TYPE);
    for (const job of order === "asc" ? jobs : [...jobs].reverse()) {
        await customerNotify.handle(job);
    }
    // Done, as the worker would mark them.
    await prisma.job.deleteMany({
        where: { organizationId, type: CUSTOMER_NOTIFY_TYPE },
    });
}

const T0 = new Date("2026-10-21T05:30:00.000Z");
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

describe("a team reply in Messages is emailed (real database)", () => {
    it("one reply: held a minute, then emailed through the business's own provider, with the text", async () => {
        const b = await business();
        await threads.reply(
            b.owner,
            b.contactId,
            "Yes, 40 are on the shelf.",
            at(0),
        );

        const [job] = await jobsOf(
            b.owner.organizationId,
            CUSTOMER_NOTIFY_TYPE,
        );
        expect(job.payload).toMatchObject({
            kind: "THREAD_REPLY",
            eventKey: expect.stringMatching(/^thread-reply:/),
            threadMessageId: expect.any(String),
        });
        expect(job.runAt.getTime()).toBe(T0.getTime() + TEAM_REPLY_HOLD_MS);

        await customerNotify.handle(job);

        const [email] = await emailsOf(b.owner.organizationId);
        expect(email).toMatchObject({
            toAddress: "asha@example.com",
            contactId: b.contactId,
            status: "QUEUED",
            createdByUserId: null,
            subject: "Rye & Co. replied to your message",
        });
        expect(email.body).toContain("Yes, 40 are on the shelf.");

        // Email only: the reply is the one message in the thread.
        expect(
            await prisma.customerThreadMessage.count({
                where: { organizationId: b.owner.organizationId },
            }),
        ).toBe(1);

        const fake = await sendAll(b.owner.organizationId);
        expect(fake.calls).toHaveLength(1);
        expect(fake.calls[0]).toMatchObject({
            to: "asha@example.com",
            from: "hello@rye.example",
        });
    });

    it("carries the way back to their Messages on the business's site", async () => {
        const b = await business();
        const subdomain = `u14x${seq}x${process.pid}`;
        const site = await prisma.site.create({
            data: {
                organizationId: b.owner.organizationId,
                name: "Rye & Co.",
                slug: `u14-site-${process.pid}-${seq}`,
                subdomain,
            },
        });
        const publication = await prisma.publication.create({
            data: {
                siteId: site.id,
                organizationId: b.owner.organizationId,
                snapshot: { pages: [] },
                templateId: "blank",
                templateVersion: 1,
            },
        });
        await prisma.site.update({
            where: { id: site.id },
            data: { currentPublicationId: publication.id },
        });
        await threads.reply(b.owner, b.contactId, "See you then.", at(0));
        await runNotices(b.owner.organizationId, "asc");
        const [email] = await emailsOf(b.owner.organizationId);
        expect(email.body).toContain("Read it and reply in your Messages:");
        expect(email.body).toMatch(
            new RegExp(`href="https?://${subdomain}\\.[^"]+/account/messages"`),
        );
    });

    it("tells once, however often the job runs", async () => {
        const b = await business();
        await threads.reply(b.owner, b.contactId, "On its way.", at(0));
        const [job] = await jobsOf(
            b.owner.organizationId,
            CUSTOMER_NOTIFY_TYPE,
        );
        await customerNotify.handle(job);
        await customerNotify.handle(job);
        expect(await emailsOf(b.owner.organizationId)).toHaveLength(1);
    });

    it.each(["asc", "desc"] as const)(
        "three replies inside the minute are one email with all three, oldest first (runs %s)",
        async (order) => {
            const b = await business();
            await threads.reply(b.owner, b.contactId, "First.", at(0));
            await threads.reply(b.owner, b.contactId, "Second.", at(10));
            await threads.reply(b.owner, b.contactId, "Third.", at(20));
            expect(
                await jobsOf(b.owner.organizationId, CUSTOMER_NOTIFY_TYPE),
            ).toHaveLength(3);

            await runNotices(b.owner.organizationId, order);

            const emails = await emailsOf(b.owner.organizationId);
            expect(emails).toHaveLength(1);
            const body = emails[0].body;
            expect(body).toContain("Their replies:");
            expect(body.indexOf("First.")).toBeLessThan(
                body.indexOf("Second."),
            );
            expect(body.indexOf("Second.")).toBeLessThan(
                body.indexOf("Third."),
            );
        },
    );

    it("the customer wrote again before the run: still sent", async () => {
        const b = await business();
        await threads.reply(b.owner, b.contactId, "We open at 9.", at(0));
        await appendMessage(prisma, {
            organizationId: b.owner.organizationId,
            contactId: b.contactId,
            author: "CUSTOMER",
            body: "Thanks!",
            now: at(30),
        });
        await runNotices(b.owner.organizationId, "asc");
        const emails = await emailsOf(b.owner.organizationId);
        expect(emails).toHaveLength(1);
        expect(emails[0].body).toContain("We open at 9.");
        expect(emails[0].body).not.toContain("Thanks!");
    });

    it("a reply after an email carries only itself", async () => {
        const b = await business();
        await threads.reply(b.owner, b.contactId, "Earlier answer.", at(0));
        await runNotices(b.owner.organizationId, "asc");
        await threads.reply(b.owner, b.contactId, "Later answer.", at(600));
        await runNotices(b.owner.organizationId, "asc");

        const emails = await emailsOf(b.owner.organizationId);
        expect(emails).toHaveLength(2);
        expect(emails[1].body).toContain("Later answer.");
        expect(emails[1].body).not.toContain("Earlier answer.");
        expect(emails[1].body).toContain("Their reply:");
    });

    it("no provider: nothing is queued, the reply waits in Messages, and the tab says nothing is emailed", async () => {
        const b = await business({ email: false });
        await threads.reply(b.owner, b.contactId, "Hello.", at(0));
        expect(
            await jobsOf(b.owner.organizationId, CUSTOMER_NOTIFY_TYPE),
        ).toHaveLength(0);
        expect(
            await prisma.customerThreadMessage.count({
                where: { organizationId: b.owner.organizationId },
            }),
        ).toBe(1);
        expect(
            (await threads.forStaff(b.owner, b.contactId)).emailedTo,
        ).toBeNull();
    });

    it("the switch off: nothing is queued; turned off after the reply, the run sends nothing", async () => {
        const b = await business();

        await threads.reply(b.owner, b.contactId, "Queued first.", at(0));
        // The switch turned off (Settings › Providers writes this row).
        await prisma.customerNoticeSetting.create({
            data: {
                organizationId: b.owner.organizationId,
                kind: "TEAM_REPLY",
                enabled: false,
            },
        });
        await runNotices(b.owner.organizationId, "asc");
        expect(await emailsOf(b.owner.organizationId)).toHaveLength(0);

        await threads.reply(b.owner, b.contactId, "While off.", at(120));
        expect(
            await jobsOf(b.owner.organizationId, CUSTOMER_NOTIFY_TYPE),
        ).toHaveLength(0);
        expect(
            (await threads.forStaff(b.owner, b.contactId)).emailedTo,
        ).toBeNull();
    });

    it("email turned off by the customer: SUPPRESSED, and the tab never says it is emailed", async () => {
        const b = await business();
        await prisma.consent.create({
            data: {
                organizationId: b.owner.organizationId,
                contactId: b.contactId,
                channel: "EMAIL",
                status: "REVOKED",
            },
        });
        expect(
            (await threads.forStaff(b.owner, b.contactId)).emailedTo,
        ).toBeNull();
        await threads.reply(b.owner, b.contactId, "Hello.", at(0));
        await runNotices(b.owner.organizationId, "asc");
        const [email] = await emailsOf(b.owner.organizationId);
        expect(email.status).toBe("SUPPRESSED");
        expect((await sendAll(b.owner.organizationId)).calls).toHaveLength(0);
    });

    it("the tab names the address a reply is emailed to", async () => {
        const b = await business();
        expect(await threads.forStaff(b.owner, b.contactId)).toMatchObject({
            emailedTo: "asha@example.com",
        });
    });

    it("another business's reply is not carried in this one's email", async () => {
        const a = await business();
        const other = await business();
        await threads.reply(a.owner, a.contactId, "For the Rye Asha.", at(0));
        await threads.reply(
            other.owner,
            other.contactId,
            "For the other Asha.",
            at(5),
        );
        await runNotices(a.owner.organizationId, "asc");
        const [email] = await emailsOf(a.owner.organizationId);
        expect(email.body).toContain("For the Rye Asha.");
        expect(email.body).not.toContain("For the other Asha.");
    });
});
