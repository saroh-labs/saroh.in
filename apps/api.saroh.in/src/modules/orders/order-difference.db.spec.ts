/**
 * The difference after an edit, wherever the order was paid (audit, 6 Oct
 * 2026), against a real Postgres: every payment the order received counts —
 * a counter payment as much as an online one — so an order paid in cash and
 * edited up asks only for the difference, never its whole new total. On a
 * plan without online payments nothing is tried online and "Record payment"
 * settles it, the supplementary invoice paid as the counter paid it (DEC-023:
 * the order is the ledger, its paper mirrors it). On a plan with them both
 * ways stay open, and recording it stops the online charge. Edited down,
 * a credit note is written and the money goes back — online for what was
 * paid online, from the till for what was paid by hand.
 *
 * The plan is stubbed (`online-payments-plan.ts` has its own db spec); the
 * provider is the network-free fake. Runs in the integration project
 * (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

const mockPlanOnline = { on: true };
jest.mock("../billing/online-payments-plan", () => {
    const actual = jest.requireActual<
        typeof import("../billing/online-payments-plan")
    >("../billing/online-payments-plan");
    const { ForbiddenException } =
        jest.requireActual<typeof import("@nestjs/common")>("@nestjs/common");
    return {
        ...actual,
        planTakesOnlinePayment: jest.fn(() =>
            Promise.resolve(mockPlanOnline.on),
        ),
        assertPlanTakesOnlinePayment: jest.fn(() =>
            mockPlanOnline.on
                ? Promise.resolve()
                : Promise.reject(new ForbiddenException("MODULE_LOCKED")),
        ),
    };
});

import { prisma } from "@saroh/database";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ONLINE_PAYMENT_METHOD } from "../invoices/invoice-state";
import { ensureOrderInvoice } from "../invoices/order-invoicing";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import { takeCounterPaymentInTx } from "./new-order";
import { OrderKitchenService } from "./order-kitchen.service";

const fake = new FakeMerchantProvider("RAZORPAY");
const payments = new PaymentsService(new FakeProviderFactory(fake));
const kitchen = new OrderKitchenService(payments);

let owner: OrganizationContext;
let storeId: string;
let pastry: string;
let shelfId: string;

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: `difference-org-${process.pid}` },
    });
    await giveBusinessDetails(org.id);
    owner = { organizationId: org.id, userId: "user_owner", role: "OWNER" };
    storeId = (
        await prisma.store.create({
            data: {
                name: "Rye & Co.",
                slug: `difference-store-${process.pid}`,
                organizationId: org.id,
            },
        })
    ).id;
    const p = await prisma.product.create({
        data: {
            storeId,
            organizationId: org.id,
            name: "Croissant",
            slug: `croissant-diff-${process.pid}`,
            price: "120.00",
            stockTracked: true,
        },
    });
    pastry = p.id;
    await prisma.productListing.create({
        data: { storeId, organizationId: org.id, productId: p.id },
    });
    shelfId = (
        await prisma.stockLevel.create({
            data: {
                storeId,
                organizationId: org.id,
                productId: p.id,
                onHand: 200,
            },
        })
    ).id;
    await payments.connectProvider(owner, {
        provider: "RAZORPAY",
        publicKey: "rzp_test_Public1",
        keyId: "rzp_test_Public1",
        keySecret: "rzp_secret",
        webhookSecret: "whsec_difference_test",
    });
});

beforeEach(() => {
    mockPlanOnline.on = true;
});

/**
 * Three croissants (360.00), held on the shelf, paid at the counter in
 * cash (`takeCounterPaymentInTx`, as New order does) or online (one
 * succeeded payment for the total).
 */
async function order(paid: "counter" | "online") {
    const n = await prisma.order.count({ where: { storeId } });
    const made = await prisma.order.create({
        data: {
            storeId,
            organizationId: owner.organizationId,
            orderId: `ORD-D${n + 1}`,
            currency: "INR",
            subtotal: "360.00",
            total: "360.00",
            paymentStatus: paid === "online" ? "PAID" : "UNPAID",
            items: {
                create: [
                    {
                        productId: pastry,
                        quantity: 3,
                        price: "120.00",
                        stockRow: "PRODUCT",
                        stockLevelId: shelfId,
                        heldQuantity: 3,
                    },
                ],
            },
        },
        include: { items: true },
    });
    await prisma.stockLevel.update({
        where: { id: shelfId },
        data: { promised: { increment: 3 } },
    });
    if (paid === "counter") {
        await prisma.$transaction((tx) =>
            takeCounterPaymentInTx(tx, {
                orderId: made.id,
                organizationId: owner.organizationId,
                userId: owner.userId,
                kind: "CASH",
                receivedCents: null,
                at: new Date(),
            }),
        );
    } else {
        await prisma.paymentIntent.create({
            data: {
                organizationId: owner.organizationId,
                orderId: made.id,
                provider: "RAZORPAY",
                providerIntentId: `prov_${made.id}`,
                amountCents: 36000,
                currency: "INR",
                status: "SUCCEEDED",
            },
        });
        await prisma.$transaction((tx) =>
            ensureOrderInvoice(tx, made.id, { method: ONLINE_PAYMENT_METHOD }),
        );
    }
    return { id: made.id, line: made.items[0]!.id };
}

const paper = (orderId: string) =>
    prisma.invoice.findMany({
        where: { orderId },
        orderBy: { createdAt: "asc" },
        select: { kind: true, status: true, total: true, paymentMethod: true },
    });

const differenceCharges = (orderId: string) =>
    prisma.paymentIntent.findMany({
        where: { orderId, idempotencyKey: { startsWith: "order-edit:" } },
        select: { amountCents: true, status: true },
    });

describe("a counter payment is counted", () => {
    it("keeps what was taken on the order", async () => {
        const o = await order("counter");
        const row = await prisma.order.findUniqueOrThrow({
            where: { id: o.id },
            select: { paidByHand: true, paymentStatus: true },
        });
        expect(row.paymentStatus).toBe("PAID");
        expect(row.paidByHand.toString()).toBe("360");
    });

    it("edited up, the order asks only for the difference online", async () => {
        const o = await order("counter");
        const edited = await kitchen.edit(owner, o.id, {
            lines: [{ itemId: o.line, quantity: 4 }],
        });
        expect(edited).toMatchObject({
            settleCents: 12000,
            dueCents: 12000,
            online: true,
            moneyError: null,
        });
        expect(await differenceCharges(o.id)).toEqual([
            expect.objectContaining({ amountCents: 12000 }),
        ]);
        const read = await kitchen.read(owner, o.id);
        expect(read.money).toMatchObject({
            total: "480.00",
            paid: "360.00",
            due: "120.00",
        });
    });
});

describe("on a plan without online payments", () => {
    it("nothing is tried online; Record payment settles the difference and its invoice", async () => {
        mockPlanOnline.on = false;
        const o = await order("counter");
        const edited = await kitchen.edit(owner, o.id, {
            lines: [{ itemId: o.line, quantity: 4 }],
        });
        expect(edited).toMatchObject({
            dueCents: 12000,
            online: false,
            charge: null,
            moneyError: null,
        });
        expect(await differenceCharges(o.id)).toEqual([]);
        expect((await paper(o.id)).map((i) => [i.kind, i.status])).toEqual([
            ["INVOICE", "PAID"],
            ["SUPPLEMENTARY", "ISSUED"],
        ]);

        const recorded = await kitchen.recordDifference(owner, o.id, {
            kind: "CASH",
        });
        expect(recorded.amountCents).toBe(12000);
        expect(
            (await paper(o.id)).map((i) => [i.kind, i.status, i.paymentMethod]),
        ).toEqual([
            ["INVOICE", "PAID", "CASH"],
            ["SUPPLEMENTARY", "PAID", "CASH"],
        ]);
        const read = await kitchen.read(owner, o.id);
        expect(read.money).toMatchObject({
            total: "480.00",
            paid: "480.00",
            due: "0.00",
        });
        expect(read.events.at(-1)).toMatchObject({
            kind: "STATUS",
            note: "Difference paid in cash",
            amountCents: 12000,
        });
        await expect(
            kitchen.recordDifference(owner, o.id, { kind: "CASH" }),
        ).rejects.toThrow(/Nothing more is owed/);
    });

    it("an order paid online before the plan changed is settled by hand too", async () => {
        const o = await order("online");
        mockPlanOnline.on = false;
        await kitchen.edit(owner, o.id, {
            lines: [{ itemId: o.line, quantity: 5 }],
        });
        expect(await differenceCharges(o.id)).toEqual([]);
        const recorded = await kitchen.recordDifference(owner, o.id, {
            kind: "UPI",
        });
        expect(recorded.amountCents).toBe(24000);
        const row = await prisma.order.findUniqueOrThrow({
            where: { id: o.id },
            select: { paidByHand: true },
        });
        expect(row.paidByHand.toString()).toBe("240");
    });
});

describe("on a plan with online payments", () => {
    it("both ways stay open: recording it supersedes the online charge", async () => {
        const o = await order("online");
        const edited = await kitchen.edit(owner, o.id, {
            lines: [{ itemId: o.line, quantity: 4 }],
        });
        expect(edited.online).toBe(true);
        expect(await differenceCharges(o.id)).toEqual([
            expect.objectContaining({ amountCents: 12000 }),
        ]);

        await kitchen.recordDifference(owner, o.id, { kind: "CARD" });
        expect(await differenceCharges(o.id)).toEqual([
            { amountCents: 12000, status: "SUPERSEDED" },
        ]);
        const read = await kitchen.read(owner, o.id);
        expect(read.money).toMatchObject({ paid: "480.00", due: "0.00" });
    });
});

describe("edited down", () => {
    it("paid online: refunded online for the edit, with a credit note", async () => {
        const o = await order("online");
        const edited = await kitchen.edit(owner, o.id, {
            lines: [{ itemId: o.line, quantity: 2 }],
        });
        expect(edited).toMatchObject({ settleCents: -12000, handBackCents: 0 });
        expect(edited.refund?.amountCents).toBe(12000);
        const refunds = await prisma.paymentRefund.findMany({
            where: { paymentIntent: { orderId: o.id } },
            select: { amountCents: true, forEdit: true },
        });
        expect(refunds).toEqual([{ amountCents: 12000, forEdit: true }]);
        expect(
            (await paper(o.id)).map((i) => [i.kind, i.total.toString()]),
        ).toEqual([
            ["INVOICE", "360"],
            ["CREDIT_NOTE", "120"],
        ]);
    });

    it("paid at the counter: a credit note, nothing refunded online, the till gives it back", async () => {
        const o = await order("counter");
        const edited = await kitchen.edit(owner, o.id, {
            lines: [{ itemId: o.line, quantity: 2 }],
        });
        expect(edited).toMatchObject({
            settleCents: -12000,
            handBackCents: 12000,
            refund: null,
            moneyError: null,
        });
        expect(
            await prisma.paymentRefund.count({
                where: { paymentIntent: { orderId: o.id } },
            }),
        ).toBe(0);
        expect(
            (await paper(o.id)).map((i) => [i.kind, i.total.toString()]),
        ).toEqual([
            ["INVOICE", "360"],
            ["CREDIT_NOTE", "120"],
        ]);
        const read = await kitchen.read(owner, o.id);
        expect(read.money).toMatchObject({
            total: "240.00",
            paid: "240.00",
            due: "0.00",
        });

        // Edited up again, it asks for what the order now costs over what
        // it kept, not over what was first paid.
        const again = await kitchen.edit(owner, o.id, {
            lines: [{ itemId: o.line, quantity: 3 }],
        });
        expect(again.settleCents).toBe(12000);
    });
});
