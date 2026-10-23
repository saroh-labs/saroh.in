/**
 * The team's money alerts (#1139, DEC-174), against a real Postgres, from
 * the payment webhook to the bell and the email:
 *
 * - a team order's online payment that didn't go through rings the bell on
 *   the order and emails whoever has email on for Payment failed;
 * - money captured at ₹1,180 against ₹1,200 due says both figures, and the
 *   payment it failed says nothing more;
 * - a team order paid by its link rings the New order row's bell;
 * - an invoice payment that failed, then paid in cash before the alert ran,
 *   says nothing;
 * - a webhook delivered again gives one alert.
 *
 * The provider and the webhook verifier are the network-free fakes; Saroh's
 * sender is recorded, not called. Runs in the integration project
 * (TEST_DATABASE_URL), plain and under TEST_RLS=on.
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
import { TeamAlertHandler } from "../notifications/team-alert.handler";
import { TEAM_ALERT_TYPE } from "../notifications/team-alerts";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import {
    FakeWebhookProvider,
    FakeWebhookProviderFactory,
} from "./providers/fake.webhook";
import { WebhooksService } from "./webhooks.service";

const WEBHOOK_SECRET = "whsec_money_alerts";
const tag = `${process.pid}-${Date.now()}`;

const payments = new PaymentsService(
    new FakeProviderFactory(new FakeMerchantProvider("RAZORPAY")),
);
const webhooks = new WebhooksService(
    new FakeWebhookProviderFactory(new FakeWebhookProvider("RAZORPAY")),
    payments,
);
const handler = new TeamAlertHandler();
const sent = sendTeamAlertEmail as jest.Mock;

let orgId = "";
let owner: OrganizationContext;
let ownerEmail = "";
let storeId = "";
let customerId = "";
let seq = 0;
const ran = new Set<string>();

beforeAll(async () => {
    ownerEmail = `ma-owner-${tag}@example.com`;
    const ownerId = (await prisma.user.create({ data: { email: ownerEmail } }))
        .id;
    orgId = (
        await prisma.organization.create({
            data: { name: "Rye & Co", slug: `ma-rye-${tag}` },
        })
    ).id;
    await prisma.membership.create({
        data: { organizationId: orgId, userId: ownerId, role: "OWNER" },
    });
    owner = { organizationId: orgId, userId: ownerId, role: "OWNER" };
    await giveBusinessDetails(orgId);
    storeId = (
        await prisma.store.create({
            data: {
                name: "Hill Road",
                slug: `ma-hill-${tag}`,
                organizationId: orgId,
            },
        })
    ).id;
    customerId = (
        await prisma.customer.create({
            data: {
                storeId,
                organizationId: orgId,
                email: `ma-buyer-${tag}@example.com`,
                firstName: "Asha",
                lastName: "Rao",
            },
        })
    ).id;
    await payments.connectProvider(owner, {
        provider: "RAZORPAY",
        publicKey: "rzp_test_Money1",
        keyId: "rzp_test_Money1",
        keySecret: "rzp_secret",
        webhookSecret: WEBHOOK_SECRET,
    });
});

beforeEach(() => {
    sent.mockClear();
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

function webhook(event: Record<string, unknown>) {
    seq += 1;
    const raw = Buffer.from(
        JSON.stringify({ providerEventId: `evt_ma_${seq}_${tag}`, ...event }),
    );
    return webhooks.handle("razorpay", orgId, raw, {
        "x-fake-signature": createHmac("sha256", WEBHOOK_SECRET)
            .update(raw)
            .digest("hex"),
    });
}

/** A ₹1,200 order the team made, with an open online payment. */
async function teamOrder() {
    seq += 1;
    const order = await prisma.order.create({
        data: {
            storeId,
            organizationId: orgId,
            orderId: `MA-${seq}`,
            customerId,
            currency: "INR",
            subtotal: "1200.00",
            tax: "0.00",
            total: "1200.00",
            status: "PENDING",
            paymentStatus: "UNPAID",
            fulfilment: "PICKUP",
        },
        select: { id: true, orderId: true },
    });
    const providerIntentId = `order_ma_${seq}_${tag}`;
    const intent = await prisma.paymentIntent.create({
        data: {
            organizationId: orgId,
            orderId: order.id,
            provider: "RAZORPAY",
            providerIntentId,
            amountCents: 120000,
            currency: "INR",
            status: "REQUIRES_PAYMENT",
        },
    });
    return { order, intent, providerIntentId };
}

/** Run every `team.alert` job not run yet, as the worker would. */
async function runAlerts(): Promise<void> {
    const jobs = await prisma.job.findMany({
        where: { organizationId: orgId, type: TEAM_ALERT_TYPE },
        orderBy: { createdAt: "asc" },
    });
    for (const job of jobs) {
        if (ran.has(job.id)) continue;
        ran.add(job.id);
        await handler.handle(job as Job);
    }
}

/** The bell's notices about one order or invoice. */
const noticesOn = (where: { orderId?: string; invoiceId?: string }) =>
    prisma.notification.findMany({
        where: { organizationId: orgId, ...where },
        select: { type: true, title: true, body: true },
        orderBy: { createdAt: "asc" },
    });

const queued = async (paymentIntentId: string) =>
    (
        await prisma.job.findMany({
            where: { organizationId: orgId, type: TEAM_ALERT_TYPE },
            select: { payload: true },
        })
    )
        .map((j) => j.payload as { event: string; paymentIntentId?: string })
        .filter((p) => p.paymentIntentId === paymentIntentId)
        .map((p) => p.event);

describe("the team's money alerts (#1139, real database)", () => {
    it("a team order's payment that didn't go through rings the bell and emails the owner; redelivered, it's told once", async () => {
        const { order, intent, providerIntentId } = await teamOrder();
        const failed = {
            eventType: "payment.failed",
            outcome: "FAILED",
            providerIntentId,
        };
        await webhook(failed);
        // The same failure delivered again, under its own event id.
        await webhook(failed);
        expect(await queued(intent.id)).toEqual(["order-failed"]);
        await runAlerts();
        await runAlerts();

        expect(await noticesOn({ orderId: order.id })).toEqual([
            {
                type: "order.payment_failed",
                title: `Payment for order ${order.orderId} didn't go through`,
                body: "Asha Rao's payment of ₹1,200 didn't go through. They'll need a new link: open the order to share one.",
            },
        ]);
        expect(sent).toHaveBeenCalledTimes(1);
        expect(sent.mock.calls[0][0]).toBe(ownerEmail);
        expect(sent.mock.calls[0][1]).toMatchObject({
            heading: `Payment for order ${order.orderId} didn't go through`,
            url: `https://app.saroh.localhost/commerce/orders/${order.id}`,
        });
        expect(sent.mock.calls[0][1].body).not.toContain("Asha");
    });

    it("₹1,180 captured against ₹1,200 due: both figures, once, and no 'didn't go through' as well", async () => {
        const { order, intent, providerIntentId } = await teamOrder();
        const captured = {
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId,
            providerPaymentRef: `pay_ma_short_${tag}`,
            capturedAmountCents: 118000,
            capturedCurrency: "INR",
        };
        await webhook(captured);
        // Razorpay's `order.paid` for the same payment, then a replay.
        await webhook({ ...captured, eventType: "order.paid" });
        await webhook(captured);
        expect(await queued(intent.id)).toEqual(["mismatch", "order-failed"]);
        await runAlerts();

        expect(await noticesOn({ orderId: order.id })).toEqual([
            {
                type: "payment.mismatch",
                title: `Payment for order ${order.orderId} didn't match`,
                body: "Asha Rao paid, but ₹1,180 was taken against ₹1,200 due. It isn't counted as paid, and it's owed back to the customer: refund it from Home.",
            },
        ]);
        expect(sent).toHaveBeenCalledTimes(1);
        expect(sent.mock.calls[0][1].body).toContain(
            "₹1,180 was taken against ₹1,200 due",
        );
    });

    it("a team order paid by its link rings the New order row's bell, and emails nobody by default", async () => {
        const { order, intent, providerIntentId } = await teamOrder();
        await webhook({
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId,
            providerPaymentRef: `pay_ma_ok_${tag}`,
            capturedAmountCents: 120000,
            capturedCurrency: "INR",
        });
        expect(await queued(intent.id)).toEqual(["paid-by-link"]);
        await runAlerts();
        expect(await noticesOn({ orderId: order.id })).toEqual([
            {
                type: "order.paid_by_link",
                title: `Order ${order.orderId} was paid online`,
                body: "Asha Rao paid ₹1,200 online.",
            },
        ]);
        expect(sent).not.toHaveBeenCalled();
    });

    it("an invoice payment that failed, then paid in cash before the alert ran, says nothing", async () => {
        seq += 1;
        const invoice = await prisma.invoice.create({
            data: {
                organizationId: orgId,
                status: "ISSUED",
                number: `INV-MA-${seq}`,
                currency: "INR",
                subtotal: "1200.00",
                total: "1200.00",
                billToName: "Meera Iyer",
            },
        });
        const providerIntentId = `order_ma_inv_${seq}_${tag}`;
        const intent = await prisma.paymentIntent.create({
            data: {
                organizationId: orgId,
                invoiceId: invoice.id,
                provider: "RAZORPAY",
                providerIntentId,
                amountCents: 120000,
                currency: "INR",
                status: "REQUIRES_PAYMENT",
            },
        });
        await webhook({
            eventType: "payment.failed",
            outcome: "FAILED",
            providerIntentId,
        });
        expect(await queued(intent.id)).toEqual(["failed"]);
        // Paid at the counter before the job ran.
        await prisma.invoice.update({
            where: { id: invoice.id },
            data: { status: "PAID" },
        });
        await runAlerts();
        expect(await noticesOn({ invoiceId: invoice.id })).toEqual([]);
        expect(sent).not.toHaveBeenCalled();
    });

    it("an invoice payment that failed and still stands says a new link is needed, never 'the same link'", async () => {
        seq += 1;
        const invoice = await prisma.invoice.create({
            data: {
                organizationId: orgId,
                status: "ISSUED",
                number: `INV-MA-${seq}`,
                currency: "INR",
                subtotal: "1200.00",
                total: "1200.00",
                billToName: "Meera Iyer",
            },
        });
        const providerIntentId = `order_ma_inv_${seq}_${tag}`;
        await prisma.paymentIntent.create({
            data: {
                organizationId: orgId,
                invoiceId: invoice.id,
                provider: "RAZORPAY",
                providerIntentId,
                amountCents: 120000,
                currency: "INR",
                status: "REQUIRES_PAYMENT",
            },
        });
        await webhook({
            eventType: "payment.failed",
            outcome: "FAILED",
            providerIntentId,
        });
        await runAlerts();
        const [notice] = await noticesOn({ invoiceId: invoice.id });
        expect(notice).toMatchObject({
            type: "payment.failed",
            body: "Meera Iyer's payment of ₹1,200 didn't go through. They'll need a new link: open the invoice to share one.",
        });
        expect(notice.body).not.toContain("same link");
    });
});
