/**
 * "Or another amount" (B8) against a real Postgres: a goodwill refund with
 * its reason is a PaymentRefund with no lines, a credit note for exactly
 * the amount, and no stock entry; the refund webhook settling it makes no
 * second note, and the order's money reads it out once. It is capped at
 * what was paid and not yet handed back — under the order's row lock, so
 * two at once can't together pass it — and needs a reason.
 *
 * The provider and the webhook verifier are the network-free fakes. Runs in
 * the integration project (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import { BadRequestException, ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { createHmac } from "node:crypto";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { OrderKitchenService } from "../orders/order-kitchen.service";
import { OrdersService } from "../orders/orders.service";
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

const WEBHOOK_SECRET = "whsec_goodwill_test";
const tag = `${process.pid}-${Date.now()}`;

const flags = {
    isEnabled: () => Promise.resolve(true),
} as unknown as FeatureFlagService;
const orders = new OrdersService(new StoresService(flags));
const fake = new FakeMerchantProvider("RAZORPAY");
const payments = new PaymentsService(new FakeProviderFactory(fake));
const kitchen = new OrderKitchenService(payments);
const webhooks = new WebhooksService(
    new FakeWebhookProviderFactory(new FakeWebhookProvider("RAZORPAY")),
    payments,
);

let orgId = "";
let ownerId = "";
let owner: OrganizationContext;
let storeId = "";
let customerId = "";
let loaf = "";
let eventSeq = 0;
let orderSeq = 0;

beforeAll(async () => {
    ownerId = (
        await prisma.user.create({
            data: { email: `gw-owner-${tag}@example.com` },
        })
    ).id;
    orgId = (
        await prisma.organization.create({
            data: { name: "Rye & Co.", slug: `gw-rye-${tag}` },
        })
    ).id;
    await prisma.membership.create({
        data: { organizationId: orgId, userId: ownerId, role: "OWNER" },
    });
    owner = { organizationId: orgId, userId: ownerId, role: "OWNER" };
    await prisma.businessProfile.create({
        data: {
            organizationId: orgId,
            invoicePrefix: "GW",
            timezone: "Asia/Kolkata",
        },
    });
    await giveBusinessDetails(orgId);
    storeId = (
        await prisma.store.create({
            data: {
                name: "Hill Road",
                slug: `gw-hill-${tag}`,
                organizationId: orgId,
            },
        })
    ).id;
    customerId = (
        await prisma.customer.create({
            data: {
                storeId,
                organizationId: orgId,
                email: `gw-buyer-${tag}@example.com`,
                firstName: "Asha",
            },
        })
    ).id;
    loaf = (
        await prisma.product.create({
            data: {
                storeId,
                organizationId: orgId,
                name: "Seeded loaf",
                slug: `gw-loaf-${tag}`,
                price: "240.00",
            },
        })
    ).id;
    await prisma.productListing.create({
        data: { storeId, organizationId: orgId, productId: loaf },
    });
    // Counted: the shelf is tracked, so a stock entry would show.
    await prisma.$transaction((tx) =>
        count(
            tx,
            { organizationId: orgId, userId: ownerId },
            { target: { storeId, productId: loaf }, counted: 20 },
        ),
    );
    await payments.connectProvider(owner, {
        provider: "RAZORPAY",
        publicKey: "rzp_test_Public1",
        keyId: "rzp_test_Public1",
        keySecret: "rzp_secret",
        webhookSecret: WEBHOOK_SECRET,
    });
});

function webhook(event: Record<string, unknown>) {
    eventSeq += 1;
    const raw = Buffer.from(
        JSON.stringify({ providerEventId: `evt_gw_${eventSeq}`, ...event }),
    );
    return webhooks.handle("razorpay", orgId, raw, {
        "x-fake-signature": createHmac("sha256", WEBHOOK_SECRET)
            .update(raw)
            .digest("hex"),
    });
}

/**
 * Two loaves (₹480), paid online through the payment webhook — which makes
 * the order's invoice, as a real checkout does.
 */
async function paidOrder(): Promise<string> {
    orderSeq += 1;
    const order = await orders.create(storeId, ownerId, {
        customerId,
        items: [{ productId: loaf, quantity: 2 }],
    });
    const row = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        select: { total: true },
    });
    await prisma.paymentIntent.create({
        data: {
            organizationId: orgId,
            orderId: order.id,
            provider: "RAZORPAY",
            providerIntentId: `prov_gw_${orderSeq}_${tag}`,
            amountCents: Math.round(Number(row.total) * 100),
            currency: "INR",
            status: "REQUIRES_PAYMENT",
        },
    });
    await webhook({
        eventType: "payment.captured",
        outcome: "SUCCEEDED",
        providerIntentId: `prov_gw_${orderSeq}_${tag}`,
        providerPaymentRef: `pay_gw_${orderSeq}_${tag}`,
    });
    return order.id;
}

const stockEntries = () =>
    prisma.stockEntry.count({ where: { organizationId: orgId } });

const creditNotes = (orderId: string) =>
    prisma.invoice.findMany({
        where: { orderId, kind: "CREDIT_NOTE" },
        select: { total: true, paymentRefundId: true, paymentNote: true },
    });

describe("another amount — a goodwill refund (B8, real database)", () => {
    it("₹50 for Late: a refund with no lines, a ₹50 credit note, no stock entry", async () => {
        const orderId = await paidOrder();
        expect(
            await prisma.invoice.count({
                where: { orderId, kind: "INVOICE" },
            }),
        ).toBe(1);
        const entriesBefore = await stockEntries();

        const refund = await payments.initiateRefund(owner, orderId, {
            kind: "goodwill",
            amountCents: 5000,
            reason: "Late",
        });
        expect(refund.amountCents).toBe(5000);
        expect(refund.lines).toEqual([]);
        // Held until the provider confirms it (DEC-026).
        expect(refund.status).toBe("PENDING");

        const row = await prisma.paymentRefund.findUniqueOrThrow({
            where: { id: refund.refundId },
            include: { lines: true },
        });
        expect(row).toMatchObject({
            amountCents: 5000,
            reason: "Late",
            forEdit: false,
        });
        expect(row.lines).toHaveLength(0);

        // The provider settles it; the webhook finds the note already made.
        await webhook({
            eventType: "refund.processed",
            outcome: "REFUNDED",
            providerIntentId: (
                await prisma.paymentIntent.findUniqueOrThrow({
                    where: { id: refund.paymentIntentId },
                    select: { providerIntentId: true },
                })
            ).providerIntentId,
            providerRefundId: refund.providerRefundId,
            refundReference: refund.refundId,
            refundAmountCents: 5000,
        });

        const notes = await creditNotes(orderId);
        expect(notes).toHaveLength(1);
        expect(notes[0].total.toString()).toBe("50");
        expect(notes[0].paymentRefundId).toBe(refund.refundId);

        // No line, so nothing went back on the shelf.
        expect(await stockEntries()).toBe(entriesBefore);
        expect(
            await prisma.paymentRefundLine.count({
                where: { paymentRefundId: refund.refundId },
            }),
        ).toBe(0);

        // The timeline says why; the money reads it out once.
        const events = await prisma.orderEvent.findMany({
            where: { orderId, kind: "REFUND" },
            select: { note: true, amountCents: true },
        });
        expect(events).toEqual([{ note: "Late", amountCents: 5000 }]);
        const read = await kitchen.read(owner, orderId);
        expect(read.money?.refunded).toBe("50.00");
        expect(read.refundStanding).toBe("PARTLY_REFUNDED");
        const order = await prisma.order.findUniqueOrThrow({
            where: { id: orderId },
            select: { paymentStatus: true },
        });
        expect(order.paymentStatus).toBe("PAID");
    });

    it("more than is left → 409 'At most ₹X can be refunded', and nothing is reserved", async () => {
        const orderId = await paidOrder();
        await payments.initiateRefund(owner, orderId, {
            kind: "goodwill",
            amountCents: 30000,
            reason: "Quality",
        });
        const attempt = payments.initiateRefund(owner, orderId, {
            kind: "goodwill",
            amountCents: 20000,
            reason: "Quality",
        });
        await expect(attempt).rejects.toThrow(ConflictException);
        await expect(
            payments.initiateRefund(owner, orderId, {
                kind: "goodwill",
                amountCents: 20000,
                reason: "Quality",
            }),
        ).rejects.toThrow("At most ₹180 can be refunded.");
        expect(
            await prisma.paymentRefund.count({
                where: { paymentIntent: { orderId } },
            }),
        ).toBe(1);
    });

    it("two at once can't together pass the balance", async () => {
        const orderId = await paidOrder();
        const results = await Promise.allSettled([
            payments.initiateRefund(owner, orderId, {
                kind: "goodwill",
                amountCents: 30000,
                reason: "Late",
            }),
            payments.initiateRefund(owner, orderId, {
                kind: "goodwill",
                amountCents: 30000,
                reason: "Late",
            }),
        ]);
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        const refused = results.find((r) => r.status === "rejected");
        expect((refused as PromiseRejectedResult).reason).toBeInstanceOf(
            ConflictException,
        );
        const held = await prisma.paymentRefund.aggregate({
            where: {
                paymentIntent: { orderId },
                status: { not: "FAILED" },
            },
            _sum: { amountCents: true },
        });
        expect(held._sum.amountCents).toBe(30000);
    });

    it("another amount with no reason → 400, and nothing is sent", async () => {
        const orderId = await paidOrder();
        const calls = fake.refundCalls.length;
        await expect(
            payments.initiateRefund(owner, orderId, {
                kind: "goodwill",
                amountCents: 5000,
                reason: "  ",
            }),
        ).rejects.toThrow(BadRequestException);
        expect(fake.refundCalls.length).toBe(calls);
        expect(
            await prisma.paymentRefund.count({
                where: { paymentIntent: { orderId } },
            }),
        ).toBe(0);
    });

    it("an amount without kind goodwill is refused, never read as a line refund", async () => {
        const orderId = await paidOrder();
        await expect(
            payments.initiateRefund(owner, orderId, {
                amountCents: 5000,
            }),
        ).rejects.toThrow(BadRequestException);
    });

    it("a Member never refunds another amount", async () => {
        const orderId = await paidOrder();
        await expect(
            payments.initiateRefund({ ...owner, role: "MEMBER" }, orderId, {
                kind: "goodwill",
                amountCents: 5000,
                reason: "Late",
            }),
        ).rejects.toThrow();
        expect(
            await prisma.paymentRefund.count({
                where: { paymentIntent: { orderId } },
            }),
        ).toBe(0);
    });
});
