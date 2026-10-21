/**
 * Delivery updates (DEC-174 U16, #1147) against a real Postgres: a shipment
 * moved to Delivered held ten seconds and then emailed through the
 * business's own provider; Undo inside the wait sending nothing; a digital
 * order's Sent emailed, Collected never; tracking added after the handover
 * told once, the same tracking saved again not, a change told again; the
 * ORDER_DELIVERY switch stopping all three; "Order placed" promising an
 * email only when one will go; and Order Detail's read saying where it is
 * emailed and whether delivery updates go.
 *
 * Only the app env is stubbed (the credential key); the email provider is
 * the network-free fake. Runs in the integration project.
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import type { Job, OrderFulfilment, OrderStage } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { CommunicationsService } from "../communications/communications.service";
import { MessageSendHandler } from "../communications/message-send.handler";
import {
    FakeCommsProvider,
    FakeCommsProviderFactory,
} from "../communications/providers/fake.provider";
import {
    CUSTOMER_NOTIFY_TYPE,
    enqueueOrderPlacedNotice,
} from "../site-accounts/customer-notify-queue";
import {
    CustomerNotifyHandler,
    CustomerNotifyService,
} from "../site-accounts/customer-notify.handler";
import { OrderKitchenService } from "./order-kitchen.service";

const comms = new CommunicationsService();
const customerNotify = new CustomerNotifyHandler(
    new CustomerNotifyService(comms),
);
const kitchen = new OrderKitchenService();

let seq = 0;
let staffId: string;

beforeAll(async () => {
    staffId = (
        await prisma.user.create({
            data: { email: `u16-staff-${process.pid}@example.com` },
        })
    ).id;
});

interface Business {
    owner: OrganizationContext;
    contactId: string;
    storeId: string;
    customerId: string;
}

/**
 * A business with a desk customer Asha (no site account), linked to her
 * contact, and its own email provider unless `email: false`.
 */
async function business(opts: { email?: boolean } = {}): Promise<Business> {
    seq += 1;
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: `u16-${process.pid}-${seq}` },
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
        },
    });
    const store = await prisma.store.create({
        data: {
            name: "Rye & Co.",
            slug: `u16-store-${process.pid}-${seq}`,
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
    await prisma.customerIdentityLink.create({
        data: {
            organizationId: org.id,
            customerId: customer.id,
            contactId: contact.id,
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
        storeId: store.id,
        customerId: customer.id,
    };
}

/** A paid order standing at `stage`, with nothing on its lines. */
async function orderAt(
    b: Business,
    fulfilment: OrderFulfilment,
    stage: OrderStage,
    status: "PENDING" | "PROCESSING" | "SHIPPED",
    over: { placedOnline?: boolean; payOnHandover?: boolean } = {},
) {
    seq += 1;
    return prisma.order.create({
        data: {
            storeId: b.storeId,
            organizationId: b.owner.organizationId,
            orderId: `ORD-${2000 + seq}`,
            customerId: b.customerId,
            subtotal: "100.00",
            total: "100.00",
            currency: "INR",
            status,
            paymentStatus: "PAID",
            stage,
            fulfilment,
            ...(fulfilment === "SHIPPING" || fulfilment === "LOCAL_DELIVERY"
                ? {
                      deliveryLine1: "12 Church Street",
                      deliveryCity: "Bengaluru",
                      deliveryState: "Karnataka",
                      deliveryPostalCode: "560001",
                  }
                : {}),
            ...over,
        },
    });
}

async function notifyJobs(organizationId: string): Promise<Job[]> {
    return prisma.job.findMany({
        where: { organizationId, type: CUSTOMER_NOTIFY_TYPE },
        orderBy: { createdAt: "asc" },
    });
}

/** Run every notice still waiting, as the job runner would, and mark it done. */
async function runNotices(organizationId: string): Promise<void> {
    for (const job of await notifyJobs(organizationId)) {
        if (job.status !== "PENDING") continue;
        await customerNotify.handle(job);
        await prisma.job.update({
            where: { id: job.id },
            data: { status: "DONE" },
        });
    }
}

async function messages(organizationId: string) {
    return prisma.message.findMany({
        where: { organizationId },
        orderBy: { createdAt: "asc" },
    });
}

async function deliveryUpdatesOff(organizationId: string): Promise<void> {
    await prisma.customerNoticeSetting.create({
        data: { organizationId, kind: "ORDER_DELIVERY", enabled: false },
    });
}

describe("Delivered and Sent (real database, U16)", () => {
    it("a shipment moved to Delivered is held 10 seconds, then emailed through the business's provider", async () => {
        const b = await business();
        const order = await orderAt(
            b,
            "SHIPPING",
            "HANDED_TO_COURIER",
            "SHIPPED",
        );
        const before = Date.now();
        const done = await kitchen.moveStage(b.owner, order.id, {
            to: "DELIVERED",
        });
        const [job] = await notifyJobs(b.owner.organizationId);
        expect(job.payload).toMatchObject({
            kind: "ORDER_DELIVERED",
            eventKey: `order:${done.eventId}`,
        });
        expect(job.runAt.getTime() - before).toBeGreaterThanOrEqual(9_000);

        await customerNotify.handle(job);
        const [message] = await messages(b.owner.organizationId);
        expect(message).toMatchObject({
            template: "ORDER_DELIVERED",
            toAddress: "asha@example.com",
            contactId: b.contactId,
        });
        const fake = new FakeCommsProvider("EMAIL");
        const send = new MessageSendHandler(new FakeCommsProviderFactory(fake));
        for (const j of await prisma.job.findMany({
            where: {
                organizationId: b.owner.organizationId,
                type: "message.send",
            },
        })) {
            await send.handle(j);
        }
        expect(fake.calls).toHaveLength(1);
        expect(fake.calls[0]).toMatchObject({
            to: "asha@example.com",
            from: "hello@rye.example",
        });
    });

    it("Undo inside the 10 seconds sends nothing", async () => {
        const b = await business();
        const order = await orderAt(
            b,
            "LOCAL_DELIVERY",
            "OUT_FOR_DELIVERY",
            "SHIPPED",
        );
        const done = await kitchen.moveStage(b.owner, order.id, {
            to: "DELIVERED",
        });
        const back = await kitchen.undoStage(b.owner, order.id, done.eventId);
        expect(back.told).toBe(false);
        expect(await notifyJobs(b.owner.organizationId)).toHaveLength(0);
        expect(await messages(b.owner.organizationId)).toHaveLength(0);
    });

    it("a digital order marked Sent is emailed; a collected one isn't", async () => {
        const b = await business();
        const digital = await orderAt(b, "DIGITAL", "NEW", "PENDING");
        await kitchen.moveStage(b.owner, digital.id, { to: "SENT" });
        const pickup = await orderAt(b, "PICKUP", "READY", "PROCESSING");
        await kitchen.moveStage(b.owner, pickup.id, { to: "COLLECTED" });

        const jobs = await notifyJobs(b.owner.organizationId);
        expect(jobs.map((j) => (j.payload as { kind: string }).kind)).toEqual([
            "ORDER_SENT",
        ]);
        await runNotices(b.owner.organizationId);
        const [message] = await messages(b.owner.organizationId);
        expect(message).toMatchObject({
            template: "ORDER_SENT",
            subject: `Your order ${digital.orderId} from Rye & Co. has been sent`,
        });
    });

    it("with delivery updates off, Delivered queues nothing, and one already held is not sent", async () => {
        const b = await business();
        const held = await orderAt(
            b,
            "SHIPPING",
            "HANDED_TO_COURIER",
            "SHIPPED",
        );
        await kitchen.moveStage(b.owner, held.id, { to: "DELIVERED" });
        await deliveryUpdatesOff(b.owner.organizationId);
        const later = await orderAt(
            b,
            "SHIPPING",
            "HANDED_TO_COURIER",
            "SHIPPED",
        );
        await kitchen.moveStage(b.owner, later.id, { to: "DELIVERED" });
        expect(await notifyJobs(b.owner.organizationId)).toHaveLength(1);
        await runNotices(b.owner.organizationId);
        expect(await messages(b.owner.organizationId)).toHaveLength(0);
    });
});

describe("tracking added after the handover (real database, U16)", () => {
    it("is emailed once; the same tracking saved again isn't; a change is told again", async () => {
        const b = await business();
        const order = await orderAt(
            b,
            "SHIPPING",
            "HANDED_TO_COURIER",
            "SHIPPED",
        );
        const added = await kitchen.edit(b.owner, order.id, {
            courierName: "Delhivery",
            trackingNumber: "AWB 4411",
            trackingUrl: "https://track.example.com/AWB4411",
        });
        expect(added.trackingNotice).toBe(true);
        const again = await kitchen.edit(b.owner, order.id, {
            trackingNumber: "AWB 4411",
        });
        expect(again.trackingNotice).toBe(false);

        await runNotices(b.owner.organizationId);
        const [message] = await messages(b.owner.organizationId);
        expect(message).toMatchObject({
            template: "ORDER_TRACKING",
            toAddress: "asha@example.com",
            subject: `Track your order ${order.orderId} from Rye & Co.`,
        });
        expect(message.body).toContain("https://track.example.com/AWB4411");
        expect(message.body).toContain("Tracking number: AWB 4411.");

        const changed = await kitchen.edit(b.owner, order.id, {
            trackingNumber: "AWB 5522",
        });
        expect(changed.trackingNotice).toBe(true);
        expect(await notifyJobs(b.owner.organizationId)).toHaveLength(2);
        await runNotices(b.owner.organizationId);
        expect(await messages(b.owner.organizationId)).toHaveLength(2);
        // Every job run again still tells once per change.
        for (const job of await notifyJobs(b.owner.organizationId)) {
            await customerNotify.handle(job);
        }
        expect(await messages(b.owner.organizationId)).toHaveLength(2);
    });

    it("rides on the handover's own notice while it is held, and is not queued with delivery updates off", async () => {
        const b = await business();
        const order = await orderAt(b, "SHIPPING", "READY", "PROCESSING");
        await kitchen.moveStage(b.owner, order.id, {
            to: "HANDED_TO_COURIER",
            courierName: "Delhivery",
        });
        const quick = await kitchen.edit(b.owner, order.id, {
            trackingNumber: "AWB 4411",
        });
        // Told, by the handover's own email.
        expect(quick.trackingNotice).toBe(true);
        expect(await notifyJobs(b.owner.organizationId)).toHaveLength(1);
        // The handover's email reads the order when it goes: it carries it.
        await runNotices(b.owner.organizationId);
        const [handover] = await messages(b.owner.organizationId);
        expect(handover.template).toBe("ORDER_HANDED_OVER");
        expect(handover.body).toContain("AWB 4411");

        await deliveryUpdatesOff(b.owner.organizationId);
        const off = await kitchen.edit(b.owner, order.id, {
            trackingNumber: "AWB 5522",
        });
        expect(off.trackingNotice).toBe(false);
    });
});

describe("what the merchant and the customer are told (real database, U16)", () => {
    it("Order Detail's read names the address and whether delivery updates go", async () => {
        const b = await business();
        const order = await orderAt(
            b,
            "SHIPPING",
            "HANDED_TO_COURIER",
            "SHIPPED",
        );
        expect(await kitchen.read(b.owner, order.id)).toMatchObject({
            customerNotice: "EMAIL",
            customerNoticeTo: "asha@example.com",
            deliveryUpdates: true,
        });
        await deliveryUpdatesOff(b.owner.organizationId);
        expect((await kitchen.read(b.owner, order.id)).deliveryUpdates).toBe(
            false,
        );

        const quiet = await business({ email: false });
        const theirs = await orderAt(
            quiet,
            "SHIPPING",
            "HANDED_TO_COURIER",
            "SHIPPED",
        );
        expect(await kitchen.read(quiet.owner, theirs.id)).toMatchObject({
            customerNotice: "NONE",
            customerNoticeTo: null,
        });
    });

    it("Order placed promises an email only when one will go", async () => {
        const b = await business();
        const order = await orderAt(b, "SHIPPING", "NEW", "PENDING", {
            placedOnline: true,
            payOnHandover: true,
        });
        await prisma.$transaction((tx) =>
            enqueueOrderPlacedNotice(tx, b.owner.organizationId, order.id),
        );
        await runNotices(b.owner.organizationId);
        const [message] = await messages(b.owner.organizationId);
        expect(message.template).toBe("ORDER_PLACED");
        expect(message.body).toContain(
            "We&#39;ll email you when it&#39;s on its way, and when it&#39;s delivered.",
        );
    });
});
