/**
 * Cancelling after part of the order was refunded by hand (#918, DEC-116),
 * against a real Postgres: the cancel refunds exactly what is left on the
 * order — online, never more than DEC-116's cap — or, paid by hand, the
 * till gives back what is left; with nothing left it hands nothing back.
 * Credit notes cover only what is refunded now.
 *
 * The provider and the webhook verifier are the network-free fakes; only
 * the app env is stubbed. Runs in the integration project.
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
        SITE_ACCOUNT_AREA: "off",
    },
}));

import { prisma } from "@saroh/database";
import { createHmac } from "node:crypto";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import { count } from "../stock/stock.service";
import { StoresService } from "../stores/stores.service";
import {
    FakeWebhookProvider,
    FakeWebhookProviderFactory,
} from "../webhooks/providers/fake.webhook";
import { WebhooksService } from "../webhooks/webhooks.service";
import { cancelKeyPrefix } from "./order-cancel";
import { OrderCancelService } from "./order-cancel.service";
import { OrdersService } from "./orders.service";

const WEBHOOK_SECRET = "whsec_918_test";
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

let orgId = "";
let ownerId = "";
let owner: OrganizationContext;
let storeId = "";
let customerId = "";
let loaf = "";
let eventSeq = 0;
let orderSeq = 0;
let keySeq = 0;
const key = () => `918-key-${(keySeq += 1)}`;

beforeAll(async () => {
    ownerId = (
        await prisma.user.create({
            data: { email: `918-owner-${tag}@example.com` },
        })
    ).id;
    orgId = (
        await prisma.organization.create({
            data: { name: "Rye & Co.", slug: `918-rye-${tag}` },
        })
    ).id;
    await prisma.membership.create({
        data: { organizationId: orgId, userId: ownerId, role: "OWNER" },
    });
    owner = { organizationId: orgId, userId: ownerId, role: "OWNER" };
    await prisma.businessProfile.create({
        data: { organizationId: orgId, invoicePrefix: "C9", timezone: "UTC" },
    });
    await giveBusinessDetails(orgId);
    storeId = (
        await prisma.store.create({
            data: {
                name: "Hill Road",
                slug: `918-hill-${tag}`,
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
                email: `918-buyer-${tag}@example.com`,
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
                slug: `918-loaf-${tag}`,
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
        publicKey: "rzp_test_Public1",
        keyId: "rzp_test_Public1",
        keySecret: "rzp_secret",
        webhookSecret: WEBHOOK_SECRET,
    });
});

function webhook(event: Record<string, unknown>) {
    eventSeq += 1;
    const raw = Buffer.from(
        JSON.stringify({ providerEventId: `evt_918_${eventSeq}`, ...event }),
    );
    return webhooks.handle("razorpay", orgId, raw, {
        "x-fake-signature": createHmac("sha256", WEBHOOK_SECRET)
            .update(raw)
            .digest("hex"),
    });
}

/**
 * Two loaves, ₹480, made at the counter (which promises the stock). Paid
 * online through the payment webhook, which makes the invoice as a real
 * payment does — or, with `byHand`, recorded as paid by hand.
 */
async function order(byHand = false): Promise<string> {
    orderSeq += 1;
    const made = await orders.create(storeId, ownerId, {
        customerId,
        items: [{ productId: loaf, quantity: 2 }],
        fulfilment: "PICKUP",
    });
    if (byHand) {
        await orders.updateStatus(storeId, made.id, ownerId, {
            paymentStatus: "PAID",
            paidHow: "CASH",
        });
        return made.id;
    }
    const intentId = `prov_918_${orderSeq}_${tag}`;
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
        providerPaymentRef: `pay_918_${orderSeq}_${tag}`,
    });
    return made.id;
}

/** "Record as refunded" with another amount, handed back in cash. */
function refundByHand(id: string, amount: string) {
    return orders.updateStatus(storeId, id, ownerId, {
        paymentStatus: "REFUNDED",
        refundAmount: amount,
        refundedHow: "CASH",
    });
}

/** The provider confirms a refund (its webhook). */
async function settle(refundId: string): Promise<void> {
    const row = await prisma.paymentRefund.findUniqueOrThrow({
        where: { id: refundId },
        select: {
            amountCents: true,
            providerRefundId: true,
            paymentIntent: { select: { providerIntentId: true } },
        },
    });
    await webhook({
        eventType: "refund.processed",
        outcome: "REFUNDED",
        providerIntentId: row.paymentIntent.providerIntentId,
        providerRefundId: row.providerRefundId ?? `fake_refund_${refundId}`,
        refundReference: refundId,
        refundAmountCents: row.amountCents,
    });
}

const orderRow = (id: string) =>
    prisma.order.findUniqueOrThrow({
        where: { id },
        select: { status: true, paymentStatus: true },
    });

/** Each credit note's total, oldest first, and the invoice's status. */
async function paper(id: string) {
    const notes = await prisma.invoice.findMany({
        where: { orderId: id, kind: "CREDIT_NOTE" },
        orderBy: { createdAt: "asc" },
        select: { total: true },
    });
    const invoice = await prisma.invoice.findFirstOrThrow({
        where: { orderId: id, kind: "INVOICE" },
        select: { status: true },
    });
    return {
        notes: notes.map((n) => n.total.toString()),
        invoice: invoice.status,
    };
}

const promised = async () =>
    (
        await prisma.stockLevel.findFirstOrThrow({
            where: { storeId, productId: loaf },
            select: { promised: true },
        })
    ).promised;

describe("cancel after part was refunded by hand (#918, real database)", () => {
    it("paid online, ₹100 handed back by hand: the cancel sends back exactly the ₹380 left, and the order ends refunded and cancelled", async () => {
        const before = await promised();
        const id = await order();
        await refundByHand(id, "100");
        expect((await orderRow(id)).paymentStatus).toBe("PAID");

        const outcome = await cancels.cancel(owner, id, {
            reason: "Customer changed their mind",
            idempotencyKey: key(),
        });
        expect(outcome).toMatchObject({
            cancelled: true,
            refund: {
                amountCents: 38000,
                currency: "INR",
                beingConfirmed: false,
                partlyRefused: false,
            },
            byHand: null,
        });
        const refunds = await prisma.paymentRefund.findMany({
            where: { paymentIntent: { orderId: id } },
            select: {
                id: true,
                amountCents: true,
                idempotencyKey: true,
                lines: { select: { quantity: true } },
            },
        });
        expect(refunds).toHaveLength(1);
        expect(refunds[0].amountCents).toBe(38000);
        expect(refunds[0].idempotencyKey?.startsWith(cancelKeyPrefix(id))).toBe(
            true,
        );
        // The lines still ride on it, so the stock follows the refund.
        expect(refunds[0].lines.map((l) => l.quantity)).toEqual([2]);
        expect((await orderRow(id)).status).toBe("CANCELLED");
        // Credited: ₹100 for the refund by hand, ₹380 for this one.
        expect((await paper(id)).notes).toEqual(["100", "380"]);

        await settle(refunds[0].id);
        expect(await orderRow(id)).toEqual({
            status: "CANCELLED",
            paymentStatus: "REFUNDED",
        });
        expect(await promised()).toBe(before);
        // Nothing credited twice: the invoice is credited in full.
        expect(await paper(id)).toEqual({
            notes: ["100", "380"],
            invoice: "CREDITED",
        });
    });

    it("nothing left on the order: the cancel needs no refund", async () => {
        const id = await order();
        await refundByHand(id, "100");
        // The rest goes back online as another amount, not yet confirmed.
        await payments.initiateRefund(owner, id, {
            kind: "goodwill",
            amountCents: 38000,
            reason: "Goodwill",
            idempotencyKey: key(),
        });
        expect((await orderRow(id)).paymentStatus).toBe("PAID");

        const outcome = await cancels.cancel(owner, id, {
            idempotencyKey: key(),
        });
        expect(outcome).toMatchObject({
            cancelled: true,
            refund: null,
            byHand: null,
        });
        // No refund made by the cancel.
        expect(
            await prisma.paymentRefund.count({
                where: {
                    paymentIntent: { orderId: id },
                    idempotencyKey: { startsWith: cancelKeyPrefix(id) },
                },
            }),
        ).toBe(0);
        expect(await orderRow(id)).toEqual({
            status: "CANCELLED",
            paymentStatus: "REFUNDED",
        });
        expect((await paper(id)).notes).toEqual(["100", "380"]);
    });

    it("₹100 by hand and the rest online as another amount: refunded once it settles", async () => {
        const id = await order();
        await refundByHand(id, "100");
        const refund = await payments.initiateRefund(owner, id, {
            kind: "goodwill",
            amountCents: 38000,
            reason: "Goodwill",
            idempotencyKey: key(),
        });
        await settle(refund.refunds[0].id);
        expect((await orderRow(id)).paymentStatus).toBe("REFUNDED");
        await expect(
            cancels.cancel(owner, id, { idempotencyKey: key() }),
        ).rejects.toThrow("It's already refunded in full.");
    });

    it("never sends back what went back by hand: a second cancel request can't take more", async () => {
        const id = await order();
        await refundByHand(id, "479.50");
        const outcome = await cancels.cancel(owner, id, {
            idempotencyKey: key(),
        });
        expect(outcome.refund?.amountCents).toBe(50);
        const sent = await prisma.paymentRefund.aggregate({
            where: { paymentIntent: { orderId: id } },
            _sum: { amountCents: true },
        });
        expect(sent._sum.amountCents).toBe(50);
    });

    it("paid by hand, ₹200 handed back already: the till gives back the ₹280 left, and only that is credited", async () => {
        const before = await promised();
        const id = await order(true);
        await refundByHand(id, "200");
        const outcome = await cancels.cancel(owner, id, {
            reason: "Quality",
            idempotencyKey: key(),
        });
        expect(outcome).toMatchObject({
            cancelled: true,
            refund: null,
            byHand: { amountCents: 28000, currency: "INR" },
        });
        expect(await orderRow(id)).toEqual({
            status: "CANCELLED",
            paymentStatus: "REFUNDED",
        });
        expect(await paper(id)).toEqual({
            notes: ["200", "280"],
            invoice: "CREDITED",
        });
        expect(await promised()).toBe(before);
    });

    it("paid by hand with nothing handed back: today's cancel, the whole amount from the till", async () => {
        const id = await order(true);
        const outcome = await cancels.cancel(owner, id, {
            idempotencyKey: key(),
        });
        expect(outcome.byHand).toEqual({ amountCents: 48000, currency: "INR" });
        expect((await paper(id)).notes).toEqual(["480"]);
    });
});
