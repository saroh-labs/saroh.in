/**
 * A refund recorded by hand, in part (#865, DEC-116), against a real
 * Postgres: another amount up to what is left credits that much on a
 * GST-registered business's invoice (spread over its lines, the tax split
 * the way every credit note that names no line splits it), leaves the order
 * PAID with what went back kept on it, says so on the timeline, and comes
 * off Home's "taken", Spent and takings. More than is left is refused; the
 * rest, recorded in full, makes the order REFUNDED and credits the rest.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
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

import { giveBusinessDetails } from "../../../test/business-details";
import { orderRefundedSql } from "../customer-workspace/spent.sql";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { refundedBetweenWhere } from "../invoices/invoice-state";
import { ProductsService } from "../products/products.service";
import { StoresService } from "../stores/stores.service";
import type { CreateOrderDto } from "./dto";
import { readLeftToRefundInTx } from "./hand-refund";
import { OrdersService } from "./orders.service";

const tag = `${process.pid}-${Date.now()}`;
const flags = {
    isEnabled: () => Promise.resolve(true),
} as unknown as FeatureFlagService;
const stores = new StoresService(flags);
const products = new ProductsService(stores);
const orders = new OrdersService(stores);

let orgId = "";
let ownerId = "";
let storeId = "";
let bread = "";
let pastry = "";

beforeAll(async () => {
    ownerId = (
        await prisma.user.create({
            data: { email: `o865-owner-${tag}@example.com` },
        })
    ).id;
    orgId = (
        await prisma.organization.create({
            data: { name: "Rye & Co.", slug: `o865-org-${tag}` },
        })
    ).id;
    // GST-registered, in Karnataka: an order with no bill-to is supplied
    // there, so the tax splits CGST + SGST.
    await prisma.businessProfile.create({
        data: {
            organizationId: orgId,
            taxId: "29AAGCR4375J1ZU",
            gstRegistered: true,
            gstState: "29",
            invoicePrefix: "RC",
            timezone: "Asia/Kolkata",
        },
    });
    await giveBusinessDetails(orgId);
    await prisma.membership.create({
        data: { organizationId: orgId, userId: ownerId, role: "OWNER" },
    });
    storeId = (
        await stores.createForUser(ownerId, orgId, {
            name: "Hill Road",
            slug: `o865-hill-${tag}`,
        })
    ).id;
    await prisma.storeSettings.upsert({
        where: { storeId },
        create: {
            storeId,
            currency: "INR",
            fulfilmentTypes: ["PICKUP"],
            collectionEnabled: true,
        },
        update: {
            currency: "INR",
            fulfilmentTypes: ["PICKUP"],
            collectionEnabled: true,
        },
    });
    bread = (
        await products.create(storeId, ownerId, {
            name: "Sourdough",
            price: "180",
            gstRate: "0",
            hsnCode: "19059010",
        })
    ).id;
    pastry = (
        await products.create(storeId, ownerId, {
            name: "Croissant",
            price: "118",
            gstRate: "18",
            hsnCode: "19059020",
        })
    ).id;
});

/** A loaf and a croissant, ₹298, paid in cash at the counter. */
const paidOrder = () =>
    orders.create(storeId, ownerId, {
        items: [
            { productId: bread, quantity: 1 },
            { productId: pastry, quantity: 1 },
        ],
        fulfilment: "PICKUP",
        walkIn: { name: "Meera" },
        payment: { kind: "CASH", received: "300" },
    } as CreateOrderDto);

const notesOf = (orderId: string) =>
    prisma.invoice.findMany({
        where: { orderId, kind: "CREDIT_NOTE" },
        include: { lines: true },
        orderBy: { createdAt: "asc" },
    });

const leftOf = (orderId: string) =>
    prisma.$transaction((tx) => readLeftToRefundInTx(tx, orderId));

/** Spent's and takings' figure for the order (`orderRefundedSql`). */
const keptOf = async (orderId: string) => {
    const [row] = await prisma.$queryRaw<{ kept: string }[]>`
        SELECT (o.total - ${orderRefundedSql(orgId)})::text AS kept
        FROM "Order" o WHERE o.id = ${orderId}`;
    return Number(row.kept);
};

describe("a refund recorded by hand, in part (#865)", () => {
    it("credits that amount, keeps the order PAID and says it on the timeline", async () => {
        const made = await paidOrder();
        const invoice = await prisma.invoice.findFirstOrThrow({
            where: { orderId: made.id, kind: "INVOICE" },
        });
        expect(invoice.status).toBe("PAID");
        const since = new Date(Date.now() - 60_000);

        await orders.updateStatus(storeId, made.id, ownerId, {
            paymentStatus: "REFUNDED",
            refundedHow: "UPI",
            refundAmount: "100",
        });

        const order = await prisma.order.findUniqueOrThrow({
            where: { id: made.id },
        });
        expect(order.paymentStatus).toBe("PAID");
        expect(order.refundedByHand.toString()).toBe("100");
        expect((await leftOf(made.id)).leftCents).toBe(19_800);

        // One credit note for ₹100, spread over both lines by their amount
        // (₹118 and ₹180 of ₹298): ₹39.60 at 18%, ₹60.40 at 0%.
        const [note] = await notesOf(made.id);
        expect(note.relatedInvoiceId).toBe(invoice.id);
        expect(note.total.toString()).toBe("100");
        expect(note.paymentRefundId).toBeNull();
        const byRate = new Map(
            note.lines.map((l) => [l.gstRate?.toString(), l]),
        );
        expect(byRate.get("18")?.amount.toString()).toBe("39.6");
        expect(byRate.get("0")?.amount.toString()).toBe("60.4");
        // The GST inside ₹39.60 at 18%, split in half within the state.
        expect(note.cgst.toString()).toBe("3.02");
        expect(note.sgst.toString()).toBe("3.02");
        expect(note.igst.toString()).toBe("0");
        // Credited in part: the invoice still reads PAID.
        const after = await prisma.invoice.findUniqueOrThrow({
            where: { id: invoice.id },
        });
        expect(after.status).toBe("PAID");

        const step = await prisma.orderEvent.findFirstOrThrow({
            where: { orderId: made.id, kind: "REFUND" },
        });
        expect(step).toMatchObject({
            note: "Handed back by UPI",
            amountCents: 10_000,
            actorUserId: ownerId,
        });

        // Home's "taken" takes the credit note off; Spent and takings keep
        // what is left of the order.
        const handedBack = await prisma.invoice.aggregate({
            where: refundedBetweenWhere(orgId, since, new Date()),
            _sum: { total: true },
        });
        expect(Number(handedBack._sum.total)).toBeGreaterThanOrEqual(100);
        expect(await keptOf(made.id)).toBe(198);
        // Insights' order.refunded is for a full refund only (#867).
        expect(
            await prisma.analyticsEvent.count({
                where: { dedupeKey: `order.refunded:${made.id}` },
            }),
        ).toBe(0);
    });

    it("refuses more than is left, and the rest in full refunds the order", async () => {
        const made = await paidOrder();
        await orders.updateStatus(storeId, made.id, ownerId, {
            paymentStatus: "REFUNDED",
            refundedHow: "CASH",
            refundAmount: "50.50",
        });
        await expect(
            orders.updateStatus(storeId, made.id, ownerId, {
                paymentStatus: "REFUNDED",
                refundAmount: "247.51",
            }),
        ).rejects.toThrow(
            new ConflictException("At most ₹247.50 can be refunded."),
        );
        // Nothing was written by the refusal.
        expect((await notesOf(made.id)).length).toBe(1);

        // The full amount: what is left, ₹247.50.
        await orders.updateStatus(storeId, made.id, ownerId, {
            paymentStatus: "REFUNDED",
            refundedHow: "CASH",
        });
        const order = await prisma.order.findUniqueOrThrow({
            where: { id: made.id },
        });
        expect(order.paymentStatus).toBe("REFUNDED");
        expect(order.refundedByHand.toString()).toBe("298");
        const notes = await notesOf(made.id);
        expect(notes.map((n) => n.total.toString())).toEqual(["50.5", "247.5"]);
        const invoice = await prisma.invoice.findFirstOrThrow({
            where: { orderId: made.id, kind: "INVOICE" },
        });
        expect(invoice.status).toBe("CREDITED");
        const steps = await prisma.orderEvent.findMany({
            where: { orderId: made.id, kind: "REFUND" },
            orderBy: { createdAt: "asc" },
        });
        expect(steps.map((s) => s.amountCents)).toEqual([5_050, 24_750]);
        expect((await leftOf(made.id)).leftCents).toBe(0);
        // Full: taken off Insights' orders figure (#867).
        expect(
            await prisma.analyticsEvent.count({
                where: { dedupeKey: `order.refunded:${made.id}` },
            }),
        ).toBe(1);
        // Nothing more can go back.
        await expect(
            orders.updateStatus(storeId, made.id, ownerId, {
                paymentStatus: "REFUNDED",
                refundAmount: "1",
            }),
        ).rejects.toThrow("Nothing is left to refund on this order.");
    });
});
