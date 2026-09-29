/**
 * "Cancel order…" and "Change how it's fulfilled…" end to end against a
 * real Postgres (round-2 B9, R6, R7): a change of way moves the delivery
 * charge and corrects the invoice, a cancel is a refund in full that keeps
 * the order as cancelled, both are refused from the handover on, a lost
 * provider answer keeps the order open until the refund settles, a
 * treatment's visits are cancelled with its order, and the customer can be
 * told in their message thread.
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

import { ConflictException, ForbiddenException } from "@nestjs/common";
import type { OrderFulfilment } from "@saroh/database";
import { prisma } from "@saroh/database";
import { createHmac } from "node:crypto";

import type { OrganizationContext } from "../../common/types/organization-context";
import { env } from "../../env";
import { BookingsService } from "../bookings/bookings.service";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import { PublicOrderPayService } from "../payments/public-order-pay.service";
import { SEND_REFUND_TYPE } from "../payments/send-refund.handler";
import { count } from "../stock/stock.service";
import { StoresService } from "../stores/stores.service";
import {
    FakeWebhookProvider,
    FakeWebhookProviderFactory,
} from "../webhooks/providers/fake.webhook";
import { WebhooksService } from "../webhooks/webhooks.service";
import { cancelKeyPrefix } from "./order-cancel";
import { OrderCancelService } from "./order-cancel.service";
import { OrderFulfilmentChangeService } from "./order-fulfilment-change.service";
import { OrderKitchenService } from "./order-kitchen.service";
import { PAY_LINK_ORDER_SELECT, payLinkStanding } from "./order-pay-link";
import { OrderPayLinkService } from "./order-pay-link.service";
import { OrdersService } from "./orders.service";

const WEBHOOK_SECRET = "whsec_b9_test";
const tag = `${process.pid}-${Date.now()}`;

const flags = {
    isEnabled: () => Promise.resolve(true),
} as unknown as FeatureFlagService;
const orders = new OrdersService(new StoresService(flags));
const fake = new FakeMerchantProvider("RAZORPAY");
const payments = new PaymentsService(new FakeProviderFactory(fake));
const kitchen = new OrderKitchenService(payments);
const changes = new OrderFulfilmentChangeService(payments);
const cancels = new OrderCancelService(payments);
const webhooks = new WebhooksService(
    new FakeWebhookProviderFactory(new FakeWebhookProvider("RAZORPAY")),
    payments,
);
const bookings = new BookingsService();

let orgId = "";
let ownerId = "";
let owner: OrganizationContext;
let member: OrganizationContext;
let storeId = "";
let customerId = "";
let loaf = "";
let pickupOnly = "";
let eventSeq = 0;
let orderSeq = 0;
let keySeq = 0;
const key = () => `b9-key-${(keySeq += 1)}`;
const ADDRESS = {
    line1: "12 Hill Road",
    city: "Mumbai",
    state: "27",
    postalCode: "400050",
};

beforeAll(async () => {
    ownerId = (
        await prisma.user.create({
            data: { email: `b9-owner-${tag}@example.com` },
        })
    ).id;
    orgId = (
        await prisma.organization.create({
            data: { name: "Rye & Co.", slug: `b9-rye-${tag}` },
        })
    ).id;
    await prisma.membership.create({
        data: { organizationId: orgId, userId: ownerId, role: "OWNER" },
    });
    owner = { organizationId: orgId, userId: ownerId, role: "OWNER" };
    member = { organizationId: orgId, userId: "user_member", role: "MEMBER" };
    await prisma.businessProfile.create({
        data: {
            organizationId: orgId,
            invoicePrefix: "B9",
            timezone: "UTC",
        },
    });
    storeId = (
        await prisma.store.create({
            data: {
                name: "Hill Road",
                slug: `b9-hill-${tag}`,
                organizationId: orgId,
            },
        })
    ).id;
    await prisma.storeSettings.create({
        data: {
            storeId,
            currency: "INR",
            collectionEnabled: true,
            shippingEnabled: true,
            fulfilmentTypes: ["PICKUP", "LOCAL_DELIVERY", "SHIPPING"],
        },
    });
    customerId = (
        await prisma.customer.create({
            data: {
                storeId,
                organizationId: orgId,
                email: `b9-buyer-${tag}@example.com`,
                firstName: "Asha",
            },
        })
    ).id;
    const product = async (name: string, types: OrderFulfilment[]) => {
        const id = (
            await prisma.product.create({
                data: {
                    storeId,
                    organizationId: orgId,
                    name,
                    slug: `b9-${name.toLowerCase().replace(/\W+/g, "-")}-${tag}`,
                    price: "240.00",
                    currency: "INR",
                    fulfilmentTypes: types,
                },
            })
        ).id;
        await prisma.productListing.create({
            data: { storeId, organizationId: orgId, productId: id },
        });
        await prisma.$transaction((tx) =>
            count(
                tx,
                { organizationId: orgId, userId: ownerId },
                { target: { storeId, productId: id }, counted: 100 },
            ),
        );
        return id;
    };
    loaf = await product("Seeded loaf", []);
    pickupOnly = await product("Birthday cake", ["PICKUP"]);
    await payments.connectProvider(owner, {
        provider: "RAZORPAY",
        publicKey: "rzp_test_Public1",
        keyId: "rzp_test_Public1",
        keySecret: "rzp_secret",
        webhookSecret: WEBHOOK_SECRET,
    });
});

afterEach(() => {
    (env as { SITE_ACCOUNT_AREA?: string }).SITE_ACCOUNT_AREA = "off";
});

function webhook(event: Record<string, unknown>) {
    eventSeq += 1;
    const raw = Buffer.from(
        JSON.stringify({ providerEventId: `evt_b9_${eventSeq}`, ...event }),
    );
    return webhooks.handle("razorpay", orgId, raw, {
        "x-fake-signature": createHmac("sha256", WEBHOOK_SECRET)
            .update(raw)
            .digest("hex"),
    });
}

/**
 * Two loaves (₹480, plus any delivery), made at the counter — which
 * promises the stock — and paid online through the payment webhook, which
 * makes the order's invoice as a real payment does.
 */
async function order(
    over: {
        fulfilment?: OrderFulfilment;
        shipping?: string;
        product?: string;
        paid?: boolean;
    } = {},
): Promise<string> {
    orderSeq += 1;
    const delivery =
        over.fulfilment === "LOCAL_DELIVERY" || over.fulfilment === "SHIPPING";
    const made = await orders.create(storeId, ownerId, {
        customerId,
        items: [{ productId: over.product ?? loaf, quantity: 2 }],
        fulfilment: over.fulfilment ?? "PICKUP",
        ...(over.shipping ? { shipping: over.shipping } : {}),
        ...(delivery ? { address: ADDRESS } : {}),
    });
    if (over.paid === false) return made.id;
    const row = await prisma.order.findUniqueOrThrow({
        where: { id: made.id },
        select: { total: true },
    });
    const intentId = `prov_b9_${orderSeq}_${tag}`;
    await prisma.paymentIntent.create({
        data: {
            organizationId: orgId,
            orderId: made.id,
            provider: "RAZORPAY",
            providerIntentId: intentId,
            amountCents: Math.round(Number(row.total) * 100),
            currency: "INR",
            status: "REQUIRES_PAYMENT",
        },
    });
    await webhook({
        eventType: "payment.captured",
        outcome: "SUCCEEDED",
        providerIntentId: intentId,
        providerPaymentRef: `pay_b9_${orderSeq}_${tag}`,
    });
    return made.id;
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
        select: {
            status: true,
            paymentStatus: true,
            fulfilment: true,
            shipping: true,
            total: true,
            deliveryLine1: true,
        },
    });

const promised = async () =>
    (
        await prisma.stockLevel.findFirstOrThrow({
            where: { storeId, productId: loaf },
            select: { promised: true },
        })
    ).promised;

describe("change how it's fulfilled (B9, real database)", () => {
    it("Pick-up → Local delivery with ₹40 typed: a supplementary invoice, ₹40 due by pay link, and the step says so", async () => {
        const id = await order();
        const outcome = await changes.change(owner, id, {
            fulfilment: "LOCAL_DELIVERY",
            shipping: "40",
            address: ADDRESS,
        });
        expect(outcome).toMatchObject({
            from: "PICKUP",
            to: "LOCAL_DELIVERY",
            differenceCents: 4000,
            settleCents: 4000,
            byHand: false,
            refund: null,
            told: false,
        });
        const row = await orderRow(id);
        expect(row).toMatchObject({
            fulfilment: "LOCAL_DELIVERY",
            deliveryLine1: "12 Hill Road",
        });
        expect(row.shipping.toString()).toBe("40");
        expect(row.total.toString()).toBe("520");

        const supplementary = await prisma.invoice.findMany({
            where: { orderId: id, kind: "SUPPLEMENTARY" },
            select: { total: true, status: true },
        });
        expect(supplementary).toHaveLength(1);
        expect(supplementary[0].total.toString()).toBe("40");
        expect(supplementary[0].status).toBe("ISSUED");

        const event = await prisma.orderEvent.findFirstOrThrow({
            where: { orderId: id, kind: "EDIT" },
            select: { note: true, amountCents: true },
        });
        expect(event).toEqual({
            note: "Changed from Pick-up to Local delivery",
            amountCents: 4000,
        });

        // The difference is owed: the order's pay link takes it (B11).
        const payable = await prisma.order.findUniqueOrThrow({
            where: { id },
            select: PAY_LINK_ORDER_SELECT,
        });
        expect(payLinkStanding(payable)).toBe("DUE");
        const read = await kitchen.read(owner, id);
        expect(read.money?.due).toBe("40.00");
    });

    it("Local delivery → Pick-up hands the delivery charge back, with a credit note", async () => {
        const id = await order({
            fulfilment: "LOCAL_DELIVERY",
            shipping: "40",
        });
        const outcome = await changes.change(owner, id, {
            fulfilment: "PICKUP",
            shipping: "0",
        });
        expect(outcome.differenceCents).toBe(-4000);
        expect(outcome.settleCents).toBe(-4000);
        expect(outcome.moneyError).toBeNull();
        expect(outcome.refund).toMatchObject({ amountCents: 4000 });
        const refund = await prisma.paymentRefund.findUniqueOrThrow({
            where: { id: outcome.refund?.refundId ?? "" },
            select: { forEdit: true, amountCents: true },
        });
        expect(refund).toEqual({ forEdit: true, amountCents: 4000 });
        const notes = await prisma.invoice.findMany({
            where: { orderId: id, kind: "CREDIT_NOTE" },
            select: { total: true },
        });
        expect(notes.map((n) => n.total.toString())).toEqual(["40"]);
        const row = await orderRow(id);
        expect(row.fulfilment).toBe("PICKUP");
        expect(row.total.toString()).toBe("480");
        // Nothing is due, and the money reads what was kept.
        const read = await kitchen.read(owner, id);
        expect(read.money?.due).toBe("0.00");
    });

    it("an unpaid order just costs the new total: nothing is charged or refunded", async () => {
        const id = await order({ paid: false });
        const outcome = await changes.change(owner, id, {
            fulfilment: "SHIPPING",
            shipping: "60.50",
            address: ADDRESS,
        });
        expect(outcome).toMatchObject({ settleCents: 0, refund: null });
        const row = await orderRow(id);
        expect(row.total.toString()).toBe("540.5");
        expect(await prisma.invoice.count({ where: { orderId: id } })).toBe(0);
    });

    it("an item that only allows Pick-up: Shipping isn't offered, and is refused", async () => {
        const id = await order({ product: pickupOnly });
        const read = await kitchen.read(owner, id);
        expect(read.next.fulfilment).toEqual({
            options: [{ type: "PICKUP", label: "Pick-up" }],
            refusal: "These items can only be fulfilled one way.",
        });
        await expect(
            changes.change(owner, id, {
                fulfilment: "SHIPPING",
                shipping: "60",
                address: ADDRESS,
            }),
        ).rejects.toThrow("Birthday cake isn't sold for Shipping");
    });

    it("offers the storefront's ways the items allow, and a delivery needs an address", async () => {
        const id = await order();
        const read = await kitchen.read(owner, id);
        expect(read.next.fulfilment?.options.map((o) => o.type)).toEqual([
            "PICKUP",
            "LOCAL_DELIVERY",
            "SHIPPING",
        ]);
        await expect(
            changes.change(owner, id, {
                fulfilment: "LOCAL_DELIVERY",
                shipping: "40",
            }),
        ).rejects.toThrow("A delivery needs an address.");
    });

    it("a Member can't change it", async () => {
        const id = await order();
        await expect(
            changes.change(member, id, {
                fulfilment: "LOCAL_DELIVERY",
                shipping: "40",
                address: ADDRESS,
            }),
        ).rejects.toThrow(ForbiddenException);
    });
});

describe("a site checkout's order that costs more since it was paid (B9)", () => {
    const payLinks = new OrderPayLinkService();
    const publicPay = new PublicOrderPayService(payments);

    /** Two loaves bought on the site: nothing held until its payment. */
    async function paidAtCheckout(): Promise<string> {
        orderSeq += 1;
        const made = await prisma.order.create({
            data: {
                storeId,
                organizationId: orgId,
                customerId,
                orderId: `B9-SITE-${orderSeq}-${tag}`,
                currency: "INR",
                subtotal: "480.00",
                total: "480.00",
                placedOnline: true,
                items: {
                    create: [{ productId: loaf, quantity: 2, price: "240.00" }],
                },
            },
        });
        await pay(made.id, 48000, `site_${orderSeq}`);
        return made.id;
    }

    async function pay(orderId: string, amountCents: number, ref: string) {
        const providerIntentId = `prov_b9_${ref}_${tag}`;
        await prisma.paymentIntent.create({
            data: {
                organizationId: orgId,
                orderId,
                provider: "RAZORPAY",
                providerIntentId,
                amountCents,
                currency: "INR",
                status: "REQUIRES_PAYMENT",
            },
        });
        return webhook({
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId,
            providerPaymentRef: `pay_b9_${ref}_${tag}`,
        });
    }

    const heldAttempts = (orderId: string) =>
        prisma.paymentAttempt.count({
            where: { status: "STOCK_HELD", paymentIntent: { orderId } },
        });

    it("offers a pay link for the balance, and its payment settles it without holding the loaves again", async () => {
        const before = await promised();
        const id = await paidAtCheckout();
        expect((await orderRow(id)).paymentStatus).toBe("PAID");
        expect(await promised()).toBe(before + 2);

        // Pick-up → Local delivery, ₹40 more: received 480 of 520.
        await changes.change(owner, id, {
            fulfilment: "LOCAL_DELIVERY",
            shipping: "40",
            address: ADDRESS,
        });
        const payable = await prisma.order.findUniqueOrThrow({
            where: { id },
            select: PAY_LINK_ORDER_SELECT,
        });
        expect(payLinkStanding(payable)).toBe("DUE");

        const { token } = await payLinks.make(owner, id);
        const view = await publicPay.read(token);
        expect(view).toMatchObject({ status: "DUE", due: "40.00" });
        const intent = await publicPay.createIntent(token, {
            idempotencyKey: key(),
        });
        expect(intent.amountCents).toBe(4000);

        await webhook({
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId: intent.providerIntentId,
            providerPaymentRef: `pay_b9_balance_${tag}`,
        });

        // Settled as a second payment: the loaves were held once, by the
        // checkout's payment, and nothing is owed back.
        expect(await promised()).toBe(before + 2);
        expect(await heldAttempts(id)).toBe(1);
        expect(
            await prisma.paymentRefund.count({
                where: { paymentIntent: { orderId: id } },
            }),
        ).toBe(0);
        expect(
            await prisma.paymentIntent.findUniqueOrThrow({
                where: { id: intent.paymentIntentId },
                select: { status: true },
            }),
        ).toEqual({ status: "SUCCEEDED" });
        const supplementary = await prisma.invoice.findFirstOrThrow({
            where: { orderId: id, kind: "SUPPLEMENTARY" },
            select: { status: true },
        });
        expect(supplementary.status).toBe("PAID");
        expect((await kitchen.read(owner, id)).money?.due).toBe("0.00");
        // Nothing left to take: the link stops working.
        expect(
            await prisma.order.findUniqueOrThrow({
                where: { id },
                select: { payTokenHash: true },
            }),
        ).toEqual({ payTokenHash: null });
        const settled = await prisma.order.findUniqueOrThrow({
            where: { id },
            select: PAY_LINK_ORDER_SELECT,
        });
        expect(payLinkStanding(settled)).toBe("PAID");
    });

    it("a later balance gets a fresh link; the settled one never comes back", async () => {
        const id = await paidAtCheckout();
        await changes.change(owner, id, {
            fulfilment: "LOCAL_DELIVERY",
            shipping: "40",
            address: ADDRESS,
        });
        const first = (await payLinks.make(owner, id)).token;
        const paying = await publicPay.createIntent(first, {
            idempotencyKey: key(),
        });
        await webhook({
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId: paying.providerIntentId,
            providerPaymentRef: `pay_b9_first_${tag}`,
        });

        // Local delivery → Shipping, ₹100: ₹60 more.
        await changes.change(owner, id, {
            fulfilment: "SHIPPING",
            shipping: "100",
            address: ADDRESS,
        });
        const second = (await payLinks.make(owner, id)).token;
        expect(second).not.toBe(first);
        expect((await publicPay.read(second)).due).toBe("60.00");
        await expect(publicPay.read(first)).rejects.toThrow();
    });

    it("the checkout's own payment repeating still reads as held, not as a balance", async () => {
        const before = await promised();
        orderSeq += 1;
        const made = await prisma.order.create({
            data: {
                storeId,
                organizationId: orgId,
                customerId,
                orderId: `B9-SITE-${orderSeq}-${tag}`,
                currency: "INR",
                subtotal: "480.00",
                total: "480.00",
                placedOnline: true,
                items: {
                    create: [{ productId: loaf, quantity: 2, price: "240.00" }],
                },
            },
        });
        await pay(made.id, 48000, `repeat_${orderSeq}`);
        // Razorpay's second event for the same payment.
        await webhook({
            eventType: "order.paid",
            outcome: "SUCCEEDED",
            providerIntentId: `prov_b9_repeat_${orderSeq}_${tag}`,
            providerPaymentRef: `pay_b9_repeat_${orderSeq}_${tag}`,
        });
        expect(await promised()).toBe(before + 2);
        expect(await heldAttempts(made.id)).toBe(1);
    });
});

describe("cancel as a full refund (B9, real database)", () => {
    it("a paid order: everything goes back, the order stays as cancelled, and its stock returns when the refund is confirmed", async () => {
        const before = await promised();
        const id = await order();
        expect(await promised()).toBe(before + 2);

        const outcome = await cancels.cancel(owner, id, {
            reason: "Customer changed their mind",
            idempotencyKey: key(),
        });
        expect(outcome).toMatchObject({
            cancelled: true,
            refund: {
                amountCents: 48000,
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
                reason: true,
                idempotencyKey: true,
                status: true,
            },
        });
        expect(refunds).toHaveLength(1);
        expect(refunds[0]).toMatchObject({
            amountCents: 48000,
            reason: "Customer changed their mind",
            status: "PENDING",
        });
        expect(refunds[0].idempotencyKey?.startsWith(cancelKeyPrefix(id))).toBe(
            true,
        );
        const row = await orderRow(id);
        expect(row.status).toBe("CANCELLED");
        const step = await prisma.orderEvent.findFirstOrThrow({
            where: { orderId: id, kind: "STATUS" },
            select: { toStatus: true, note: true },
        });
        expect(step).toEqual({
            toStatus: "CANCELLED",
            note: "Customer changed their mind",
        });
        // Promised until the provider confirms the refund (DEC-032).
        expect(await promised()).toBe(before + 2);
        await settle(refunds[0].id);
        expect(await promised()).toBe(before);
        expect((await orderRow(id)).paymentStatus).toBe("REFUNDED");

        // Kept, and read as cancelled, with nothing more to cancel.
        const read = await kitchen.read(owner, id);
        expect(read.status).toBe("CANCELLED");
        expect(read.next.cancel).toEqual({
            refusal: "This order is already cancelled.",
            pending: false,
        });
    });

    it("the provider times out: the refund stays PENDING, the order isn't cancelled until it settles, and the send job keeps asking", async () => {
        const id = await order();
        fake.failNextRefund("UNKNOWN");
        const outcome = await cancels.cancel(owner, id, {
            reason: "Late",
            idempotencyKey: key(),
        });
        expect(outcome.cancelled).toBe(false);
        expect(outcome.refund?.beingConfirmed).toBe(true);
        expect((await orderRow(id)).status).not.toBe("CANCELLED");
        const refund = await prisma.paymentRefund.findFirstOrThrow({
            where: { paymentIntent: { orderId: id } },
            select: { id: true, status: true, providerRefundId: true },
        });
        expect(refund).toMatchObject({
            status: "PENDING",
            providerRefundId: null,
        });
        const jobs = await prisma.job.findMany({
            where: { organizationId: orgId, type: SEND_REFUND_TYPE },
            select: { payload: true },
        });
        expect(jobs.map((j) => j.payload)).toContainEqual({
            refundId: refund.id,
        });
        // Order Detail says a cancel is waiting.
        const read = await kitchen.read(owner, id);
        expect(read.next.cancel?.pending).toBe(true);

        // Its webhook settles it: the order is cancelled then.
        await settle(refund.id);
        expect((await orderRow(id)).status).toBe("CANCELLED");
        const step = await prisma.orderEvent.findFirstOrThrow({
            where: { orderId: id, kind: "STATUS", toStatus: "CANCELLED" },
            select: { note: true },
        });
        expect(step.note).toBe("Late");
    });

    it("no answer, then the send job asks again: the provider has it, and the cancel finishes", async () => {
        const id = await order();
        fake.failNextRefund("UNKNOWN");
        await cancels.cancel(owner, id, {
            reason: "Late",
            idempotencyKey: key(),
        });
        const refund = await prisma.paymentRefund.findFirstOrThrow({
            where: { paymentIntent: { orderId: id } },
            select: { id: true },
        });
        expect((await orderRow(id)).status).not.toBe("CANCELLED");
        // What the `payments.send-refund` job runs: it looks, then sends.
        await expect(payments.sendQueuedRefund(orgId, refund.id)).resolves.toBe(
            "ACCEPTED",
        );
        expect((await orderRow(id)).status).toBe("CANCELLED");
        // Nothing twice: one refund, one cancelled step.
        expect(
            await prisma.orderEvent.count({
                where: { orderId: id, kind: "STATUS", toStatus: "CANCELLED" },
            }),
        ).toBe(1);
    });

    it("the provider refuses: nothing is cancelled, nothing held", async () => {
        const id = await order();
        fake.failNextRefund("REFUSED");
        await expect(
            cancels.cancel(owner, id, { idempotencyKey: key() }),
        ).rejects.toThrow("The payment provider refused the refund");
        expect((await orderRow(id)).status).not.toBe("CANCELLED");
        const held = await prisma.paymentRefund.count({
            where: {
                paymentIntent: { orderId: id },
                status: { not: "FAILED" },
            },
        });
        expect(held).toBe(0);
    });

    it("a retry of the same cancel makes one refund", async () => {
        const id = await order();
        const k = key();
        await cancels.cancel(owner, id, { idempotencyKey: k });
        await expect(
            cancels.cancel(owner, id, { idempotencyKey: k }),
        ).rejects.toThrow("This order is already cancelled.");
        expect(
            await prisma.paymentRefund.count({
                where: { paymentIntent: { orderId: id } },
            }),
        ).toBe(1);
    });

    it("an unpaid order is cancelled at once, its stock back on the shelf", async () => {
        const before = await promised();
        const id = await order({ paid: false });
        expect(await promised()).toBe(before + 2);
        const outcome = await cancels.cancel(owner, id, {
            idempotencyKey: key(),
        });
        expect(outcome).toMatchObject({
            cancelled: true,
            refund: null,
            byHand: null,
        });
        expect((await orderRow(id)).status).toBe("CANCELLED");
        expect(await promised()).toBe(before);
    });

    it("paid by hand: cancelled and marked refunded, its invoice credited; the counter gives it back", async () => {
        const id = await order({ paid: false });
        await orders.updateStatus(storeId, id, ownerId, {
            paymentStatus: "PAID",
        });
        const outcome = await cancels.cancel(owner, id, {
            reason: "Quality",
            idempotencyKey: key(),
        });
        expect(outcome).toMatchObject({
            cancelled: true,
            refund: null,
            byHand: { amountCents: 48000, currency: "INR" },
        });
        const row = await orderRow(id);
        expect(row).toMatchObject({
            status: "CANCELLED",
            paymentStatus: "REFUNDED",
        });
        expect(
            await prisma.invoice.count({
                where: { orderId: id, kind: "CREDIT_NOTE" },
            }),
        ).toBe(1);
    });

    it("a Member can't cancel", async () => {
        const id = await order({ paid: false });
        await expect(
            cancels.cancel(member, id, { idempotencyKey: key() }),
        ).rejects.toThrow(ForbiddenException);
    });
});

describe("from the handover on (B9)", () => {
    it("Out for delivery: change and cancel are refused with the sentence; a refund is still offered", async () => {
        const id = await order({
            fulfilment: "LOCAL_DELIVERY",
            shipping: "40",
        });
        await kitchen.moveStage(owner, id, { to: "PREPARING" });
        await kitchen.moveStage(owner, id, { to: "READY" });
        await kitchen.moveStage(owner, id, { to: "OUT_FOR_DELIVERY" });

        await expect(
            changes.change(owner, id, { fulfilment: "PICKUP", shipping: "0" }),
        ).rejects.toThrow(
            "It has been handed over, so how it's fulfilled can't change.",
        );
        await expect(
            cancels.cancel(owner, id, { idempotencyKey: key() }),
        ).rejects.toThrow(
            "It has been handed over, so it can't be cancelled. Refund it instead.",
        );
        const read = await kitchen.read(owner, id);
        expect(read.next.cancel?.refusal).toBe(
            "It has been handed over, so it can't be cancelled. Refund it instead.",
        );
        expect(read.next.fulfilment?.refusal).toBe(
            "It has already been handed over.",
        );
        // Refund stays.
        const refund = await payments.initiateRefund(owner, id, {
            reason: "Quality",
            idempotencyKey: key(),
        });
        expect(refund.amountCents).toBe(52000);
    });
});

describe("the lock order under a concurrent refund webhook (B9)", () => {
    it("a cancel and the webhook settling an earlier refund take turns: one ends the order cancelled, nothing twice", async () => {
        const id = await order();
        const lines = await prisma.orderItem.findMany({
            where: { orderId: id },
            select: { id: true },
        });
        const first = await payments.initiateRefund(owner, id, {
            lines: [{ itemId: lines[0].id, quantity: 1 }],
            reason: "Quality",
            idempotencyKey: key(),
        });
        const [cancelled, settled] = await Promise.allSettled([
            cancels.cancel(owner, id, { idempotencyKey: key() }),
            settle(first.refundId),
        ]);
        expect(cancelled.status).toBe("fulfilled");
        expect(settled.status).toBe("fulfilled");
        expect((await orderRow(id)).status).toBe("CANCELLED");
        const back = await prisma.paymentRefund.aggregate({
            where: {
                paymentIntent: { orderId: id },
                status: { not: "FAILED" },
            },
            _sum: { amountCents: true },
        });
        expect(back._sum.amountCents).toBe(48000);
    });
});

describe("tell the customer (B9, A13's thread)", () => {
    async function signedIn(): Promise<string> {
        const contact = await prisma.contact.create({
            data: {
                organizationId: orgId,
                email: `b9-asha-${tag}-${(keySeq += 1)}@example.com`,
                firstName: "Asha",
            },
        });
        const buyer = await prisma.customer.create({
            data: {
                storeId,
                organizationId: orgId,
                email: contact.email,
                firstName: "Asha",
            },
        });
        await prisma.customerIdentityLink.create({
            data: {
                organizationId: orgId,
                contactId: contact.id,
                customerId: buyer.id,
            },
        });
        await prisma.customerAccount.create({
            data: {
                organizationId: orgId,
                contactId: contact.id,
                email: contact.email,
                emailVerifiedAt: new Date(),
            },
        });
        customerId = buyer.id;
        return contact.id;
    }

    it("with the account area on and a signed-in customer, a SYSTEM message says what changed", async () => {
        const saved = customerId;
        const contactId = await signedIn();
        (env as { SITE_ACCOUNT_AREA?: string }).SITE_ACCOUNT_AREA = "on";
        const id = await order({ paid: false });
        customerId = saved;
        const read = await kitchen.read(owner, id);
        expect(read.next.tell).toBe(true);

        const outcome = await changes.change(owner, id, {
            fulfilment: "LOCAL_DELIVERY",
            shipping: "40",
            address: ADDRESS,
            tell: true,
        });
        expect(outcome.told).toBe(true);
        const cancelled = await cancels.cancel(owner, id, {
            idempotencyKey: key(),
            tell: true,
        });
        expect(cancelled.told).toBe(true);

        const thread = await prisma.customerThread.findUniqueOrThrow({
            where: {
                contactId_organizationId: { contactId, organizationId: orgId },
            },
            select: {
                messages: {
                    orderBy: { createdAt: "asc" },
                    select: { author: true, body: true, event: true },
                },
            },
        });
        const number = (
            await prisma.order.findUniqueOrThrow({
                where: { id },
                select: { orderId: true },
            })
        ).orderId;
        expect(thread.messages).toEqual([
            {
                author: "SYSTEM",
                body: `Your order #${number} is now for local delivery. There's ₹40.00 more to pay for delivery.`,
                event: "ORDER_FULFILMENT_CHANGED",
            },
            {
                author: "SYSTEM",
                body: `Your order #${number} has been cancelled.`,
                event: "ORDER_CANCELLED",
            },
        ]);
    });

    it("with the account area off, nothing is posted and the read says so", async () => {
        const saved = customerId;
        await signedIn();
        const id = await order({ paid: false });
        customerId = saved;
        const read = await kitchen.read(owner, id);
        expect(read.next.tell).toBe(false);
        const outcome = await cancels.cancel(owner, id, {
            idempotencyKey: key(),
            tell: true,
        });
        expect(outcome.told).toBe(false);
    });
});

describe("a treatment's order (B9, E9)", () => {
    const tagT = `${tag}-t`;
    let dental: OrganizationContext;
    let whitening = "";

    beforeAll(async () => {
        const organization = await prisma.organization.create({
            data: { name: "Kavi Dental", slug: `b9-kavi-${tagT}` },
        });
        const user = await prisma.user.create({
            data: { email: `b9-kavi-${tagT}@example.in` },
        });
        await prisma.membership.create({
            data: {
                organizationId: organization.id,
                userId: user.id,
                role: "OWNER",
            },
        });
        await prisma.businessProfile.create({
            data: { organizationId: organization.id, timezone: "UTC" },
        });
        dental = {
            organizationId: organization.id,
            userId: user.id,
            role: "OWNER",
        };
        await prisma.store.create({
            data: {
                name: "Indiranagar clinic",
                slug: `b9-kavi-store-${tagT}`,
                organizationId: organization.id,
            },
        });
        whitening = (
            await prisma.service.create({
                data: {
                    organizationId: organization.id,
                    name: "Teeth whitening",
                    durationMinutes: 60,
                    capacity: 1,
                    priceCents: 900_000,
                    currency: "INR",
                    gstRate: "0",
                    timezone: "UTC",
                    visits: 3,
                    availabilityRules: {
                        create: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
                            organizationId: organization.id,
                            dayOfWeek,
                            startMinute: 9 * 60,
                            endMinute: 18 * 60,
                        })),
                    },
                },
            })
        ).id;
    });

    let day = 5;
    const start = () => {
        const d = new Date();
        d.setUTCHours(10, 0, 0, 0);
        d.setUTCDate(d.getUTCDate() + (day += 1));
        return d.toISOString();
    };

    async function treatment(): Promise<string> {
        const visit1 = await bookings.bookByHand(dental, whitening, {
            startAt: start(),
            bookerEmail: `ananya-${tagT}-${(day += 1)}@example.in`,
            bookerName: "Ananya Rao",
            paidWith: "DESK",
        });
        const orderId = visit1.orderId ?? "";
        await bookings.bookVisit(dental, orderId, {
            visitNumber: 2,
            startAt: start(),
        });
        return orderId;
    }

    it("cancelling it cancels its visits still to come", async () => {
        const orderId = await treatment();
        const outcome = await cancels.cancel(dental, orderId, {
            reason: "Moved away",
            idempotencyKey: key(),
        });
        expect(outcome.cancelled).toBe(true);
        const visits = await prisma.booking.findMany({
            where: { orderId },
            select: { status: true },
        });
        expect(visits).toHaveLength(2);
        expect(visits.every((v) => v.status === "CANCELLED")).toBe(true);
        expect(
            await prisma.bookingEvent.count({
                where: {
                    booking: { orderId },
                    type: "CANCELLED",
                },
            }),
        ).toBe(2);
    });

    it("once a visit was attended it can't be cancelled — refund instead", async () => {
        const orderId = await treatment();
        await prisma.booking.updateMany({
            where: { orderId, visitNumber: 1 },
            data: { outcome: "ATTENDED" },
        });
        await expect(
            cancels.cancel(dental, orderId, { idempotencyKey: key() }),
        ).rejects.toThrow(ConflictException);
        const read = await kitchen.read(dental, orderId);
        expect(read.next.cancel?.refusal).toBe(
            "A visit has been attended, so the treatment can't be cancelled. Refund it instead.",
        );
        // How a treatment leaves changes through its visits, never here.
        expect(read.next.fulfilment?.refusal).toBe(
            "A treatment changes through its visits.",
        );
    });
});
