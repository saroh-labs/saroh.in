/**
 * Orders hold, sell and release at the storefront (#511), against a real
 * Postgres: no overselling under concurrency, holds per storefront, refunds
 * releasing only when the provider confirms them (once, however often the
 * webhook comes), "Put N back in stock", the kitchen undo, reserveOnPayment's
 * refusal contract, and a refund webhook racing a cancel without deadlock.
 *
 * After every test the invariant holds: each row's promised is the sum of
 * its lines' heldQuantity, and each row's log adds up to what is on hand.
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { createHmac } from "node:crypto";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { OrderKitchenService } from "../orders/order-kitchen.service";
import { OrdersService } from "../orders/orders.service";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import { StoresService } from "../stores/stores.service";
import {
    FakeWebhookProvider,
    FakeWebhookProviderFactory,
} from "../webhooks/providers/fake.webhook";
import { WebhooksService } from "../webhooks/webhooks.service";
import { reserveOnPayment, soldOutRefundKey, uncommitLines } from "./reserve";
import { SOLD_OUT_WHILE_PAYING } from "./stock-words";
import { count } from "./stock.service";

const WEBHOOK_SECRET = "whsec_reserve_test";
const tag = `${process.pid}-${Date.now()}`;

const flags = {
    isEnabled: () => Promise.resolve(true),
} as unknown as FeatureFlagService;
const stores = new StoresService(flags);
const orders = new OrdersService(stores);
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
let hill = "";
let online = "";
const customer: Record<string, string> = {};
let eventSeq = 0;
let productSeq = 0;

beforeAll(async () => {
    ownerId = (
        await prisma.user.create({
            data: { email: `rs-owner-${tag}@example.com` },
        })
    ).id;
    orgId = (
        await prisma.organization.create({
            data: { name: "Rye & Co.", slug: `rs-rye-${tag}` },
        })
    ).id;
    await prisma.membership.create({
        data: { organizationId: orgId, userId: ownerId, role: "OWNER" },
    });
    owner = { organizationId: orgId, userId: ownerId, role: "OWNER" };
    const storefront = async (name: string) =>
        (
            await prisma.store.create({
                data: {
                    name,
                    slug: `rs-${name.toLowerCase().replace(/\s+/g, "-")}-${tag}`,
                    organizationId: orgId,
                },
            })
        ).id;
    hill = await storefront("Hill Road");
    online = await storefront("Online");
    for (const storeId of [hill, online]) {
        customer[storeId] = (
            await prisma.customer.create({
                data: {
                    storeId,
                    organizationId: orgId,
                    email: `rs-buyer-${tag}@example.com`,
                    firstName: "Asha",
                },
            })
        ).id;
    }
    await payments.connectProvider(owner, {
        provider: "RAZORPAY",
        publicKey: "rzp_public",
        keyId: "rzp_key",
        keySecret: "rzp_secret",
        webhookSecret: WEBHOOK_SECRET,
    });
});

afterEach(async () => {
    // The invariant (#511): promised = what open lines hold, on every row;
    // the log adds up to what is on hand.
    const rows = await prisma.stockLevel.findMany({
        where: { organizationId: orgId },
        select: {
            id: true,
            onHand: true,
            promised: true,
            orderItems: { select: { heldQuantity: true } },
            entries: { select: { quantity: true, before: true, after: true } },
        },
    });
    for (const row of rows) {
        expect(row.promised).toBeGreaterThanOrEqual(0);
        expect({ id: row.id, promised: row.promised }).toEqual({
            id: row.id,
            promised: row.orderItems.reduce((s, i) => s + i.heldQuantity, 0),
        });
        expect({ id: row.id, onHand: row.onHand }).toEqual({
            id: row.id,
            onHand: row.entries.reduce((s, e) => s + e.quantity, 0),
        });
        for (const e of row.entries)
            expect(e.before + e.quantity).toBe(e.after);
    }
    // Lines on cancelled or fulfilled orders hold nothing.
    const stray = await prisma.orderItem.count({
        where: {
            order: {
                organizationId: orgId,
                status: { in: ["CANCELLED", "SHIPPED", "DELIVERED"] },
            },
            heldQuantity: { not: 0 },
        },
    });
    expect(stray).toBe(0);
});

/** A product listed at both storefronts, counted at each (a log entry). */
async function product(
    name: string,
    stock: { hill?: number; online?: number },
    price = "100.00",
): Promise<string> {
    productSeq += 1;
    const p = await prisma.product.create({
        data: {
            storeId: hill,
            organizationId: orgId,
            name,
            slug: `rs-${productSeq}-${tag}`,
            price,
        },
    });
    for (const [storeId, n] of [
        [hill, stock.hill],
        [online, stock.online],
    ] as const) {
        await prisma.productListing.create({
            data: { storeId, organizationId: orgId, productId: p.id },
        });
        if (n !== undefined) {
            await prisma.$transaction((tx) =>
                count(
                    tx,
                    { organizationId: orgId, userId: ownerId },
                    { target: { storeId, productId: p.id }, counted: n },
                ),
            );
        }
    }
    return p.id;
}

async function shelf(storeId: string, productId: string) {
    const row = await prisma.stockLevel.findFirstOrThrow({
        where: { storeId, productId, variantId: null },
        select: { id: true, onHand: true, promised: true },
    });
    return row;
}

async function place(
    storeId: string,
    items: { productId: string; quantity: number; variantId?: string }[],
): Promise<string> {
    return (
        await orders.create(storeId, ownerId, {
            customerId: customer[storeId],
            items,
        })
    ).id;
}

async function line(orderId: string, productId: string): Promise<string> {
    return (
        await prisma.orderItem.findFirstOrThrow({
            where: { orderId, productId },
            select: { id: true },
        })
    ).id;
}

/** Mark an order paid online, in full: one succeeded payment. */
async function pay(orderId: string): Promise<string> {
    const order = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { total: true },
    });
    const intent = await prisma.paymentIntent.create({
        data: {
            organizationId: orgId,
            orderId,
            provider: "RAZORPAY",
            providerIntentId: `prov_${orderId}`,
            amountCents: Math.round(Number(order.total) * 100),
            currency: "INR",
            status: "SUCCEEDED",
        },
    });
    await prisma.paymentAttempt.create({
        data: {
            organizationId: orgId,
            paymentIntentId: intent.id,
            provider: "RAZORPAY",
            providerRef: `pay_${orderId}`,
            status: "CAPTURED",
        },
    });
    await prisma.order.update({
        where: { id: orderId },
        data: { paymentStatus: "PAID" },
    });
    return intent.id;
}

function webhook(event: Record<string, unknown>) {
    eventSeq += 1;
    const raw = Buffer.from(
        JSON.stringify({ providerEventId: `evt_rs_${eventSeq}`, ...event }),
    );
    return webhooks.handle("razorpay", orgId, raw, {
        "x-fake-signature": createHmac("sha256", WEBHOOK_SECRET)
            .update(raw)
            .digest("hex"),
    });
}

/** The provider confirms a refund Saroh made. */
function confirmRefund(orderId: string, providerRefundId: string | null) {
    return webhook({
        eventType: "refund.processed",
        outcome: "REFUNDED",
        providerIntentId: `prov_${orderId}`,
        providerRefundId,
    });
}

async function fulfil(orderId: string) {
    await orders.updateStatus(hill, orderId, ownerId, { status: "PROCESSING" });
    await orders.updateStatus(hill, orderId, ownerId, { status: "DELIVERED" });
}

const entriesOf = (stockLevelId: string, orderId?: string) =>
    prisma.stockEntry.findMany({
        where: { stockLevelId, ...(orderId ? { orderId } : {}) },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { kind: true, quantity: true },
    });

describe("holding at the storefront", () => {
    it("two orders for the last unit at once: one holds it, the other is told Sold out", async () => {
        const loaf = await product("Rye loaf", { hill: 1 });
        const results = await Promise.allSettled([
            place(hill, [{ productId: loaf, quantity: 1 }]),
            place(hill, [{ productId: loaf, quantity: 1 }]),
        ]);
        const won = results.filter((r) => r.status === "fulfilled");
        const lost = results.flatMap((r) =>
            r.status === "rejected" ? [r.reason as unknown] : [],
        );
        expect(won).toHaveLength(1);
        expect(lost).toHaveLength(1);
        expect(lost[0]).toBeInstanceOf(ConflictException);
        expect((lost[0] as ConflictException).message).toBe(
            "Rye loaf — Sold out",
        );
        expect(await shelf(hill, loaf)).toMatchObject({
            onHand: 1,
            promised: 1,
        });
    });

    it("10 on hand, orders for 10: Sold out there, and an 11th is refused; cancelling gives its units back", async () => {
        const bun = await product("Bun", { hill: 10 });
        const first = await place(hill, [{ productId: bun, quantity: 4 }]);
        await place(hill, [{ productId: bun, quantity: 6 }]);
        expect(await shelf(hill, bun)).toMatchObject({
            onHand: 10,
            promised: 10,
        });
        await expect(
            place(hill, [{ productId: bun, quantity: 1 }]),
        ).rejects.toThrow("Bun — Sold out");

        await orders.updateStatus(hill, first, ownerId, {
            status: "CANCELLED",
        });
        expect(await shelf(hill, bun)).toMatchObject({
            onHand: 10,
            promised: 6,
        });
        await expect(
            place(hill, [{ productId: bun, quantity: 5 }]),
        ).rejects.toThrow("Bun — Only 4 left at Hill Road");
        // Holding and releasing are promises: the log has only the count.
        const row = await shelf(hill, bun);
        expect((await entriesOf(row.id)).map((e) => e.kind)).toEqual([
            "COUNTED",
        ]);
    });

    it("10 at Hill Road, 0 at Online: Online is Sold out, Hill Road sells", async () => {
        const jam = await product("Jam", { hill: 10, online: 0 });
        await expect(
            place(online, [{ productId: jam, quantity: 1 }]),
        ).rejects.toThrow("Jam — Sold out");
        await place(hill, [{ productId: jam, quantity: 2 }]);
        expect(await shelf(hill, jam)).toMatchObject({ promised: 2 });
        expect(await shelf(online, jam)).toMatchObject({ promised: 0 });
    });

    it("a line placed while untracked stays untracked after tracking is turned on", async () => {
        const tea = await product("Tea", {});
        const order = await place(hill, [{ productId: tea, quantity: 3 }]);
        const item = await prisma.orderItem.findFirstOrThrow({
            where: { orderId: order },
        });
        expect(item).toMatchObject({ stockRow: "NONE", stockLevelId: null });
        // Tracking turned on: the shelf is counted into being.
        await prisma.$transaction((tx) =>
            count(
                tx,
                { organizationId: orgId, userId: ownerId },
                { target: { storeId: hill, productId: tea }, counted: 5 },
            ),
        );
        await fulfil(order);
        const row = await shelf(hill, tea);
        expect(row).toMatchObject({ onHand: 5, promised: 0 });
        expect(
            await prisma.orderItem.findUniqueOrThrow({
                where: { id: item.id },
            }),
        ).toMatchObject({ stockRow: "NONE", stockLevelId: null });
    });
});

describe("editing an order before preparing", () => {
    it("refuses a variant the storefront doesn't sell; quantity changes write no entries", async () => {
        const tee = await prisma.product.create({
            data: {
                storeId: hill,
                organizationId: orgId,
                name: "Tee",
                slug: `rs-tee-${tag}`,
                price: "500.00",
                variants: {
                    create: [
                        { sku: `S-${tag}`, title: "S" },
                        { sku: `M-${tag}`, title: "M" },
                    ],
                },
            },
            include: { variants: { orderBy: { title: "desc" } } },
        });
        const [small, medium] = tee.variants;
        const listing = await prisma.productListing.create({
            data: { storeId: hill, organizationId: orgId, productId: tee.id },
        });
        // Hill Road sells only S.
        await prisma.productListingVariant.create({
            data: {
                organizationId: orgId,
                listingId: listing.id,
                productId: tee.id,
                variantId: small.id,
            },
        });
        const sRow = (
            await prisma.$transaction((tx) =>
                count(
                    tx,
                    { organizationId: orgId, userId: ownerId },
                    {
                        target: {
                            storeId: hill,
                            productId: tee.id,
                            variantId: small.id,
                        },
                        counted: 5,
                    },
                ),
            )
        ).shelf.stockLevelId;

        const order = await place(hill, [
            { productId: tee.id, variantId: small.id, quantity: 2 },
        ]);
        await expect(
            kitchen.edit(owner, order, {
                add: [{ productId: tee.id, variantId: medium.id, quantity: 1 }],
            }),
        ).rejects.toThrow("isn't sold at this storefront");

        const item = await line(order, tee.id);
        await kitchen.edit(owner, order, {
            lines: [{ itemId: item, quantity: 4 }],
        });
        expect(
            await prisma.stockLevel.findUniqueOrThrow({ where: { id: sRow } }),
        ).toMatchObject({ onHand: 5, promised: 4 });
        await expect(
            kitchen.edit(owner, order, {
                lines: [{ itemId: item, quantity: 6 }],
            }),
        ).rejects.toThrow("Tee — Only 1 left at Hill Road");
        await kitchen.edit(owner, order, {
            lines: [{ itemId: item, quantity: 1 }],
        });
        expect(
            await prisma.stockLevel.findUniqueOrThrow({ where: { id: sRow } }),
        ).toMatchObject({ onHand: 5, promised: 1 });
        expect((await entriesOf(sRow)).map((e) => e.kind)).toEqual(["COUNTED"]);
    });
});

describe("refunds and the shelf", () => {
    it("a line refund confirmed, then the order cancelled: the line is released once", async () => {
        const cake = await product("Cake", { hill: 10 });
        const order = await place(hill, [{ productId: cake, quantity: 3 }]);
        await pay(order);
        const item = await line(order, cake);
        const refund = await payments.initiateRefund(owner, order, {
            lines: [{ itemId: item, quantity: 2 }],
        });
        // Asked, not confirmed: nothing moves yet.
        expect(await shelf(hill, cake)).toMatchObject({ promised: 3 });
        await confirmRefund(order, refund.providerRefundId);
        expect(await shelf(hill, cake)).toMatchObject({ promised: 1 });

        await orders.updateStatus(hill, order, ownerId, {
            status: "CANCELLED",
        });
        expect(await shelf(hill, cake)).toMatchObject({
            onHand: 10,
            promised: 0,
        });
    });

    it("a line refund confirmed, then the rest fulfilled: only what is still held is sold", async () => {
        const pie = await product("Pie", { hill: 10 });
        const order = await place(hill, [{ productId: pie, quantity: 3 }]);
        await pay(order);
        const refund = await payments.initiateRefund(owner, order, {
            lines: [{ itemId: await line(order, pie), quantity: 1 }],
        });
        await confirmRefund(order, refund.providerRefundId);
        await fulfil(order);
        const row = await shelf(hill, pie);
        expect(row).toMatchObject({ onHand: 8, promised: 0 });
        expect(await entriesOf(row.id, order)).toEqual([
            { kind: "SOLD", quantity: -2 },
        ]);
    });

    it("a refund still pending when the order is fulfilled, then confirmed: stock unchanged", async () => {
        const tart = await product("Tart", { hill: 10 });
        const order = await place(hill, [{ productId: tart, quantity: 2 }]);
        await pay(order);
        const refund = await payments.initiateRefund(owner, order, {
            lines: [{ itemId: await line(order, tart), quantity: 2 }],
        });
        await fulfil(order);
        const before = await shelf(hill, tart);
        expect(before).toMatchObject({ onHand: 8, promised: 0 });
        await confirmRefund(order, refund.providerRefundId);
        expect(await shelf(hill, tart)).toEqual(before);
    });

    it("the refund webhook delivered twice releases once", async () => {
        const scone = await product("Scone", { hill: 10 });
        const a = await place(hill, [{ productId: scone, quantity: 4 }]);
        await place(hill, [{ productId: scone, quantity: 2 }]);
        await pay(a);
        const refund = await payments.initiateRefund(owner, a, {
            lines: [{ itemId: await line(a, scone), quantity: 1 }],
        });
        await confirmRefund(a, refund.providerRefundId);
        // A second event for the same refund (Razorpay sends two).
        await webhook({
            eventType: "payment.refunded",
            outcome: "REFUNDED",
            providerIntentId: `prov_${a}`,
            providerRefundId: refund.providerRefundId,
        });
        expect(await shelf(hill, scone)).toMatchObject({ promised: 5 });
    });

    it("after fulfilment, 'Put 2 back in stock' adds 2 on confirmation with a Returned entry; without it nothing changes", async () => {
        const mug = await product("Mug", { hill: 10 });
        const order = await place(hill, [{ productId: mug, quantity: 3 }]);
        await pay(order);
        await fulfil(order);
        const item = await line(order, mug);
        expect(await shelf(hill, mug)).toMatchObject({ onHand: 7 });

        // More than was sold can't go back.
        await expect(
            payments.initiateRefund(owner, order, {
                lines: [{ itemId: item, quantity: 2 }],
                putBack: [{ itemId: item, quantity: 3 }],
            }),
        ).rejects.toThrow("Put back no more than is being refunded.");

        // The refund sheet offers what was handed over.
        const returnable = async () =>
            (await kitchen.read(owner, order)).items[0].returnable;
        expect(await returnable()).toBe(3);

        const withPutBack = await payments.initiateRefund(owner, order, {
            lines: [{ itemId: item, quantity: 2 }],
            putBack: [{ itemId: item, quantity: 2 }],
        });
        expect(await returnable()).toBe(1);
        expect(await shelf(hill, mug)).toMatchObject({ onHand: 7 });
        await confirmRefund(order, withPutBack.providerRefundId);
        const row = await shelf(hill, mug);
        expect(row).toMatchObject({ onHand: 9, promised: 0 });
        expect(await entriesOf(row.id, order)).toEqual([
            { kind: "SOLD", quantity: -3 },
            { kind: "RETURNED", quantity: 2 },
        ]);

        const without = await payments.initiateRefund(owner, order, {
            lines: [{ itemId: item, quantity: 1 }],
        });
        await confirmRefund(order, without.providerRefundId);
        expect(await shelf(hill, mug)).toMatchObject({ onHand: 9 });
    });

    it("put back never more than sold less what went back already", async () => {
        const cup = await product("Cup", { hill: 10 });
        const order = await place(hill, [{ productId: cup, quantity: 2 }]);
        await pay(order);
        await fulfil(order);
        const item = await line(order, cup);
        await payments.initiateRefund(owner, order, {
            lines: [{ itemId: item, quantity: 1 }],
            putBack: [{ itemId: item, quantity: 1 }],
        });
        // The first is still being confirmed; its put-back counts.
        await payments.initiateRefund(owner, order, {
            lines: [{ itemId: item, quantity: 1 }],
            putBack: [{ itemId: item, quantity: 1 }],
        });
        const row = await prisma.orderItem.findUniqueOrThrow({
            where: { id: item },
            include: { refundLines: true },
        });
        expect(row.refundLines.reduce((s, l) => s + l.putBackQuantity, 0)).toBe(
            2,
        );

        // Nothing was handed over yet: nothing can go back on the shelf.
        const open = await place(hill, [{ productId: cup, quantity: 2 }]);
        await pay(open);
        const openItem = await line(open, cup);
        await expect(
            payments.initiateRefund(owner, open, {
                lines: [{ itemId: openItem, quantity: 1 }],
                putBack: [{ itemId: openItem, quantity: 1 }],
            }),
        ).rejects.toThrow("None of that line can go back in stock");
    });

    it("a refund the provider fails, with 'Put back' ticked: no Returned entry", async () => {
        const bowl = await product("Bowl", { hill: 10 });
        const order = await place(hill, [{ productId: bowl, quantity: 2 }]);
        await pay(order);
        await fulfil(order);
        const item = await line(order, bowl);
        const refund = await payments.initiateRefund(owner, order, {
            lines: [{ itemId: item, quantity: 2 }],
            putBack: [{ itemId: item, quantity: 2 }],
        });
        await webhook({
            eventType: "refund.failed",
            outcome: "REFUND_FAILED",
            providerIntentId: `prov_${order}`,
            providerRefundId: refund.providerRefundId,
        });
        const row = await shelf(hill, bowl);
        expect(row).toMatchObject({ onHand: 8 });
        expect((await entriesOf(row.id, order)).map((e) => e.kind)).toEqual([
            "SOLD",
        ]);
    });

    it("a dashboard refund with no lines: partial releases nothing; bringing the order to fully refunded releases the rest", async () => {
        const vase = await product("Vase", { hill: 10 });
        const order = await place(hill, [{ productId: vase, quantity: 2 }]);
        await pay(order); // 200.00
        await webhook({
            eventType: "refund.processed",
            outcome: "REFUNDED",
            providerIntentId: `prov_${order}`,
            providerRefundId: `dash_1_${order}`,
            refundAmountCents: 5000,
        });
        expect(await shelf(hill, vase)).toMatchObject({ promised: 2 });
        await webhook({
            eventType: "refund.processed",
            outcome: "REFUNDED",
            providerIntentId: `prov_${order}`,
            providerRefundId: `dash_2_${order}`,
            refundAmountCents: 15000,
        });
        expect(await shelf(hill, vase)).toMatchObject({
            onHand: 10,
            promised: 0,
        });
        expect(
            await prisma.order.findUniqueOrThrow({ where: { id: order } }),
        ).toMatchObject({ paymentStatus: "REFUNDED" });
    });
});

describe("the kitchen and the shelf", () => {
    it("fulfil → undo → fulfil nets −q, with Sold, Reversed, Sold entries", async () => {
        const loaf = await product("Seeded loaf", { hill: 10 });
        const order = await place(hill, [{ productId: loaf, quantity: 3 }]);
        await pay(order);
        await kitchen.moveStage(owner, order, { to: "PREPARING" });
        await kitchen.moveStage(owner, order, { to: "READY" });
        const collected = await kitchen.moveStage(owner, order, {
            to: "COLLECTED",
        });
        await kitchen.undoStage(owner, order, collected.eventId);
        expect(await shelf(hill, loaf)).toMatchObject({
            onHand: 10,
            promised: 3,
        });
        await kitchen.moveStage(owner, order, { to: "COLLECTED" });
        const row = await shelf(hill, loaf);
        expect(row).toMatchObject({ onHand: 7, promised: 0 });
        const entries = await prisma.stockEntry.findMany({
            where: { stockLevelId: row.id, orderId: order },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: { kind: true, quantity: true, actorUserId: true },
        });
        expect(entries).toEqual([
            { kind: "SOLD", quantity: -3, actorUserId: ownerId },
            { kind: "REVERSED", quantity: 3, actorUserId: ownerId },
            { kind: "SOLD", quantity: -3, actorUserId: ownerId },
        ]);
    });

    it("undo is refused once a line has a confirmed refund", async () => {
        const bagel = await product("Bagel", { hill: 10 });
        const order = await place(hill, [{ productId: bagel, quantity: 2 }]);
        await pay(order);
        await kitchen.moveStage(owner, order, { to: "PREPARING" });
        await kitchen.moveStage(owner, order, { to: "READY" });
        const collected = await kitchen.moveStage(owner, order, {
            to: "COLLECTED",
        });
        const item = await line(order, bagel);
        const refund = await payments.initiateRefund(owner, order, {
            lines: [{ itemId: item, quantity: 1 }],
            putBack: [{ itemId: item, quantity: 1 }],
        });
        await confirmRefund(order, refund.providerRefundId);
        // The refund is the order's last step now, so the kitchen's Undo
        // is gone; the stock rule refuses it on its own as well.
        await expect(
            kitchen.undoStage(owner, order, collected.eventId),
        ).rejects.toThrow();
        await expect(
            prisma.$transaction((tx) => uncommitLines(tx, [item], ownerId)),
        ).rejects.toThrow("can't be taken back");
        expect(await shelf(hill, bagel)).toMatchObject({
            onHand: 9,
            promised: 0,
        });
    });
});

describe("online orders: reserveOnPayment", () => {
    async function onlineOrder(productId: string, quantity: number) {
        const order = await prisma.order.create({
            data: {
                storeId: online,
                organizationId: orgId,
                customerId: customer[online],
                orderId: `WEB-${Math.random().toString(36).slice(2, 8)}`,
                currency: "INR",
                subtotal: "100.00",
                total: "100.00",
                items: { create: [{ productId, quantity, price: "100.00" }] },
            },
        });
        const intent = await prisma.paymentIntent.create({
            data: {
                organizationId: orgId,
                orderId: order.id,
                provider: "RAZORPAY",
                providerIntentId: `prov_${order.id}`,
                amountCents: 10000,
                currency: "INR",
                status: "SUCCEEDED",
            },
        });
        await prisma.paymentAttempt.create({
            data: {
                organizationId: orgId,
                paymentIntentId: intent.id,
                provider: "RAZORPAY",
                providerRef: `pay_${order.id}`,
                status: "CAPTURED",
            },
        });
        return { orderId: order.id, paymentIntentId: intent.id };
    }

    it("the winner holds once; the loser's refusal is recorded once with one refund, sent once", async () => {
        const last = await product("Last candle", { online: 1 });
        const a = await onlineOrder(last, 1);
        const b = await onlineOrder(last, 1);
        const reserve = (x: { orderId: string; paymentIntentId: string }) =>
            prisma.$transaction((tx) =>
                reserveOnPayment(tx, { organizationId: orgId, ...x }),
            );

        expect(await reserve(a)).toEqual({ kind: "HELD" });
        expect(await reserve(a)).toEqual({ kind: "HELD" });
        const first = await reserve(b);
        const second = await reserve(b);
        expect(first).toMatchObject({
            kind: "REFUSED",
            created: true,
            message: SOLD_OUT_WHILE_PAYING,
        });
        expect(second).toMatchObject({ kind: "REFUSED", created: false });
        if (first.kind !== "REFUSED" || second.kind !== "REFUSED") {
            throw new Error("expected refusals");
        }
        expect(second.refundId).toBe(first.refundId);

        const refunds = await prisma.paymentRefund.findMany({
            where: { paymentIntentId: b.paymentIntentId },
        });
        expect(refunds).toHaveLength(1);
        expect(refunds[0]).toMatchObject({
            amountCents: 10000,
            idempotencyKey: soldOutRefundKey(b.paymentIntentId),
        });
        expect(
            await prisma.paymentAttempt.count({
                where: {
                    paymentIntentId: b.paymentIntentId,
                    status: "CAPTURED_NEEDS_REFUND",
                },
            }),
        ).toBe(1);

        const calls = fake.refundCalls.length;
        await payments.sendAutomaticRefund(orgId, first.refundId);
        await payments.sendAutomaticRefund(orgId, first.refundId);
        expect(fake.refundCalls.length).toBe(calls + 1);
        expect(fake.refundCalls.at(-1)).toMatchObject({
            reference: first.refundId,
            amountCents: 10000,
        });
        expect(await shelf(online, last)).toMatchObject({
            onHand: 1,
            promised: 1,
        });
    });
});

describe("lock order", () => {
    it("a refund webhook racing a cancel on the same order doesn't deadlock, and releases once", async () => {
        for (let i = 0; i < 6; i++) {
            const roll = await product(`Roll ${i}`, { hill: 10 });
            const order = await place(hill, [{ productId: roll, quantity: 3 }]);
            await pay(order);
            const refund = await payments.initiateRefund(owner, order, {
                lines: [{ itemId: await line(order, roll), quantity: 2 }],
            });
            const [hook, cancel] = await Promise.allSettled([
                confirmRefund(order, refund.providerRefundId),
                orders.updateStatus(hill, order, ownerId, {
                    status: "CANCELLED",
                }),
            ]);
            expect(cancel.status).toBe("fulfilled");
            expect(hook).toMatchObject({
                status: "fulfilled",
                value: { status: "processed" },
            });
            expect(await shelf(hill, roll)).toMatchObject({
                onHand: 10,
                promised: 0,
            });
        }
    });
});
