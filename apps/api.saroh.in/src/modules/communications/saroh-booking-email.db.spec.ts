/**
 * Saroh sends a business's booking emails while it has no email provider of
 * its own (DEC-086), against a real Postgres: a booking at a business with
 * no provider queued as a `SAROH` delivery and handed to Saroh's sender;
 * a business's own provider sending as ever; each switch turning it off;
 * notices that aren't booking ones left alone; a revoked consent; the stamp
 * honoured when a provider connects before the job; a switch turned off
 * after the queue; one event told once; and the booking quick look saying
 * what is sent.
 *
 * Saroh's sender is a stand-in (no SES); everything else is real. The
 * switches are turned on per business (overrides), never for everyone, and
 * each business is on a made-up plan with an allowance of 3 a month
 * (`fakeSarohEmailsCatalog`); the allowance itself is
 * saroh-email-allowance.db.spec.ts. Runs in the integration project.
 */
const mockEnv: Record<string, string | undefined> = {
    PAYMENTS_ENC_KEY:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    NODE_ENV: "test",
    SITE_ACCOUNT_AREA: "on",
};
jest.mock("../../env", () => ({ env: mockEnv }));

jest.mock("./providers/saroh-email.sender", () => ({
    ...jest.requireActual<object>("./providers/saroh-email.sender"),
    sendSarohBusinessEmail: jest.fn(),
}));

import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import {
    fakeSarohEmailsCatalog,
    installCatalogue,
    sarohEmailVersion,
    subscribe,
} from "../../../test/fixtures/saroh-email";
import type { OrganizationContext } from "../../common/types/organization-context";
import { BookingNotifyHandler } from "../bookings/booking-notify.handler";
import { FlagKey } from "../feature-flags/flags";
import { CUSTOMER_NOTIFY_TYPE } from "../site-accounts/customer-notify-queue";
import {
    CustomerNotifyHandler,
    CustomerNotifyService,
} from "../site-accounts/customer-notify.handler";
import { CommunicationsService } from "./communications.service";
import { MessageSendHandler } from "./message-send.handler";
import {
    FakeCommsProvider,
    FakeCommsProviderFactory,
} from "./providers/fake.provider";
import { sendSarohBusinessEmail } from "./providers/saroh-email.sender";

const send = sendSarohBusinessEmail as jest.Mock;

const comms = new CommunicationsService();
const notices = new CustomerNotifyService(comms);
const bookingNotify = new BookingNotifyHandler(notices);
const customerNotify = new CustomerNotifyHandler(notices);

const V = sarohEmailVersion();
const V_WITHOUT_ROW = V + 1;

beforeAll(async () => {
    await installCatalogue(V, fakeSarohEmailsCatalog());
    await installCatalogue(V_WITHOUT_ROW, fakeSarohEmailsCatalog(false));
});

// A real team member: the booking's event names who made it.
let staffId: string;

beforeAll(async () => {
    staffId = (
        await prisma.user.create({
            data: {
                email: `saroh-mail-staff-${process.pid}-${Date.now()}@example.com`,
            },
        })
    ).id;
});

let seq = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++seq}`;

async function flagRow(key: string): Promise<void> {
    await prisma.featureFlag.upsert({
        where: { key },
        create: { key, enabledByDefault: false },
        update: {},
    });
}

async function setFlag(
    key: string,
    organizationId: string,
    enabled: boolean,
): Promise<void> {
    await flagRow(key);
    await prisma.featureFlagOverride.upsert({
        where: { flagKey_organizationId: { flagKey: key, organizationId } },
        create: { flagKey: key, organizationId, enabled },
        update: { enabled },
    });
}

interface Business {
    owner: OrganizationContext;
    orgId: string;
    contactId: string;
    accountId: string;
}

/**
 * A business with no email provider whose customer Asha has a site
 * account, with Saroh's switch and plan enforcement on for it alone.
 */
async function business(
    opts: { saroh?: boolean; enforce?: boolean; allowance?: boolean } = {},
): Promise<Business> {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: uniq("saroh-mail") },
    });
    await subscribe(
        org.id,
        "free",
        opts.allowance === false ? V_WITHOUT_ROW : V,
    );
    await prisma.businessProfile.create({
        data: {
            organizationId: org.id,
            contactEmail: "hello@rye.example",
            timezone: "Asia/Kolkata",
        },
    });
    const contact = await prisma.contact.create({
        data: {
            organizationId: org.id,
            email: "asha@example.com",
            firstName: "Asha",
        },
    });
    const account = await prisma.customerAccount.create({
        data: {
            organizationId: org.id,
            contactId: contact.id,
            email: "asha@example.com",
            emailVerifiedAt: new Date(),
        },
    });
    await setFlag(FlagKey.SAROH_BUSINESS_EMAIL, org.id, opts.saroh ?? true);
    await setFlag(FlagKey.PLAN_ENFORCEMENT, org.id, opts.enforce ?? true);
    return {
        owner: { organizationId: org.id, userId: staffId, role: "OWNER" },
        orgId: org.id,
        contactId: contact.id,
        accountId: account.id,
    };
}

async function connectEmail(b: Business): Promise<void> {
    await comms.connectProvider(b.owner, {
        channel: "EMAIL",
        provider: "RESEND",
        fromAddress: "hello@rye.example",
        credentials: { apiKey: "re_test_key" },
    });
}

/** A confirmed booking Asha made online, and its `booking.notify` job. */
async function booking(b: Business, serviceName = "Check-up") {
    const service = await prisma.service.create({
        data: {
            organizationId: b.orgId,
            name: serviceName,
            durationMinutes: 30,
            capacity: 1,
            currency: "INR",
            timezone: "Asia/Kolkata",
        },
    });
    const startAt = new Date(Date.now() + 3 * 24 * 3600_000);
    const row = await prisma.booking.create({
        data: {
            organizationId: b.orgId,
            serviceId: service.id,
            contactId: b.contactId,
            startAt,
            endAt: new Date(startAt.getTime() + 30 * 60_000),
            timezone: "Asia/Kolkata",
            status: "CONFIRMED",
            snapshot: {},
            bookerName: "Asha Rao",
            bookerEmail: "asha@example.com",
            customerAccountId: b.accountId,
        },
    });
    const event = await prisma.bookingEvent.create({
        data: {
            bookingId: row.id,
            organizationId: b.orgId,
            type: "BOOKED",
            toStartAt: startAt,
            actorUserId: staffId,
        },
    });
    await prisma.job.create({
        data: {
            organizationId: b.orgId,
            type: "booking.notify",
            payload: {
                bookingId: row.id,
                serviceId: service.id,
                contactId: b.contactId,
                reason: "booked",
                eventId: event.id,
            },
        },
    });
    return row;
}

async function jobsOf(organizationId: string, type: string): Promise<Job[]> {
    return prisma.job.findMany({
        where: { organizationId, type },
        orderBy: { createdAt: "asc" },
    });
}

async function runBookingJobs(organizationId: string): Promise<void> {
    for (const job of await jobsOf(organizationId, "booking.notify")) {
        await bookingNotify.handle(job);
    }
}

/** Run every `message.send`; a thrown send stays for the worker to retry. */
async function sendAll(
    organizationId: string,
    fake = new FakeCommsProvider("EMAIL"),
): Promise<FakeCommsProvider> {
    const handler = new MessageSendHandler(new FakeCommsProviderFactory(fake));
    for (const job of await jobsOf(organizationId, "message.send")) {
        await handler.handle(job).catch(() => undefined);
    }
    return fake;
}

async function messagesOf(organizationId: string) {
    return prisma.message.findMany({
        where: { organizationId },
        include: { deliveries: true },
    });
}

beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue("sent");
    delete mockEnv.SAROH_BUSINESS_EMAIL_STOP;
    delete mockEnv.SAROH_BUSINESS_EMAIL_DAILY_CEILING;
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe("Saroh sends booking emails (DEC-086, real database)", () => {
    it("no provider, every switch on: a SAROH delivery, one job, sent through Saroh and SENT", async () => {
        const b = await business();
        await booking(b);
        await runBookingJobs(b.orgId);

        const [message] = await messagesOf(b.orgId);
        expect(message).toMatchObject({
            status: "QUEUED",
            template: "BOOKING_CONFIRMED",
            toAddress: "asha@example.com",
            subject: "You're booked with Rye & Co.",
        });
        expect(message.body).toContain("Sent for Rye &amp; Co. by Saroh.");
        expect(message.deliveries).toEqual([
            expect.objectContaining({ provider: "SAROH", status: "QUEUED" }),
        ]);
        const jobs = await jobsOf(b.orgId, "message.send");
        expect(jobs).toHaveLength(1);
        expect(jobs[0].maxAttempts).toBe(5);

        const fake = await sendAll(b.orgId);
        expect(fake.calls).toHaveLength(0);
        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0][0]).toMatchObject({
            organizationId: b.orgId,
            businessName: "Rye & Co.",
            contactEmail: "hello@rye.example",
            to: "asha@example.com",
        });
        const [after] = await messagesOf(b.orgId);
        expect(after.status).toBe("SENT");
        expect(after.deliveries[0]).toMatchObject({
            status: "SENT",
            attempts: 1,
        });
    });

    it("its own provider connected: the provider sends, Saroh's sender is never called", async () => {
        const b = await business();
        await connectEmail(b);
        await booking(b);
        await runBookingJobs(b.orgId);
        const fake = await sendAll(b.orgId);
        expect(fake.calls).toHaveLength(1);
        expect(send).not.toHaveBeenCalled();
        const [message] = await messagesOf(b.orgId);
        expect(message.deliveries[0].provider).toBe("RESEND");
        expect(message.body).not.toContain("by Saroh");
    });

    it("a disconnected provider is treated as none", async () => {
        const b = await business();
        await connectEmail(b);
        await comms.disconnectProvider(b.owner, "EMAIL");
        await booking(b);
        await runBookingJobs(b.orgId);
        const [message] = await messagesOf(b.orgId);
        expect(message.deliveries[0].provider).toBe("SAROH");
    });

    it.each([
        ["the business's switch off", { saroh: false }, undefined],
        ["plan enforcement off", { enforce: false }, undefined],
        ["a plan without the allowance", { allowance: false }, undefined],
        ["the global stop on", {}, "stop"],
        ["the daily ceiling reached", {}, "ceiling"],
    ] as const)(
        "%s: no Saroh send, the thread message stands, no Message, the job completes",
        async (_name, opts, env) => {
            await prisma.featureFlag.upsert({
                where: { key: FlagKey.ACCOUNT_THREAD },
                create: { key: FlagKey.ACCOUNT_THREAD, enabledByDefault: true },
                update: { enabledByDefault: true },
            });
            if (env === "stop") mockEnv.SAROH_BUSINESS_EMAIL_STOP = "true";
            const b = await business(opts);
            if (env === "ceiling") {
                mockEnv.SAROH_BUSINESS_EMAIL_DAILY_CEILING = "1";
                // Another business's send today fills the platform's day.
                const other = await business();
                await booking(other);
                await runBookingJobs(other.orgId);
            }
            await booking(b);
            await expect(runBookingJobs(b.orgId)).resolves.toBeUndefined();
            expect(await messagesOf(b.orgId)).toEqual([]);
            expect(
                await prisma.customerThreadMessage.count({
                    where: { organizationId: b.orgId },
                }),
            ).toBe(1);
            await prisma.featureFlag.update({
                where: { key: FlagKey.ACCOUNT_THREAD },
                data: { enabledByDefault: false },
            });
        },
    );

    it("an order's Ready with no provider: as today, nothing emailed", async () => {
        const b = await business();
        const store = await prisma.store.create({
            data: { name: "Rye", slug: uniq("store"), organizationId: b.orgId },
        });
        const order = await prisma.order.create({
            data: {
                storeId: store.id,
                organizationId: b.orgId,
                orderId: uniq("ORD"),
                customerAccountId: b.accountId,
                subtotal: "100.00",
                total: "100.00",
                currency: "INR",
                status: "PROCESSING",
                paymentStatus: "PAID",
                stage: "READY",
                fulfilment: "PICKUP",
            },
        });
        const event = await prisma.orderEvent.create({
            data: {
                orderId: order.id,
                organizationId: b.orgId,
                kind: "STAGE",
                fromStage: "PREPARING",
                toStage: "READY",
            },
        });
        const job = await prisma.job.create({
            data: {
                organizationId: b.orgId,
                type: CUSTOMER_NOTIFY_TYPE,
                payload: {
                    kind: "ORDER_READY",
                    eventKey: `order:${event.id}`,
                    orderId: order.id,
                    orderEventId: event.id,
                },
            },
        });
        await customerNotify.handle(job);
        expect(await messagesOf(b.orgId)).toEqual([]);
    });

    it("a revoked email consent: SUPPRESSED, no delivery", async () => {
        const b = await business();
        await prisma.consent.create({
            data: {
                organizationId: b.orgId,
                contactId: b.contactId,
                channel: "EMAIL",
                status: "REVOKED",
            },
        });
        await booking(b);
        await runBookingJobs(b.orgId);
        const [message] = await messagesOf(b.orgId);
        expect(message.status).toBe("SUPPRESSED");
        expect(message.deliveries).toEqual([]);
        expect(await jobsOf(b.orgId, "message.send")).toEqual([]);
    });

    it("a provider connected after the queue, before the job: sent once, through Saroh", async () => {
        const b = await business();
        await booking(b);
        await runBookingJobs(b.orgId);
        await connectEmail(b);
        const fake = await sendAll(b.orgId);
        expect(send).toHaveBeenCalledTimes(1);
        expect(fake.calls).toHaveLength(0);
    });

    it("the switch turned off after the queue: no SES call, the delivery stopped and never retried", async () => {
        const b = await business();
        await booking(b);
        await runBookingJobs(b.orgId);
        await setFlag(FlagKey.SAROH_BUSINESS_EMAIL, b.orgId, false);
        const handler = new MessageSendHandler(
            new FakeCommsProviderFactory(new FakeCommsProvider("EMAIL")),
        );
        const [job] = await jobsOf(b.orgId, "message.send");
        // It completes: nothing is thrown for the worker to retry.
        await expect(handler.handle(job)).resolves.toBeUndefined();
        expect(send).not.toHaveBeenCalled();
        const [message] = await messagesOf(b.orgId);
        expect(message.status).toBe("FAILED");
        expect(message.deliveries[0].status).toBe("STOPPED");
    });

    it("the same booking event twice: one notice, one email", async () => {
        const b = await business();
        await booking(b);
        await runBookingJobs(b.orgId);
        await runBookingJobs(b.orgId);
        await sendAll(b.orgId);
        await sendAll(b.orgId);
        expect(await messagesOf(b.orgId)).toHaveLength(1);
        expect(send).toHaveBeenCalledTimes(1);
    });

    it("Saroh's send fails: FAILED and thrown for the worker to retry; a later try sends it, counted once", async () => {
        const b = await business();
        await booking(b);
        await runBookingJobs(b.orgId);
        const handler = new MessageSendHandler(
            new FakeCommsProviderFactory(new FakeCommsProvider("EMAIL")),
        );
        const [job] = await jobsOf(b.orgId, "message.send");
        send.mockResolvedValueOnce("failed");
        await expect(handler.handle(job)).rejects.toThrow();
        let [message] = await messagesOf(b.orgId);
        expect(message.deliveries[0]).toMatchObject({
            status: "FAILED",
            attempts: 1,
        });
        await handler.handle(job);
        [message] = await messagesOf(b.orgId);
        expect(message.status).toBe("SENT");
        expect(message.deliveries).toHaveLength(1);
        expect(message.deliveries[0]).toMatchObject({
            status: "SENT",
            attempts: 2,
        });
    });

    it("the booking quick look says the customer is emailed on Saroh's route, and in their account only when it's off", async () => {
        const b = await business();
        expect(await comms.noticeReach(b.owner, b.contactId)).toMatchObject({
            email: true,
            reach: "EMAIL",
        });
        await setFlag(FlagKey.SAROH_BUSINESS_EMAIL, b.orgId, false);
        expect(await comms.noticeReach(b.owner, b.contactId)).toMatchObject({
            email: false,
            reach: "NONE",
        });
    });
});
