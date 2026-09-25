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
import { DateTime } from "luxon";
import { createHmac } from "node:crypto";

import type { OrganizationContext } from "../../common/types/organization-context";
import { CalendarService } from "../calendar/calendar.service";
import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { ensureOrderInvoice } from "../invoices/order-invoicing";
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
// Each product's shelf at the storefront (#510: StockLevel).
const shelf: Record<string, string> = {};
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
        await prisma.productListing.create({
            data: { storeId, organizationId: org.id, productId: p.id },
        });
        shelf[p.id] = (
            await prisma.stockLevel.create({
                data: {
                    storeId,
                    organizationId: org.id,
                    productId: p.id,
                    onHand: stock,
                },
            })
        ).id;
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
                        stockLevelId: shelf[bread],
                        heldQuantity: 1,
                    },
                    {
                        productId: pastry,
                        quantity: 3,
                        price: "120.00",
                        stockRow: "PRODUCT",
                        stockLevelId: shelf[pastry],
                        heldQuantity: 3,
                    },
                ],
            },
        },
        include: { items: true },
    });
    await prisma.stockLevel.update({
        where: { id: shelf[bread] },
        data: { promised: { increment: 1 } },
    });
    await prisma.stockLevel.update({
        where: { id: shelf[pastry] },
        data: { promised: { increment: 3 } },
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
    const row = await prisma.stockLevel.findUniqueOrThrow({
        where: { id: shelf[productId] },
        select: { onHand: true, promised: true },
    });
    return { quantity: row.onHand, reserved: row.promised };
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

describe("a later edit supersedes an unpaid difference (real database)", () => {
    /** The order's edit charges, oldest first. */
    async function differenceIntents(orderId: string) {
        return prisma.paymentIntent.findMany({
            where: { orderId, idempotencyKey: { startsWith: "order-edit:" } },
            orderBy: { createdAt: "asc" },
            select: { id: true, amountCents: true, status: true },
        });
    }

    /**
     * The fake provider names every intent of an order alike; a real one
     * does not, and the webhook finds an intent by that name.
     */
    async function nameApart(orderId: string) {
        for (const i of await differenceIntents(orderId)) {
            await prisma.paymentIntent.update({
                where: { id: i.id },
                data: { providerIntentId: `prov_${i.id}` },
            });
        }
    }

    it("edited up twice: only the latest charge is open, for the whole difference", async () => {
        const order = await paidOrder();
        await kitchen.edit(owner, order.id, {
            lines: [{ itemId: order.lines.pastry, quantity: 4 }],
        });
        const second = await kitchen.edit(owner, order.id, {
            lines: [{ itemId: order.lines.pastry, quantity: 5 }],
        });
        expect(second.charge?.amountCents).toBe(24000);
        expect(
            (await differenceIntents(order.id)).map((i) => [
                i.amountCents,
                i.status,
            ]),
        ).toEqual([
            [12000, "SUPERSEDED"],
            [24000, "REQUIRES_PAYMENT"],
        ]);
    });

    it("edited up then back down: no charge is left open, and none is made", async () => {
        const order = await paidOrder();
        await kitchen.edit(owner, order.id, {
            lines: [{ itemId: order.lines.pastry, quantity: 4 }],
        });
        const back = await kitchen.edit(owner, order.id, {
            lines: [{ itemId: order.lines.pastry, quantity: 3 }],
        });
        expect(back.settleCents).toBe(0);
        expect(back.charge).toBeNull();
        expect(back.refund).toBeNull();
        expect(
            (await differenceIntents(order.id)).map((i) => i.status),
        ).toEqual(["SUPERSEDED"]);
        expect((await kitchen.read(owner, order.id)).money?.due).toBe("0.00");
    });

    it("edited up then back down: the unpaid supplementary invoice is settled, and takings read what was paid", async () => {
        const calendar = new CalendarService({
            listViews: jest.fn().mockResolvedValue(
                ["COMMERCE", "APPOINTMENTS", "PAYMENTS"].map((key) => ({
                    key,
                    readiness: "ACTIVE",
                })),
            ),
        } as unknown as ModuleAvailabilityService);
        /** Today's takings in India, in rupees. */
        const takenToday = async () => {
            const now = new Date();
            const today = DateTime.fromJSDate(now, {
                zone: "Asia/Kolkata",
            }).toISODate();
            const month = await calendar.month(owner, today!.slice(0, 7), now);
            const day = month.days.find((d) => d.date === today);
            return Number(day?.takings?.[0]?.amount ?? 0);
        };
        const before = await takenToday();

        // ₹610 paid and invoiced; +₹120 (unpaid), then −₹120.
        const order = await paidOrder();
        await prisma.$transaction((tx) => ensureOrderInvoice(tx, order.id));
        await kitchen.edit(owner, order.id, {
            lines: [{ itemId: order.lines.pastry, quantity: 4 }],
        });
        await kitchen.edit(owner, order.id, {
            lines: [{ itemId: order.lines.pastry, quantity: 3 }],
        });

        const paper = await prisma.invoice.findMany({
            where: { orderId: order.id },
            orderBy: { createdAt: "asc" },
            select: { kind: true, status: true, total: true },
        });
        expect(
            paper.map((i) => [i.kind, i.status, i.total.toString()]),
        ).toEqual([
            ["INVOICE", "PAID", "610"],
            ["SUPPLEMENTARY", "PAID", "120"],
            ["CREDIT_NOTE", "ISSUED", "120"],
        ]);
        // Nothing is owed, and the day took the ₹610 it was paid.
        expect((await kitchen.read(owner, order.id)).money?.due).toBe("0.00");
        expect((await takenToday()) - before).toBe(610);
    });

    it("paid anyway: owed back, not counted as paid, once — and cleared by its refund", async () => {
        const order = await paidOrder();
        await kitchen.edit(owner, order.id, {
            lines: [{ itemId: order.lines.pastry, quantity: 4 }],
        });
        await kitchen.edit(owner, order.id, {
            lines: [{ itemId: order.lines.pastry, quantity: 5 }],
        });
        await nameApart(order.id);
        const [old] = await differenceIntents(order.id);

        // The customer was still on the first checkout; Razorpay sends two
        // events for the one payment.
        for (const eventType of ["payment.captured", "order.paid"]) {
            await webhook({
                eventType,
                outcome: "SUCCEEDED",
                providerIntentId: `prov_${old!.id}`,
                providerPaymentRef: `pay_late_${order.id}`,
            });
        }

        const intent = await prisma.paymentIntent.findUniqueOrThrow({
            where: { id: old!.id },
            include: { attempts: true },
        });
        expect(intent.status).toBe("SUPERSEDED");
        expect(
            intent.attempts.filter((a) => a.status === "CAPTURED_NEEDS_REFUND"),
        ).toHaveLength(1);

        const money = (await kitchen.read(owner, order.id)).money;
        expect(money?.paid).toBe("610.00");
        // The latest charge is still what the order is owed.
        expect(money?.due).toBe("240.00");
        expect(money?.owedBack).toEqual([{ id: old!.id, amount: "120.00" }]);

        // Handed back from the provider's dashboard: the webhook records the
        // refund, and nothing is owed any more.
        await webhook({
            eventType: "refund.processed",
            outcome: "REFUNDED",
            providerIntentId: `prov_${old!.id}`,
            providerRefundId: `rfnd_late_${order.id}`,
        });
        const after = (await kitchen.read(owner, order.id)).money;
        expect(after?.owedBack).toEqual([]);
        expect(after?.refunded).toBe("0.00");
        const row = await prisma.order.findUniqueOrThrow({
            where: { id: order.id },
        });
        expect(row.paymentStatus).toBe("PAID");
    });

    it("paid anyway, then handed back: invoiced once when it came in, credited once when it went, and takings net to nothing", async () => {
        const calendar = new CalendarService({
            listViews: jest.fn().mockResolvedValue(
                ["COMMERCE", "APPOINTMENTS", "PAYMENTS"].map((key) => ({
                    key,
                    readiness: "ACTIVE",
                })),
            ),
        } as unknown as ModuleAvailabilityService);
        /** Today's takings in India, in paise. */
        const takenToday = async () => {
            const now = new Date();
            const today = DateTime.fromJSDate(now, {
                zone: "Asia/Kolkata",
            }).toISODate();
            const month = await calendar.month(owner, today!.slice(0, 7), now);
            const day = month.days.find((d) => d.date === today);
            return Math.round(Number(day?.takings?.[0]?.amount ?? 0) * 100);
        };
        /** The order's paper, oldest first. */
        const paper = (orderId: string) =>
            prisma.invoice.findMany({
                where: { orderId },
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                select: {
                    kind: true,
                    status: true,
                    total: true,
                    paymentMethod: true,
                    paymentReference: true,
                    paymentRefundId: true,
                    relatedInvoiceId: true,
                    lines: { select: { amount: true, cgst: true } },
                },
            });

        // ₹610 paid and invoiced; +₹120 (unpaid), then back to ₹610: the
        // ₹120 charge is superseded with no charge after it.
        const order = await paidOrder();
        const { id: invoiceId } = (await prisma.$transaction((tx) =>
            ensureOrderInvoice(tx, order.id),
        ))!;
        await kitchen.edit(owner, order.id, {
            lines: [{ itemId: order.lines.pastry, quantity: 4 }],
        });
        await kitchen.edit(owner, order.id, {
            lines: [{ itemId: order.lines.pastry, quantity: 3 }],
        });
        await nameApart(order.id);
        const [old] = await differenceIntents(order.id);
        expect(old!.status).toBe("SUPERSEDED");
        const settled = await takenToday();

        // The customer pays the replaced charge anyway: Razorpay's two
        // events for one payment, and the first delivered twice.
        const captured = {
            providerEventId: `evt_late_${order.id}`,
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId: `prov_${old!.id}`,
            providerPaymentRef: `pay_late_${order.id}`,
        };
        await webhook(captured);
        await webhook(captured);
        await webhook({
            ...captured,
            providerEventId: `evt_late_paid_${order.id}`,
            eventType: "order.paid",
        });

        const inAfter = await paper(order.id);
        const took = inAfter.filter(
            (i) => i.kind === "SUPPLEMENTARY" && i.paymentMethod === "ONLINE",
        );
        expect(took).toHaveLength(1);
        expect(took[0]).toMatchObject({
            status: "PAID",
            relatedInvoiceId: invoiceId,
            paymentReference: `pay_late_${order.id}`,
        });
        expect(took[0]!.total.toString()).toBe("120");
        // Money in: the day took ₹120 more.
        expect((await takenToday()) - settled).toBe(12000);
        // Still owed back, and still not the order's money.
        const owed = (await kitchen.read(owner, order.id)).money;
        expect(owed?.paid).toBe("610.00");
        expect(owed?.owedBack).toEqual([{ id: old!.id, amount: "120.00" }]);

        // Handed back from the provider's dashboard, the event delivered
        // twice: one refund, one credit note, mirroring the invoice.
        const refunded = {
            providerEventId: `evt_late_rf_${order.id}`,
            eventType: "refund.processed",
            outcome: "REFUNDED",
            providerIntentId: `prov_${old!.id}`,
            providerRefundId: `rfnd_late2_${order.id}`,
            refundAmountCents: 12000,
        };
        await webhook(refunded);
        await webhook(refunded);

        const refunds = await prisma.paymentRefund.findMany({
            where: { paymentIntentId: old!.id },
        });
        expect(refunds).toHaveLength(1);
        const all = await paper(order.id);
        const notes = all.filter((i) => i.paymentRefundId !== null);
        expect(notes).toHaveLength(1);
        expect(notes[0]).toMatchObject({
            kind: "CREDIT_NOTE",
            status: "ISSUED",
            relatedInvoiceId: invoiceId,
            paymentRefundId: refunds[0]!.id,
        });
        expect(notes[0]!.total.toString()).toBe("120");
        const lines = (i: (typeof all)[number]) =>
            i.lines.map((l) => [l.amount.toString(), l.cgst.toString()]);
        expect(lines(notes[0]!)).toEqual(lines(took[0]!));
        // Every rupee in has its invoice and every rupee out its credit
        // note: ₹610 + ₹120 + ₹120 in, ₹120 + ₹120 out.
        const sum = (kind: string) =>
            all
                .filter((i) => i.kind === kind)
                .reduce((s, i) => s + Math.round(Number(i.total) * 100), 0);
        expect(sum("INVOICE") + sum("SUPPLEMENTARY") - sum("CREDIT_NOTE")).toBe(
            61000,
        );

        // Money out: the day is back where the edits left it.
        expect((await takenToday()) - settled).toBe(0);
        const after = (await kitchen.read(owner, order.id)).money;
        expect(after?.owedBack).toEqual([]);
        expect(after?.paid).toBe("610.00");
        const row = await prisma.order.findUniqueOrThrow({
            where: { id: order.id },
        });
        expect(row.paymentStatus).toBe("PAID");
    });
});
