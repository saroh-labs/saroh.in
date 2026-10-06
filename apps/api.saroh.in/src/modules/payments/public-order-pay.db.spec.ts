/**
 * An order's pay link end to end against a real Postgres (plan B, B11): the
 * link made and replaced, the customer's page (an allow-list), a payment
 * started for what is due and settled by the success webhook (the order
 * paid, its invoice written, the link cleared), an order paid at the
 * counter meanwhile (its link voided, DEC-067), an order cancelled
 * meanwhile (the capture recorded as
 * owed back), and the refusals — no provider, a Razorpay connection with
 * no public key id, a Member, another business.
 *
 * Only the app env is stubbed (for the credential key); the provider and
 * the webhook verifier are the network-free fakes. Runs in the integration
 * project (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import {
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";
import { createHmac } from "node:crypto";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { hashPayToken } from "../invoices/pay-token";
import { takeCounterPaymentInTx } from "../orders/new-order";
import { OrderKitchenService } from "../orders/order-kitchen.service";
import { OrderPayLinkService } from "../orders/order-pay-link.service";
import { OrdersService } from "../orders/orders.service";
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
import { PublicOrderPayService } from "./public-order-pay.service";

const WEBHOOK_SECRET = "whsec_order_pay_test";
const tag = `${process.pid}-${Date.now()}`;

const fake = new FakeMerchantProvider("RAZORPAY");
const payments = new PaymentsService(new FakeProviderFactory(fake));
const payLinks = new OrderPayLinkService();
const publicPay = new PublicOrderPayService(payments);
const kitchen = new OrderKitchenService(payments);
const webhooks = new WebhooksService(
    new FakeWebhookProviderFactory(new FakeWebhookProvider("RAZORPAY")),
    payments,
);
const flags = {
    isEnabled: () => Promise.resolve(true),
} as unknown as FeatureFlagService;
const orders = new OrdersService(new StoresService(flags));

let owner: OrganizationContext;
let member: OrganizationContext;
let storeId: string;
let customerId: string;
let productId: string;
let eventSeq = 0;
let orderSeq = 0;

async function business(name: string) {
    const org = await prisma.organization.create({
        data: { name, slug: `order-pay-${name.toLowerCase()}-${tag}` },
    });
    await giveBusinessDetails(org.id);
    const store = await prisma.store.create({
        data: {
            name,
            slug: `order-pay-store-${name.toLowerCase()}-${tag}`,
            organizationId: org.id,
        },
    });
    const customer = await prisma.customer.create({
        data: {
            storeId: store.id,
            organizationId: org.id,
            email: `asha-${name.toLowerCase()}-${tag}@example.in`,
            firstName: "Asha",
            lastName: "Rao",
            phone: "+919800000000",
        },
    });
    const product = await prisma.product.create({
        data: {
            storeId: store.id,
            organizationId: org.id,
            name: "Sourdough",
            slug: `sourdough-${name.toLowerCase()}-${tag}`,
            price: "250.00",
        },
    });
    return {
        organizationId: org.id,
        storeId: store.id,
        customerId: customer.id,
        productId: product.id,
    };
}

beforeAll(async () => {
    const ownerUser = await prisma.user.create({
        data: { email: `order-pay-owner-${tag}@example.com` },
    });
    const b = await business("Northwind");
    await prisma.membership.create({
        data: {
            organizationId: b.organizationId,
            userId: ownerUser.id,
            role: "OWNER",
        },
    });
    owner = {
        organizationId: b.organizationId,
        userId: ownerUser.id,
        role: "OWNER",
    };
    member = {
        organizationId: b.organizationId,
        userId: "user_member",
        role: "MEMBER",
    };
    storeId = b.storeId;
    customerId = b.customerId;
    productId = b.productId;
    await payments.connectProvider(owner, {
        provider: "RAZORPAY",
        publicKey: "rzp_test_Public1",
        keyId: "rzp_test_Public1",
        keySecret: "rzp_secret",
        webhookSecret: WEBHOOK_SECRET,
    });
});

/** An unpaid order: two sourdough loaves, 500.00. */
async function unpaidOrder(
    over: { storeId?: string; customerId?: string; productId?: string } = {},
    organizationId = owner.organizationId,
): Promise<string> {
    orderSeq += 1;
    const order = await prisma.order.create({
        data: {
            storeId: over.storeId ?? storeId,
            organizationId,
            customerId: over.customerId ?? customerId,
            orderId: `ORD-P${orderSeq}`,
            currency: "INR",
            subtotal: "500.00",
            total: "500.00",
            items: {
                create: [
                    {
                        productId: over.productId ?? productId,
                        quantity: 2,
                        price: "250.00",
                    },
                ],
            },
        },
    });
    return order.id;
}

/** A signed webhook for the fake verifier; each call is a new event. */
async function webhook(event: Record<string, unknown>) {
    eventSeq += 1;
    const raw = Buffer.from(
        JSON.stringify({ providerEventId: `evt_op_${eventSeq}`, ...event }),
    );
    return webhooks.handle("razorpay", owner.organizationId, raw, {
        "x-fake-signature": createHmac("sha256", WEBHOOK_SECRET)
            .update(raw)
            .digest("hex"),
    });
}

const stored = (id: string) =>
    prisma.order.findUniqueOrThrow({
        where: { id },
        select: {
            paymentStatus: true,
            status: true,
            payTokenHash: true,
            payLinkCreatedAt: true,
        },
    });

describe("making an order's pay link (real database)", () => {
    it("hands the link over once, keeps only its hash, and a new one retires the old", async () => {
        const id = await unpaidOrder();
        const first = await payLinks.make(owner, id);
        expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
        const afterFirst = await stored(id);
        expect(afterFirst.payTokenHash).toBe(hashPayToken(first.token));
        expect(afterFirst.payLinkCreatedAt).toEqual(first.payLinkCreatedAt);
        expect((await publicPay.read(first.token)).status).toBe("DUE");

        const second = await payLinks.make(
            owner,
            id,
            new Date(Date.now() + 60_000),
        );
        await expect(publicPay.read(first.token)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        await expect(
            publicPay.createIntent(first.token, {}),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect((await publicPay.read(second.token)).orderNumber).toMatch(
            /^ORD-P/,
        );
        expect((await stored(id)).payLinkCreatedAt).toEqual(
            second.payLinkCreatedAt,
        );
    });

    it("shows `order:read` when a link was made, never the link", async () => {
        const id = await unpaidOrder();
        const { payLinkCreatedAt } = await payLinks.make(owner, id);
        const read = await kitchen.read(owner, id);
        expect(read.payLinkCreatedAt).toEqual(payLinkCreatedAt);
        expect(JSON.stringify(read)).not.toContain("payTokenHash");
        // A Member at the counter reads the kitchen's view without it.
        expect(
            (await kitchen.read(member, id)).payLinkCreatedAt,
        ).toBeUndefined();
    });

    it("is refused to a Member, and another business's order is a 404", async () => {
        const id = await unpaidOrder();
        await expect(payLinks.make(member, id)).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        const other = await business("Elsewhere");
        const theirs = await unpaidOrder(other, other.organizationId);
        await expect(payLinks.make(owner, theirs)).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it("is refused for a paid or cancelled order", async () => {
        const paid = await unpaidOrder();
        await prisma.order.update({
            where: { id: paid },
            data: { paymentStatus: "PAID" },
        });
        await expect(payLinks.make(owner, paid)).rejects.toThrow(
            "This order is already paid.",
        );
        const cancelled = await unpaidOrder();
        await prisma.order.update({
            where: { id: cancelled },
            data: { status: "CANCELLED" },
        });
        await expect(payLinks.make(owner, cancelled)).rejects.toThrow(
            "This order is cancelled, so there's nothing to pay.",
        );
        expect((await stored(paid)).payTokenHash).toBeNull();
    });

    it("says to connect a provider when none is connected", async () => {
        const other = await business("Unconnected");
        const ctx: OrganizationContext = {
            organizationId: other.organizationId,
            userId: "user_other",
            role: "OWNER",
        };
        const id = await unpaidOrder(other, other.organizationId);
        const made = payLinks.make(ctx, id);
        await expect(made).rejects.toBeInstanceOf(ConflictException);
        await expect(payLinks.make(ctx, id)).rejects.toThrow(
            "Connect a payment provider to send a pay link.",
        );
        expect((await stored(id)).payTokenHash).toBeNull();
    });

    it("won't make a link a Razorpay connection without its public key id can't take", async () => {
        const other = await business("Keyless");
        const ctx: OrganizationContext = {
            organizationId: other.organizationId,
            userId: "user_keyless",
            role: "OWNER",
        };
        await payments.connectProvider(ctx, {
            provider: "RAZORPAY",
            keyId: "rzp_test_Keyless1",
            keySecret: "rzp_secret",
            webhookSecret: WEBHOOK_SECRET,
        });
        // A connection made before setup asked for the key id (DEC-054).
        await prisma.merchantPaymentProvider.updateMany({
            where: { organizationId: other.organizationId },
            data: { publicKey: null },
        });
        const id = await unpaidOrder(other, other.organizationId);
        await expect(payLinks.make(ctx, id)).rejects.toThrow(
            "Your Razorpay connection needs its public key id before it can take a pay link. Add it in Settings › Providers.",
        );
    });
});

describe("paying from an order's pay link (real database)", () => {
    it("shows an allow-list, charges what is due, and the success webhook pays the order and clears the link", async () => {
        const id = await unpaidOrder();
        const { token } = await payLinks.make(owner, id);

        const view = await publicPay.read(token);
        expect(view).toEqual({
            businessName: "Northwind",
            orderNumber: expect.stringMatching(/^ORD-P/),
            firstName: "Asha",
            lines: [
                {
                    name: "Sourdough",
                    quantity: 2,
                    unitPrice: "250.00",
                    amount: "500.00",
                },
            ],
            total: "500.00",
            due: "500.00",
            currency: "INR",
            status: "DUE",
            // A provider is connected and the plan takes payment online.
            payOnline: true,
            theme: null,
            // Where the link lives (DEC-069, L6): the apex, the flag off.
            payUrl: `https://saroh.app/pay/o/${token}`,
            // How to pay us (R32): the business set none.
            payInstructions: null,
        });
        // No email, phone, surname or ids reach the page.
        const text = JSON.stringify(view);
        expect(text).not.toContain("@example.in");
        expect(text).not.toContain("+91");
        expect(text).not.toContain("Rao");
        expect(text).not.toContain(id);

        // An amount in the body is ignored: the order says what is due.
        const intent = await publicPay.createIntent(token, {
            idempotencyKey: "tab-1",
            amount: 1,
        });
        expect(intent.amountCents).toBe(50000);
        expect(intent.currency).toBe("INR");
        expect(intent.publicKey).toBe("rzp_test_Public1");
        // The same key replays the first intent.
        expect(
            (await publicPay.createIntent(token, { idempotencyKey: "tab-1" }))
                .paymentIntentId,
        ).toBe(intent.paymentIntentId);

        expect(
            await webhook({
                eventType: "payment.captured",
                outcome: "SUCCEEDED",
                providerIntentId: intent.providerIntentId,
                providerPaymentRef: "pay_order_1",
            }),
        ).toEqual({ status: "processed", changed: true });

        const after = await stored(id);
        expect(after.paymentStatus).toBe("PAID");
        expect(after.payTokenHash).toBeNull();
        expect(after.payLinkCreatedAt).toBeNull();
        // The order's invoice, written by the usual reconciliation.
        const invoice = await prisma.invoice.findFirstOrThrow({
            where: { orderId: id, kind: "INVOICE" },
            select: { status: true, payTokenHash: true },
        });
        expect(invoice).toEqual({ status: "PAID", payTokenHash: null });
        // The link no longer works.
        await expect(publicPay.read(token)).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it("paying at the counter voids the link, so nobody can pay twice (DEC-067)", async () => {
        const id = await unpaidOrder();
        const { token } = await payLinks.make(owner, id);
        await orders.updateStatus(storeId, id, owner.userId, {
            paymentStatus: "PAID",
        });

        expect(await stored(id)).toMatchObject({
            paymentStatus: "PAID",
            payTokenHash: null,
            payLinkCreatedAt: null,
        });
        // The page reads it as a link no longer needed.
        await expect(publicPay.read(token)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        await expect(
            publicPay.createIntent(token, { idempotencyKey: "late" }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(
            await prisma.paymentIntent.count({ where: { orderId: id } }),
        ).toBe(0);
        // Paid by hand, the counter settles any difference: no new link.
        await expect(payLinks.make(owner, id)).rejects.toThrow(
            "This order is already paid.",
        );
    });

    it("a counter payment taken with the order (cash, UPI or card) voids any link too", async () => {
        const id = await unpaidOrder();
        const { token } = await payLinks.make(owner, id);
        await prisma.$transaction((tx) =>
            takeCounterPaymentInTx(tx, {
                orderId: id,
                organizationId: owner.organizationId,
                userId: owner.userId,
                kind: "UPI",
                receivedCents: null,
                at: new Date(),
            }),
        );
        expect(await stored(id)).toMatchObject({
            paymentStatus: "PAID",
            payTokenHash: null,
        });
        await expect(publicPay.read(token)).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it("a payment started before the counter took it can't finish on the voided link", async () => {
        const id = await unpaidOrder();
        const { token } = await payLinks.make(owner, id);
        await publicPay.createIntent(token, { idempotencyKey: "open-tab-2" });
        await orders.updateStatus(storeId, id, owner.userId, {
            paymentStatus: "PAID",
        });
        await expect(
            publicPay.createIntent(token, { idempotencyKey: "open-tab-2" }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("cancelling the order retires its link", async () => {
        const id = await unpaidOrder();
        const { token } = await payLinks.make(owner, id);
        await orders.updateStatus(storeId, id, owner.userId, {
            status: "CANCELLED",
        });
        expect(await stored(id)).toMatchObject({
            status: "CANCELLED",
            payTokenHash: null,
            payLinkCreatedAt: null,
        });
        await expect(publicPay.read(token)).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it("money arriving after the order was cancelled is recorded as needing a refund", async () => {
        const id = await unpaidOrder();
        const { token } = await payLinks.make(owner, id);
        const intent = await publicPay.createIntent(token, {
            idempotencyKey: "open-tab",
        });
        await orders.updateStatus(storeId, id, owner.userId, {
            status: "CANCELLED",
        });

        const success = {
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId: intent.providerIntentId,
            providerPaymentRef: "pay_after_cancel",
        };
        await webhook(success);

        const row = await prisma.paymentIntent.findUniqueOrThrow({
            where: { id: intent.paymentIntentId },
            include: { attempts: true },
        });
        expect(row.status).toBe("SUCCEEDED");
        const owed = row.attempts.filter(
            (a) => a.status === "CAPTURED_NEEDS_REFUND",
        );
        expect(owed).toHaveLength(1);
        expect(owed[0].rawResponse).toEqual({ orderStatus: "CANCELLED" });

        // Razorpay's second event for the same payment records nothing more.
        await webhook({ ...success, eventType: "order.paid" });
        expect(
            await prisma.paymentAttempt.count({
                where: {
                    paymentIntentId: intent.paymentIntentId,
                    status: "CAPTURED_NEEDS_REFUND",
                },
            }),
        ).toBe(1);
    });

    it("a failed payment leaves the link working for another try", async () => {
        const id = await unpaidOrder();
        const { token } = await payLinks.make(owner, id);
        const intent = await publicPay.createIntent(token, {
            idempotencyKey: "first-try",
        });
        await webhook({
            eventType: "payment.failed",
            outcome: "FAILED",
            providerIntentId: intent.providerIntentId,
        });
        expect((await stored(id)).paymentStatus).toBe("FAILED");
        expect((await publicPay.read(token)).status).toBe("DUE");
        // A failed payment can be sent a fresh link, too.
        await expect(payLinks.make(owner, id)).resolves.toHaveProperty("token");
    });
});
