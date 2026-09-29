/**
 * Telling customers about their own bookings and orders (round-2 A14)
 * against a real Postgres: an order's Ready held 10 seconds and then written
 * into the customer's thread and emailed through the business's own
 * provider; Undo inside the wait taking it back unsent; no provider → the
 * thread alone; a failed send leaving the thread message and stamping
 * nothing; a booking confirmation stamping the booker's email verified (and
 * a reserved placeholder never); the customer's own cancel telling the
 * team; and every job run twice telling once.
 *
 * Only the app env is stubbed (the credential key, and the account area
 * on); the email provider is the network-free fake. Runs in the
 * integration project.
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
import { cancelFoundBooking } from "../bookings/booking-cancel";
import { BookingNotifyHandler } from "../bookings/booking-notify.handler";
import { CommunicationsService } from "../communications/communications.service";
import { MessageSendHandler } from "../communications/message-send.handler";
import {
    FakeCommsProvider,
    FakeCommsProviderFactory,
} from "../communications/providers/fake.provider";
import { OrderKitchenService } from "../orders/order-kitchen.service";
import { CUSTOMER_NOTIFY_TYPE } from "./customer-notify-queue";
import {
    CustomerNotifyHandler,
    CustomerNotifyService,
} from "./customer-notify.handler";

const comms = new CommunicationsService();
const notices = new CustomerNotifyService(comms);
const customerNotify = new CustomerNotifyHandler(notices);
const bookingNotify = new BookingNotifyHandler(notices);
const kitchen = new OrderKitchenService();

let seq = 0;
// A real team member, for what the team did by hand.
let staffId: string;

beforeAll(async () => {
    staffId = (
        await prisma.user.create({
            data: { email: `a14-staff-${process.pid}@example.com` },
        })
    ).id;
});

interface Business {
    owner: OrganizationContext;
    contactId: string;
    accountId: string;
    storeId: string;
    customerId: string;
}

/** A business whose customer Asha has a site account. */
async function business(
    opts: { email?: boolean; contactEmail?: string; verified?: boolean } = {},
): Promise<Business> {
    seq += 1;
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: `notify-${process.pid}-${seq}` },
    });
    const owner: OrganizationContext = {
        organizationId: org.id,
        userId: staffId,
        role: "OWNER",
    };
    const contact = await prisma.contact.create({
        data: {
            organizationId: org.id,
            email: opts.contactEmail ?? "asha@example.com",
            firstName: "Asha",
            lastName: "Rao",
            ...(opts.verified === false
                ? {}
                : {
                      emailVerifiedAt: new Date(),
                      emailVerifiedVia: "SIGN_IN_CODE" as const,
                  }),
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
    const store = await prisma.store.create({
        data: {
            name: "Rye & Co.",
            slug: `notify-store-${process.pid}-${seq}`,
            organizationId: org.id,
        },
    });
    const customer = await prisma.customer.create({
        data: {
            storeId: store.id,
            organizationId: org.id,
            email: "asha@example.com",
            firstName: "Asha",
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
    return {
        owner,
        contactId: contact.id,
        accountId: account.id,
        storeId: store.id,
        customerId: customer.id,
    };
}

async function threadOn(): Promise<void> {
    await prisma.featureFlag.deleteMany({ where: { key: "ACCOUNT_THREAD" } });
    await prisma.featureFlag.create({
        data: { key: "ACCOUNT_THREAD", enabledByDefault: true },
    });
}

afterEach(() =>
    prisma.featureFlag.deleteMany({ where: { key: "ACCOUNT_THREAD" } }),
);

/** A paid pick-up order the account placed, being prepared. */
async function preparingOrder(b: Business, placedOnline = true) {
    seq += 1;
    return prisma.order.create({
        data: {
            storeId: b.storeId,
            organizationId: b.owner.organizationId,
            orderId: `ORD-${1000 + seq}`,
            customerId: b.customerId,
            customerAccountId: b.accountId,
            subtotal: "100.00",
            total: "100.00",
            currency: "INR",
            status: "PROCESSING",
            paymentStatus: "PAID",
            stage: "PREPARING",
            fulfilment: "PICKUP",
            placedOnline,
        },
    });
}

async function jobsOf(organizationId: string, type: string): Promise<Job[]> {
    return prisma.job.findMany({
        where: { organizationId, type },
        orderBy: { createdAt: "asc" },
    });
}

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

async function threadMessages(organizationId: string) {
    return prisma.customerThreadMessage.findMany({
        where: { organizationId },
        orderBy: { createdAt: "asc" },
    });
}

describe("an order's Ready (real database)", () => {
    it("waits 10 seconds, then lands in their thread and is emailed through the business's provider", async () => {
        await threadOn();
        const b = await business();
        const order = await preparingOrder(b);
        const before = Date.now();
        const ready = await kitchen.moveStage(b.owner, order.id, {
            to: "READY",
        });

        const [job] = await jobsOf(
            b.owner.organizationId,
            CUSTOMER_NOTIFY_TYPE,
        );
        expect(job.payload).toMatchObject({
            kind: "ORDER_READY",
            eventKey: `order:${ready.eventId}`,
        });
        expect(job.runAt.getTime() - before).toBeGreaterThanOrEqual(9_000);

        await customerNotify.handle(job);

        const [post] = await threadMessages(b.owner.organizationId);
        expect(post).toMatchObject({
            author: "SYSTEM",
            event: "ORDER_READY",
            body: `Your order ${order.orderId} is ready to collect.`,
        });
        const [message] = await prisma.message.findMany({
            where: { organizationId: b.owner.organizationId },
        });
        expect(message).toMatchObject({
            template: "ORDER_READY",
            toAddress: "asha@example.com",
            contactId: b.contactId,
            status: "QUEUED",
            createdByUserId: null,
        });

        const fake = await sendAll(b.owner.organizationId);
        expect(fake.calls).toHaveLength(1);
        expect(fake.calls[0]).toMatchObject({
            to: "asha@example.com",
            from: "hello@rye.example",
        });
        expect(
            (
                await prisma.message.findUniqueOrThrow({
                    where: { id: message.id },
                })
            ).status,
        ).toBe("SENT");
    });

    it("tells once, however often the job runs", async () => {
        await threadOn();
        const b = await business();
        const order = await preparingOrder(b);
        await kitchen.moveStage(b.owner, order.id, { to: "READY" });
        const [job] = await jobsOf(
            b.owner.organizationId,
            CUSTOMER_NOTIFY_TYPE,
        );
        await customerNotify.handle(job);
        await customerNotify.handle(job);
        expect(await threadMessages(b.owner.organizationId)).toHaveLength(1);
        expect(
            await prisma.message.count({
                where: { organizationId: b.owner.organizationId },
            }),
        ).toBe(1);
    });

    it("Undo inside the wait: nothing is written or sent, and nobody was told", async () => {
        await threadOn();
        const b = await business();
        const order = await preparingOrder(b);
        const ready = await kitchen.moveStage(b.owner, order.id, {
            to: "READY",
        });
        const back = await kitchen.undoStage(b.owner, order.id, ready.eventId);
        expect(back.told).toBe(false);
        expect(
            await jobsOf(b.owner.organizationId, CUSTOMER_NOTIFY_TYPE),
        ).toHaveLength(0);
        expect(await threadMessages(b.owner.organizationId)).toHaveLength(0);
        expect(
            await prisma.message.count({
                where: { organizationId: b.owner.organizationId },
            }),
        ).toBe(0);
    });

    it("Undo after it went says they've already been told", async () => {
        await threadOn();
        const b = await business();
        const order = await preparingOrder(b);
        const ready = await kitchen.moveStage(b.owner, order.id, {
            to: "READY",
        });
        const [job] = await jobsOf(
            b.owner.organizationId,
            CUSTOMER_NOTIFY_TYPE,
        );
        await customerNotify.handle(job);
        await prisma.job.update({
            where: { id: job.id },
            data: { status: "DONE" },
        });
        const back = await kitchen.undoStage(b.owner, order.id, ready.eventId);
        expect(back.told).toBe(true);
    });

    it("no email provider: the thread message only, and Order Detail says it shows in their account", async () => {
        await threadOn();
        const b = await business({ email: false });
        const order = await preparingOrder(b);
        await kitchen.moveStage(b.owner, order.id, { to: "READY" });
        const [job] = await jobsOf(
            b.owner.organizationId,
            CUSTOMER_NOTIFY_TYPE,
        );
        await customerNotify.handle(job);
        expect(await threadMessages(b.owner.organizationId)).toHaveLength(1);
        expect(
            await prisma.message.count({
                where: { organizationId: b.owner.organizationId },
            }),
        ).toBe(0);
        const read = await kitchen.read(b.owner, order.id);
        expect(read.customerNotice).toBe("ACCOUNT");
    });

    it("the thread off (the default): email alone, and Order Detail says so", async () => {
        const b = await business();
        const order = await preparingOrder(b);
        await kitchen.moveStage(b.owner, order.id, { to: "READY" });
        const [job] = await jobsOf(
            b.owner.organizationId,
            CUSTOMER_NOTIFY_TYPE,
        );
        await customerNotify.handle(job);
        expect(await threadMessages(b.owner.organizationId)).toHaveLength(0);
        expect(
            await prisma.message.count({
                where: { organizationId: b.owner.organizationId },
            }),
        ).toBe(1);
        expect((await kitchen.read(b.owner, order.id)).customerNotice).toBe(
            "EMAIL",
        );
    });

    it("a failed send: the Delivery is FAILED and retried, the thread message stays, nothing is stamped", async () => {
        await threadOn();
        const b = await business({ verified: false });
        const order = await preparingOrder(b);
        await kitchen.moveStage(b.owner, order.id, { to: "READY" });
        const [job] = await jobsOf(
            b.owner.organizationId,
            CUSTOMER_NOTIFY_TYPE,
        );
        await customerNotify.handle(job);

        const [send] = await jobsOf(b.owner.organizationId, "message.send");
        const failing = new FakeCommsProvider(
            "EMAIL",
            new Error("Email send failed (HTTP 500)"),
        );
        await expect(
            new MessageSendHandler(
                new FakeCommsProviderFactory(failing),
            ).handle(send),
        ).rejects.toThrow("HTTP 500");

        const [delivery] = await prisma.delivery.findMany({
            where: { organizationId: b.owner.organizationId },
        });
        expect(delivery.status).toBe("FAILED");
        expect(await threadMessages(b.owner.organizationId)).toHaveLength(1);
        const contact = await prisma.contact.findUniqueOrThrow({
            where: { id: b.contactId },
        });
        expect(contact.emailVerifiedAt).toBeNull();

        // The retry goes, and only then does the order prove the address.
        await new MessageSendHandler(
            new FakeCommsProviderFactory(new FakeCommsProvider("EMAIL")),
        ).handle(send);
        const after = await prisma.contact.findUniqueOrThrow({
            where: { id: b.contactId },
        });
        expect(after.emailVerifiedVia).toBe("ORDER_CONFIRMATION");
    });
});

describe("a booking (real database)", () => {
    async function booking(b: Business, over: { actorUserId?: string } = {}) {
        const service = await prisma.service.create({
            data: {
                organizationId: b.owner.organizationId,
                name: "Check-up",
                durationMinutes: 30,
                capacity: 1,
                currency: "INR",
                timezone: "Asia/Kolkata",
            },
        });
        const startAt = new Date(Date.now() + 3 * 24 * 3600_000);
        const row = await prisma.booking.create({
            data: {
                organizationId: b.owner.organizationId,
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
                organizationId: b.owner.organizationId,
                type: "BOOKED",
                toStartAt: startAt,
                ...(over.actorUserId ? { actorUserId: over.actorUserId } : {}),
            },
        });
        await prisma.job.create({
            data: {
                organizationId: b.owner.organizationId,
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

    async function runBookingJobs(organizationId: string): Promise<void> {
        for (const job of await jobsOf(organizationId, "booking.notify")) {
            await bookingNotify.handle(job);
        }
    }

    it("a confirmation sent to the email they booked online with stamps that contact verified", async () => {
        const b = await business({ verified: false });
        await booking(b);
        await runBookingJobs(b.owner.organizationId);
        await sendAll(b.owner.organizationId);

        const contact = await prisma.contact.findUniqueOrThrow({
            where: { id: b.contactId },
        });
        expect(contact.emailVerifiedVia).toBe("BOOKING_CONFIRMATION");
        expect(contact.emailVerifiedAt).not.toBeNull();
    });

    it("a booking the team made by hand is confirmed, but proves nothing", async () => {
        const b = await business({ verified: false });
        await booking(b, { actorUserId: staffId });
        await runBookingJobs(b.owner.organizationId);
        const fake = await sendAll(b.owner.organizationId);
        expect(fake.calls).toHaveLength(1);
        const contact = await prisma.contact.findUniqueOrThrow({
            where: { id: b.contactId },
        });
        expect(contact.emailVerifiedAt).toBeNull();
    });

    it("an account on a separate contact (a reserved placeholder) is emailed at its account address, and the placeholder is never stamped", async () => {
        const b = await business({
            verified: false,
            contactEmail: "account+sep@account.invalid",
        });
        await booking(b);
        await runBookingJobs(b.owner.organizationId);
        const fake = await sendAll(b.owner.organizationId);
        expect(fake.calls.map((c) => c.to)).toEqual(["asha@example.com"]);
        const contact = await prisma.contact.findUniqueOrThrow({
            where: { id: b.contactId },
        });
        expect(contact.emailVerifiedAt).toBeNull();
    });

    it("the customer's own cancel tells the team, once, and the customer", async () => {
        await threadOn();
        const b = await business();
        const row = await booking(b);
        await runBookingJobs(b.owner.organizationId);
        await prisma.job.deleteMany({
            where: { organizationId: b.owner.organizationId },
        });

        const done = await cancelFoundBooking(
            row,
            {
                organizationId: b.owner.organizationId,
                userId: null,
                mayRefundByHand: false,
            },
            new Date(),
            {},
            () => Promise.resolve("SENT"),
        );
        expect(done.told).toBe(true);
        await runBookingJobs(b.owner.organizationId);
        await runBookingJobs(b.owner.organizationId);

        // The online booking itself is a "New booking" notice since F14's
        // team alerts; the cancel adds exactly one of its own.
        const inbox = await prisma.notification.findMany({
            where: {
                organizationId: b.owner.organizationId,
                type: "booking.cancelled",
            },
        });
        expect(inbox).toHaveLength(1);
        expect(inbox[0]).toMatchObject({
            type: "booking.cancelled",
            title: "Asha Rao cancelled their Check-up",
        });
        const posts = await threadMessages(b.owner.organizationId);
        expect(posts.map((p) => p.event)).toEqual([
            "BOOKING_CONFIRMED",
            "BOOKING_CANCELLED",
        ]);
        expect(posts[1].body).toMatch(/^You cancelled your Check-up on /);
    });

    it("the team's cancel tells the customer, not the team", async () => {
        const b = await business();
        const row = await booking(b, { actorUserId: staffId });
        await prisma.job.deleteMany({
            where: { organizationId: b.owner.organizationId },
        });
        await cancelFoundBooking(
            row,
            {
                organizationId: b.owner.organizationId,
                userId: staffId,
                mayRefundByHand: true,
            },
            new Date(),
            {},
            () => Promise.resolve("SENT"),
        );
        await runBookingJobs(b.owner.organizationId);
        expect(
            await prisma.notification.count({
                where: { organizationId: b.owner.organizationId },
            }),
        ).toBe(0);
        const [message] = await prisma.message.findMany({
            where: { organizationId: b.owner.organizationId },
        });
        expect(message.template).toBe("BOOKING_CANCELLED");
    });
});
