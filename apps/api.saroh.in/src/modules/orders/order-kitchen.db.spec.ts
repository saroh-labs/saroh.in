/**
 * The kitchen flow end to end against a real Postgres (ADR-008, U6): stage
 * moves with their events and stock, undo, refund by line under the order's
 * row lock (a double submit makes one refund; over the cap is refused; a
 * Member is refused), a partial refund webhook leaving the order PAID and
 * partly refunded, and an edit before preparing moving stock and money.
 *
 * Only the app env is stubbed (for the credential key); the provider and the
 * webhook verifier are the network-free fakes. Runs in the integration
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
    BadGatewayException,
    BadRequestException,
    ForbiddenException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";
import { createHmac } from "node:crypto";

import type { OrganizationContext } from "../../common/types/organization-context";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import { RefundCallError } from "../payments/providers/provider.port";
import {
    FakeWebhookProvider,
    FakeWebhookProviderFactory,
} from "../webhooks/providers/fake.webhook";
import { WebhooksService } from "../webhooks/webhooks.service";
import { OrderKitchenService } from "./order-kitchen.service";

const WEBHOOK_SECRET = "whsec_kitchen_test";

const fake = new FakeMerchantProvider("RAZORPAY");
const payments = new PaymentsService(new FakeProviderFactory(fake));
const kitchen = new OrderKitchenService(payments);
const webhooks = new WebhooksService(
    new FakeWebhookProviderFactory(new FakeWebhookProvider("RAZORPAY")),
    payments,
);

let owner: OrganizationContext;
let member: OrganizationContext;
let storeId: string;
let customerId: string;
let bread: string;
let pastry: string;
let eventSeq = 0;

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: `kitchen-org-${process.pid}` },
    });
    owner = { organizationId: org.id, userId: "user_owner", role: "OWNER" };
    member = { organizationId: org.id, userId: "user_member", role: "MEMBER" };
    storeId = (
        await prisma.store.create({
            data: {
                name: "Rye & Co.",
                slug: `kitchen-store-${process.pid}`,
                organizationId: org.id,
            },
        })
    ).id;
    customerId = (
        await prisma.customer.create({
            data: {
                storeId,
                organizationId: org.id,
                email: "asha@example.in",
                firstName: "Asha",
            },
        })
    ).id;
    const product = async (name: string, price: string, stock: number) => {
        const p = await prisma.product.create({
            data: {
                storeId,
                organizationId: org.id,
                name,
                slug: `${name.toLowerCase()}-${process.pid}`,
                price,
            },
        });
        await prisma.inventory.create({
            data: {
                storeId,
                organizationId: org.id,
                productId: p.id,
                quantity: stock,
            },
        });
        return p.id;
    };
    // Every paidOrder() holds its units straight on the rows, without the
    // no-oversell guard, and most orders stay open for the whole file, so
    // the stock must cover all of them (nine orders hold 27 croissants
    // before the edit test asks for one more).
    bread = await product("Sourdough", "250.00", 100);
    pastry = await product("Croissant", "120.00", 100);
    await payments.connectProvider(owner, {
        provider: "RAZORPAY",
        publicKey: "rzp_public",
        keyId: "rzp_key",
        keySecret: "rzp_secret",
        webhookSecret: WEBHOOK_SECRET,
    });
});

/**
 * A paid collection order: one sourdough, three croissants (610.00), stock
 * held on the products' rows, and a succeeded payment for the total.
 */
async function paidOrder(
    over: { paid?: boolean; payments?: number[] } = {},
): Promise<{ id: string; lines: { bread: string; pastry: string } }> {
    const n = await prisma.order.count({ where: { storeId } });
    const order = await prisma.order.create({
        data: {
            storeId,
            organizationId: owner.organizationId,
            customerId,
            orderId: `ORD-${n + 1}`,
            currency: "INR",
            subtotal: "610.00",
            total: "610.00",
            paymentStatus: over.paid === false ? "UNPAID" : "PAID",
            items: {
                create: [
                    {
                        productId: bread,
                        quantity: 1,
                        price: "250.00",
                        stockRow: "PRODUCT",
                    },
                    {
                        productId: pastry,
                        quantity: 3,
                        price: "120.00",
                        stockRow: "PRODUCT",
                    },
                ],
            },
        },
        include: { items: true },
    });
    await prisma.inventory.update({
        where: { productId: bread },
        data: { reserved: { increment: 1 } },
    });
    await prisma.inventory.update({
        where: { productId: pastry },
        data: { reserved: { increment: 3 } },
    });
    if (over.paid !== false) {
        // One payment for the total, or the total paid in parts (an edit's
        // difference taken later), oldest first.
        for (const [i, amountCents] of (over.payments ?? [61000]).entries()) {
            const intent = await prisma.paymentIntent.create({
                data: {
                    organizationId: owner.organizationId,
                    orderId: order.id,
                    provider: "RAZORPAY",
                    providerIntentId:
                        i === 0 ? `prov_${order.id}` : `prov_${order.id}_${i}`,
                    amountCents,
                    currency: "INR",
                    status: "SUCCEEDED",
                    createdAt: new Date(Date.now() - 60_000 + i * 1000),
                },
            });
            await prisma.paymentAttempt.create({
                data: {
                    organizationId: owner.organizationId,
                    paymentIntentId: intent.id,
                    provider: "RAZORPAY",
                    providerRef: `pay_${order.id}_${i}`,
                    status: "CAPTURED",
                },
            });
        }
    }
    const line = (productId: string) =>
        order.items.find((i) => i.productId === productId)?.id ?? "";
    return {
        id: order.id,
        lines: { bread: line(bread), pastry: line(pastry) },
    };
}

async function stock(productId: string) {
    return prisma.inventory.findUniqueOrThrow({
        where: { productId },
        select: { quantity: true, reserved: true },
    });
}

async function webhook(event: Record<string, unknown>) {
    eventSeq += 1;
    const raw = Buffer.from(
        JSON.stringify({ providerEventId: `evt_k_${eventSeq}`, ...event }),
    );
    return webhooks.handle("razorpay", owner.organizationId, raw, {
        "x-fake-signature": createHmac("sha256", WEBHOOK_SECRET)
            .update(raw)
            .digest("hex"),
    });
}

describe("the kitchen flow (real database)", () => {
    it("New → Preparing → Ready → Collected logs three steps, ends DELIVERED and commits stock", async () => {
        const order = await paidOrder();
        const before = await stock(pastry);

        await kitchen.moveStage(member, order.id, { to: "PREPARING" });
        await kitchen.moveStage(member, order.id, { to: "READY" });
        await kitchen.moveStage(member, order.id, { to: "COLLECTED" });

        const row = await prisma.order.findUniqueOrThrow({
            where: { id: order.id },
            include: { events: { orderBy: { createdAt: "asc" } } },
        });
        expect(row).toMatchObject({ stage: "COLLECTED", status: "DELIVERED" });
        expect(row.events.map((e) => e.toStage)).toEqual([
            "PREPARING",
            "READY",
            "COLLECTED",
        ]);
        expect(await stock(pastry)).toEqual({
            quantity: before.quantity - 3,
            reserved: before.reserved - 3,
        });
    });

    it("Undo after Collected restores PROCESSING and the hold, once", async () => {
        const order = await paidOrder();
        await kitchen.moveStage(owner, order.id, { to: "PREPARING" });
        await kitchen.moveStage(owner, order.id, { to: "READY" });
        const held = await stock(pastry);
        const collected = await kitchen.moveStage(owner, order.id, {
            to: "COLLECTED",
        });

        await kitchen.undoStage(owner, order.id, collected.eventId);
        expect(await stock(pastry)).toEqual(held);
        await expect(
            kitchen.undoStage(owner, order.id, collected.eventId),
        ).rejects.toThrow();
        expect(await stock(pastry)).toEqual(held);
        const row = await prisma.order.findUniqueOrThrow({
            where: { id: order.id },
        });
        expect(row).toMatchObject({ stage: "READY", status: "PROCESSING" });
    });

    it("an unpaid order cannot start preparing", async () => {
        const order = await paidOrder({ paid: false });
        await expect(
            kitchen.moveStage(owner, order.id, { to: "PREPARING" }),
        ).rejects.toThrow(/not paid yet/);
    });

    it("a Member's read carries no money", async () => {
        const order = await paidOrder();
        const read = await kitchen.read(member, order.id);
        expect(read.money).toBeNull();
        expect(JSON.stringify(read)).not.toContain("610");
        expect((await kitchen.read(owner, order.id)).money?.total).toBe(
            "610.00",
        );
    });
});

describe("refund by line (real database)", () => {
    it("refunds two of three lines' units, leaving the rest paid; the webhook keeps the order PAID", async () => {
        const order = await paidOrder();
        const refund = await payments.initiateRefund(owner, order.id, {
            lines: [{ itemId: order.lines.pastry, quantity: 2 }],
            idempotencyKey: "k-1",
        });
        expect(refund.amountCents).toBe(24000);

        await webhook({
            eventType: "refund.processed",
            outcome: "REFUNDED",
            providerIntentId: `prov_${order.id}`,
            providerRefundId: refund.providerRefundId,
        });

        const row = await prisma.order.findUniqueOrThrow({
            where: { id: order.id },
        });
        expect(row.paymentStatus).toBe("PAID");
        const read = await kitchen.read(owner, order.id);
        expect(read.refundStanding).toBe("PARTLY_REFUNDED");
        expect(read.money?.refunded).toBe("240.00");
    });

    it("a double-submitted refund makes one refund", async () => {
        const order = await paidOrder();
        const ask = () =>
            payments.initiateRefund(owner, order.id, {
                lines: [{ itemId: order.lines.bread, quantity: 1 }],
                idempotencyKey: "double-tap",
            });
        const [a, b] = await Promise.all([ask(), ask()]);
        expect(a.refundId).toBe(b.refundId);
        expect(
            await prisma.paymentRefund.count({
                where: { paymentIntent: { orderId: order.id } },
            }),
        ).toBe(1);
    });

    it("a line refund above what is left of the line is refused", async () => {
        const order = await paidOrder();
        await payments.initiateRefund(owner, order.id, {
            lines: [{ itemId: order.lines.pastry, quantity: 2 }],
        });
        await expect(
            payments.initiateRefund(owner, order.id, {
                lines: [{ itemId: order.lines.pastry, quantity: 2 }],
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("a Member refunding is refused", async () => {
        const order = await paidOrder();
        await expect(
            payments.initiateRefund(member, order.id, {
                lines: [{ itemId: order.lines.bread, quantity: 1 }],
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("the refund that returns the last of it moves the order to REFUNDED", async () => {
        const order = await paidOrder();
        const refund = await payments.initiateRefund(owner, order.id);
        expect(refund.amountCents).toBe(61000);
        await webhook({
            eventType: "refund.processed",
            outcome: "REFUNDED",
            providerIntentId: `prov_${order.id}`,
            providerRefundId: refund.providerRefundId,
        });
        const row = await prisma.order.findUniqueOrThrow({
            where: { id: order.id },
        });
        expect(row.paymentStatus).toBe("REFUNDED");
    });
});

describe("refunds the provider has not answered for (real database)", () => {
    afterEach(() => jest.restoreAllMocks());

    it("a refund being confirmed holds its money: the next refund gets only the rest", async () => {
        const order = await paidOrder();
        fake.failNextRefund("UNKNOWN");
        const lost = await payments.initiateRefund(owner, order.id, {
            lines: [{ itemId: order.lines.pastry, quantity: 2 }],
        });
        expect(lost.beingConfirmed).toBe(true);
        expect(
            await prisma.paymentRefund.findUniqueOrThrow({
                where: { id: lost.refundId },
            }),
        ).toMatchObject({ status: "PENDING", providerRefundId: null });

        const rest = await payments.initiateRefund(owner, order.id);
        expect(rest.amountCents).toBe(61000 - 24000);
    });

    it("try-again finds the refund the lost call made — one refund at the provider, one step", async () => {
        const order = await paidOrder();
        fake.failNextRefund("UNKNOWN", { madeAnyway: true });
        const lost = await payments.initiateRefund(owner, order.id, {
            lines: [{ itemId: order.lines.bread, quantity: 1 }],
        });
        const calls = fake.refundCalls.length;

        const settled = await payments.retryRefund(
            owner,
            order.id,
            lost.refundId,
        );

        expect(settled.beingConfirmed).toBe(false);
        expect(fake.refundCalls).toHaveLength(calls);
        const steps = await prisma.orderEvent.findMany({
            where: { orderId: order.id, kind: "REFUND" },
        });
        expect(steps.map((e) => e.amountCents)).toEqual([25000]);
    });

    it("split across two payments: a refused part frees only its own lines", async () => {
        // ₹250 paid first, ₹360 later; a full refund comes back newest first.
        const order = await paidOrder({ payments: [25000, 36000] });
        const original = FakeMerchantProvider.prototype.refund;
        jest.spyOn(fake, "refund")
            .mockImplementationOnce((input) => original.call(fake, input))
            .mockRejectedValueOnce(new RefundCallError("no", "REFUSED"));

        const result = await payments.initiateRefund(owner, order.id);

        expect(result.refunds.map((r) => [r.amountCents, r.status])).toEqual([
            [36000, "PENDING"],
            [25000, "FAILED"],
        ]);
        const rows = await prisma.paymentRefund.findMany({
            where: { paymentIntent: { orderId: order.id } },
            include: { lines: true },
        });
        const taken = rows.find((r) => r.status === "PENDING");
        const failed = rows.find((r) => r.status === "FAILED");
        // Each line rides whole on one part.
        const onTaken = new Set(taken?.lines.map((l) => l.orderItemId));
        const onFailed = new Set(failed?.lines.map((l) => l.orderItemId));
        expect(onTaken.size + onFailed.size).toBe(2);

        const read = await kitchen.read(owner, order.id);
        for (const line of read.items) {
            expect(line.refundedQuantity).toBe(
                onTaken.has(line.id) ? line.quantity : 0,
            );
        }
        const steps = await prisma.orderEvent.findMany({
            where: { orderId: order.id, kind: "REFUND" },
        });
        expect(steps.map((e) => e.amountCents)).toEqual([36000]);

        // What the refused part held is refundable again.
        const again = await payments.initiateRefund(owner, order.id);
        expect(again.amountCents).toBe(25000);
    });

    it("every part refused: nothing went back, and it says so", async () => {
        const order = await paidOrder({ payments: [25000, 36000] });
        fake.failNextRefund("REFUSED");
        fake.failNextRefund("REFUSED");

        await expect(
            payments.initiateRefund(owner, order.id),
        ).rejects.toBeInstanceOf(BadGatewayException);
        expect(
            await prisma.paymentRefund.count({
                where: {
                    paymentIntent: { orderId: order.id },
                    status: { not: "FAILED" },
                },
            }),
        ).toBe(0);
    });
});

describe("editing before preparing (real database)", () => {
    it("a quantity up takes the difference and reserves stock; down refunds and releases", async () => {
        const order = await paidOrder();
        const before = await stock(pastry);

        const up = await kitchen.edit(owner, order.id, {
            lines: [{ itemId: order.lines.pastry, quantity: 4 }],
        });
        expect(up.differenceCents).toBe(12000);
        expect(up.charge?.amountCents).toBe(12000);
        expect((await stock(pastry)).reserved).toBe(before.reserved + 1);

        const down = await kitchen.edit(owner, order.id, {
            lines: [{ itemId: order.lines.pastry, quantity: 2 }],
        });
        expect(down.differenceCents).toBe(-24000);
        // The +120 was never paid, so only what was paid beyond the new
        // total goes back.
        expect(down.settleCents).toBe(-12000);
        expect(down.refund?.amountCents).toBe(12000);
        expect((await stock(pastry)).reserved).toBe(before.reserved - 1);

        const row = await prisma.order.findUniqueOrThrow({
            where: { id: order.id },
        });
        expect(row.total.toString()).toBe("490");
    });

    it("items cannot change after preparing starts", async () => {
        const order = await paidOrder();
        await kitchen.moveStage(owner, order.id, { to: "PREPARING" });
        await expect(
            kitchen.edit(owner, order.id, {
                lines: [{ itemId: order.lines.bread, quantity: 2 }],
            }),
        ).rejects.toThrow(/before the order starts preparing/);
    });
});
