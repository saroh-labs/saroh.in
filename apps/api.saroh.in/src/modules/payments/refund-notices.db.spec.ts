/**
 * Refunds told (DEC-174 U12, #1143), against a real Postgres: from the
 * refund call or the refund webhook, through the `customer.notify` and
 * `team.alert` jobs, to the business's own email and the team's bell.
 *
 * - An order cancelled with an online refund: the customer is emailed
 *   "₹480 for your order … is on its way back to how you paid", through the
 *   business's own provider, once, however the provider's answer arrives.
 * - A cash refund recorded at the counter tells the customer nothing.
 * - The REFUND switch off: nothing is queued; the order's history is the
 *   same.
 * - A refund that fails at the provider later: `refund.failed` on the bell,
 *   once, even when the webhook is delivered again; the customer is not
 *   told again.
 * - A part-refused refund: the part sent is told to the customer, the part
 *   refused to the team, not to whoever asked for it.
 *
 * The payment and email providers and the webhook verifier are the
 * network-free fakes; Saroh's alert email is recorded, not sent. Runs in
 * the integration project, plain and under `TEST_RLS=on`.
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
        APP_URL: "https://app.saroh.localhost",
    },
}));
jest.mock("../../common/email", () => ({
    ...jest.requireActual("../../common/email"),
    sendTeamAlertEmail: jest.fn().mockResolvedValue(undefined),
}));

import { Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";
import { createHmac } from "node:crypto";

import { giveBusinessDetails } from "../../../test/business-details";
import { sendTeamAlertEmail } from "../../common/email";
import type { OrganizationContext } from "../../common/types/organization-context";
import { CommunicationsService } from "../communications/communications.service";
import { MessageSendHandler } from "../communications/message-send.handler";
import {
    FakeCommsProvider,
    FakeCommsProviderFactory,
} from "../communications/providers/fake.provider";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { TeamAlertHandler } from "../notifications/team-alert.handler";
import { TEAM_ALERT_TYPE } from "../notifications/team-alerts";
import { OrderCancelService } from "../orders/order-cancel.service";
import { OrdersService } from "../orders/orders.service";
import { CUSTOMER_NOTIFY_TYPE } from "../site-accounts/customer-notify-queue";
import {
    CustomerNotifyHandler,
    CustomerNotifyService,
} from "../site-accounts/customer-notify.handler";
import { count } from "../stock/stock.service";
import { StoresService } from "../stores/stores.service";
import {
    FakeWebhookProvider,
    FakeWebhookProviderFactory,
} from "../webhooks/providers/fake.webhook";
import { WebhooksService } from "../webhooks/webhooks.service";
import { PaymentsService } from "./payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "./providers/fake.provider";

const WEBHOOK_SECRET = "whsec_u12_refunds"; // gitleaks:allow (made-up test secret)
const tag = `${process.pid}-${Date.now()}`;

const flags = {
    isEnabled: () => Promise.resolve(true),
} as unknown as FeatureFlagService;
const orders = new OrdersService(new StoresService(flags));
const fake = new FakeMerchantProvider("RAZORPAY");
const payments = new PaymentsService(new FakeProviderFactory(fake));
const cancels = new OrderCancelService(payments);
const webhooks = new WebhooksService(
    new FakeWebhookProviderFactory(new FakeWebhookProvider("RAZORPAY")),
    payments,
);
const comms = new CommunicationsService();
const customerNotify = new CustomerNotifyHandler(
    new CustomerNotifyService(comms),
);
const teamAlerts = new TeamAlertHandler();
const alertMail = sendTeamAlertEmail as jest.Mock;

let orgId = "";
let ownerId = "";
let adminId = "";
let owner: OrganizationContext;
let storeId = "";
let customerId = "";
let loaf = "";
let eventSeq = 0;
let orderSeq = 0;
let keySeq = 0;
const key = () => `u12-key-${(keySeq += 1)}`;
const ran = new Set<string>();

beforeAll(async () => {
    ownerId = (
        await prisma.user.create({
            data: { email: `u12-owner-${tag}@example.com` },
        })
    ).id;
    adminId = (
        await prisma.user.create({
            data: { email: `u12-admin-${tag}@example.com` },
        })
    ).id;
    orgId = (
        await prisma.organization.create({
            data: { name: "Rye & Co.", slug: `u12-rye-${tag}` },
        })
    ).id;
    await prisma.membership.createMany({
        data: [
            { organizationId: orgId, userId: ownerId, role: "OWNER" },
            { organizationId: orgId, userId: adminId, role: "ADMIN" },
        ],
    });
    owner = { organizationId: orgId, userId: ownerId, role: "OWNER" };
    await prisma.businessProfile.create({
        data: { organizationId: orgId, invoicePrefix: "U12", timezone: "UTC" },
    });
    await giveBusinessDetails(orgId);
    storeId = (
        await prisma.store.create({
            data: {
                name: "Hill Road",
                slug: `u12-hill-${tag}`,
                organizationId: orgId,
            },
        })
    ).id;
    await prisma.storeSettings.create({
        data: {
            storeId,
            currency: "INR",
            collectionEnabled: true,
            fulfilmentTypes: ["PICKUP"],
        },
    });
    customerId = (
        await prisma.customer.create({
            data: {
                storeId,
                organizationId: orgId,
                email: `u12-buyer-${tag}@example.com`,
                firstName: "Asha",
            },
        })
    ).id;
    // The customer's contact, whose own email the notice goes to.
    const contact = await prisma.contact.create({
        data: {
            organizationId: orgId,
            email: `u12-buyer-${tag}@example.com`,
            firstName: "Asha",
        },
    });
    await prisma.customerIdentityLink.create({
        data: { organizationId: orgId, contactId: contact.id, customerId },
    });
    loaf = (
        await prisma.product.create({
            data: {
                storeId,
                organizationId: orgId,
                name: "Seeded loaf",
                slug: `u12-loaf-${tag}`,
                price: "240.00",
                currency: "INR",
                fulfilmentTypes: [],
            },
        })
    ).id;
    await prisma.productListing.create({
        data: { storeId, organizationId: orgId, productId: loaf },
    });
    await prisma.$transaction((tx) =>
        count(
            tx,
            { organizationId: orgId, userId: ownerId },
            { target: { storeId, productId: loaf }, counted: 100 },
        ),
    );
    await payments.connectProvider(owner, {
        provider: "RAZORPAY",
        publicKey: "rzp_test_U12",
        keyId: "rzp_test_U12",
        keySecret: "rzp_secret",
        webhookSecret: WEBHOOK_SECRET,
    });
    // The business's own email: the only way a customer notice is emailed.
    await comms.connectProvider(owner, {
        channel: "EMAIL",
        provider: "RESEND",
        fromAddress: "hello@rye.example",
        credentials: { apiKey: "re_test_key" },
    });
});

beforeEach(() => {
    alertMail.mockClear();
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
});

afterEach(async () => {
    jest.restoreAllMocks();
    await prisma.customerNoticeSetting.deleteMany({
        where: { organizationId: orgId },
    });
});

function webhook(event: Record<string, unknown>) {
    eventSeq += 1;
    const raw = Buffer.from(
        JSON.stringify({ providerEventId: `evt_u12_${eventSeq}`, ...event }),
    );
    return webhooks.handle("razorpay", orgId, raw, {
        "x-fake-signature": createHmac("sha256", WEBHOOK_SECRET)
            .update(raw)
            .digest("hex"),
    });
}

/** Two loaves, ₹480, made at the counter and paid online. */
async function paidOrder(): Promise<{ id: string; number: string }> {
    orderSeq += 1;
    const made = await orders.create(storeId, ownerId, {
        customerId,
        items: [{ productId: loaf, quantity: 2 }],
        fulfilment: "PICKUP",
    });
    const intentId = `prov_u12_${orderSeq}_${tag}`;
    await prisma.paymentIntent.create({
        data: {
            organizationId: orgId,
            orderId: made.id,
            provider: "RAZORPAY",
            providerIntentId: intentId,
            amountCents: 48000,
            currency: "INR",
            status: "REQUIRES_PAYMENT",
        },
    });
    await webhook({
        eventType: "payment.captured",
        outcome: "SUCCEEDED",
        providerIntentId: intentId,
        providerPaymentRef: `pay_u12_${orderSeq}_${tag}`,
    });
    const row = await prisma.order.findUniqueOrThrow({
        where: { id: made.id },
        select: { orderId: true, paymentStatus: true },
    });
    expect(row.paymentStatus).toBe("PAID");
    return { id: made.id, number: row.orderId };
}

/** The jobs of a type about one refund. */
async function jobsAbout(type: string, refundId: string) {
    const jobs = await prisma.job.findMany({
        where: { organizationId: orgId, type },
        orderBy: { createdAt: "asc" },
    });
    return jobs.filter(
        (j) => (j.payload as { refundId?: string }).refundId === refundId,
    );
}

/** Run every queued job of these kinds not run yet, as the worker would. */
async function runJobs(): Promise<FakeCommsProvider> {
    const jobs = await prisma.job.findMany({
        where: {
            organizationId: orgId,
            type: { in: [CUSTOMER_NOTIFY_TYPE, TEAM_ALERT_TYPE] },
        },
        orderBy: { createdAt: "asc" },
    });
    for (const job of jobs) {
        if (ran.has(job.id)) continue;
        ran.add(job.id);
        if (job.type === CUSTOMER_NOTIFY_TYPE) {
            await customerNotify.handle(job as Job);
        } else {
            await teamAlerts.handle(job as Job);
        }
    }
    const mail = new FakeCommsProvider("EMAIL");
    const send = new MessageSendHandler(new FakeCommsProviderFactory(mail));
    for (const job of await prisma.job.findMany({
        where: { organizationId: orgId, type: "message.send" },
    })) {
        if (ran.has(job.id)) continue;
        ran.add(job.id);
        await send.handle(job as Job).catch(() => undefined);
    }
    return mail;
}

/** Who Saroh emailed a refund alert to. */
const refundMails = () =>
    (alertMail.mock.calls as [string, { heading: string }][])
        .filter(([, mail]) => mail.heading.startsWith("Refund"))
        .map(([to]) => to);

const refundEmails = () =>
    prisma.message.findMany({
        where: { organizationId: orgId, template: "REFUND_SENT" },
        select: { toAddress: true, subject: true, body: true },
        orderBy: { createdAt: "asc" },
    });

const refundsOf = (orderId: string) =>
    prisma.paymentRefund.findMany({
        where: { paymentIntent: { orderId } },
        select: {
            id: true,
            status: true,
            amountCents: true,
            providerRefundId: true,
        },
        orderBy: { createdAt: "asc" },
    });

describe("refunds told (U12, real database)", () => {
    it("an order cancelled with an online refund: the customer is emailed through the business's own provider, once", async () => {
        const order = await paidOrder();
        const before = (await refundEmails()).length;
        const out = await cancels.cancel(owner, order.id, {
            reason: "Customer changed their mind",
            idempotencyKey: key(),
        });
        expect(out).toMatchObject({ cancelled: true });
        const [refund] = await refundsOf(order.id);
        expect(await jobsAbout(CUSTOMER_NOTIFY_TYPE, refund.id)).toHaveLength(
            1,
        );

        // The provider confirms it, twice: the webhook's settle keys the
        // same notice, so the customer is still told once.
        for (let i = 0; i < 2; i += 1) {
            await webhook({
                eventType: "refund.processed",
                outcome: "REFUNDED",
                providerIntentId: `prov_u12_${orderSeq}_${tag}`,
                providerRefundId: refund.providerRefundId,
                refundReference: refund.id,
                refundAmountCents: 48000,
            });
        }
        await runJobs();
        const emails = (await refundEmails()).slice(before);
        expect(emails).toHaveLength(1);
        expect(emails[0].toAddress).toBe(`u12-buyer-${tag}@example.com`);
        expect(emails[0].subject).toBe("Your refund from Rye & Co.");
        expect(emails[0].body).toContain(
            `₹480 for your order ${order.number} is on its way back to how you paid. It usually takes 5–7 working days.`,
        );
        // The team hears nothing: money went back.
        expect(await jobsAbout(TEAM_ALERT_TYPE, refund.id)).toHaveLength(0);
    });

    it("a cash refund recorded at the counter tells the customer nothing", async () => {
        const order = await paidOrder();
        const notices = await prisma.job.count({
            where: { organizationId: orgId, type: CUSTOMER_NOTIFY_TYPE },
        });
        await orders.updateStatus(storeId, order.id, ownerId, {
            paymentStatus: "REFUNDED",
            refundAmount: "100",
            refundedHow: "CASH",
        });
        expect(await refundsOf(order.id)).toEqual([]);
        expect(
            await prisma.job.count({
                where: { organizationId: orgId, type: CUSTOMER_NOTIFY_TYPE },
            }),
        ).toBe(notices);
    });

    it("the REFUND switch off: nothing is queued, and the order's history is the same", async () => {
        await prisma.customerNoticeSetting.create({
            data: { organizationId: orgId, kind: "REFUND", enabled: false },
        });
        const order = await paidOrder();
        await payments.initiateRefund(owner, order.id, {
            idempotencyKey: key(),
        });
        const [refund] = await refundsOf(order.id);
        expect(refund.providerRefundId).not.toBeNull();
        expect(await jobsAbout(CUSTOMER_NOTIFY_TYPE, refund.id)).toEqual([]);
        const steps = await prisma.orderEvent.findMany({
            where: { orderId: order.id, kind: "REFUND" },
            select: { amountCents: true },
        });
        expect(steps).toEqual([{ amountCents: 48000 }]);
    });

    it("a refund that fails at the provider later: refund.failed on the bell, once, however often the webhook comes", async () => {
        const order = await paidOrder();
        await payments.initiateRefund(owner, order.id, {
            idempotencyKey: key(),
        });
        const [refund] = await refundsOf(order.id);
        // The customer was told it was on its way.
        await runJobs();

        for (let i = 0; i < 2; i += 1) {
            await webhook({
                eventType: "refund.failed",
                outcome: "REFUND_FAILED",
                providerIntentId: `prov_u12_${orderSeq}_${tag}`,
                providerRefundId: refund.providerRefundId,
                refundReference: refund.id,
            });
        }
        expect((await refundsOf(order.id))[0].status).toBe("FAILED");
        const alerts = await jobsAbout(TEAM_ALERT_TYPE, refund.id);
        expect(alerts.map((j) => j.payload)).toEqual([
            { event: "refund", refundId: refund.id, change: "failed" },
        ]);
        await runJobs();
        const bells = await prisma.notification.findMany({
            where: {
                organizationId: orgId,
                orderId: order.id,
                type: { startsWith: "refund." },
            },
            select: { type: true, title: true, body: true },
        });
        expect(bells).toEqual([
            {
                type: "refund.failed",
                title: `Refund on order ${order.number} failed`,
                body: expect.stringContaining(
                    "though the customer was told it was on its way",
                ),
            },
        ]);
        // Emailed to the team on the Payment failed row (owner and admin).
        expect(refundMails()).toHaveLength(2);
    });

    it("a part-refused refund: the part sent is told to the customer, the part refused to the team but not to whoever asked", async () => {
        orderSeq += 1;
        const made = await orders.create(storeId, ownerId, {
            customerId,
            items: [{ productId: loaf, quantity: 2 }],
            fulfilment: "PICKUP",
        });
        // Paid in two online payments of ₹240.
        for (const part of [1, 2]) {
            const intent = await prisma.paymentIntent.create({
                data: {
                    organizationId: orgId,
                    orderId: made.id,
                    provider: "RAZORPAY",
                    providerIntentId: `prov_u12_${orderSeq}_${part}_${tag}`,
                    amountCents: 24000,
                    currency: "INR",
                    status: "SUCCEEDED",
                },
            });
            await prisma.paymentAttempt.create({
                data: {
                    organizationId: orgId,
                    paymentIntentId: intent.id,
                    provider: "RAZORPAY",
                    providerRef: `pay_u12_${orderSeq}_${part}_${tag}`,
                    status: "SUCCEEDED",
                },
            });
        }
        await prisma.order.update({
            where: { id: made.id },
            data: { paymentStatus: "PAID" },
        });

        fake.failNextRefund("REFUSED");
        await payments.initiateRefund(owner, made.id, {
            idempotencyKey: key(),
        });
        const rows = await refundsOf(made.id);
        expect(rows.map((r) => r.status).sort()).toEqual(["FAILED", "PENDING"]);
        const sent = rows.find((r) => r.status === "PENDING");
        const refused = rows.find((r) => r.status === "FAILED");
        if (!sent || !refused) throw new Error("expected two parts");

        expect(await jobsAbout(CUSTOMER_NOTIFY_TYPE, sent.id)).toHaveLength(1);
        expect(await jobsAbout(CUSTOMER_NOTIFY_TYPE, refused.id)).toEqual([]);
        expect(
            (await jobsAbout(TEAM_ALERT_TYPE, refused.id)).map(
                (j) => j.payload,
            ),
        ).toEqual([
            {
                event: "refund",
                refundId: refused.id,
                change: "refused",
                actorUserId: ownerId,
            },
        ]);

        const before = (await refundEmails()).length;
        await runJobs();
        const emails = (await refundEmails()).slice(before);
        expect(emails).toHaveLength(1);
        expect(emails[0].body).toContain("₹240 for your order");
        const bell = await prisma.notification.findFirst({
            where: { organizationId: orgId, orderId: made.id },
            select: { type: true, title: true },
        });
        expect(bell?.type).toBe("refund.refused");
        // Only the admin is emailed: the owner asked, and saw it refused.
        expect(refundMails()).toEqual([`u12-admin-${tag}@example.com`]);
    });
});
