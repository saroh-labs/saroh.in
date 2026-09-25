/**
 * GST and an invoice for every order against a real Postgres (ADR-008, U5):
 * a verified payment webhook makes exactly one order invoice and a replayed
 * delivery none; a refund makes its credit note; the refund webhook settles
 * Saroh's own row by its reference, at the provider's amount, and a refund
 * the provider failed frees its money (#508 U2); a credit note sees the
 * lines an edit added on a supplementary invoice (#508 U3); what is owed
 * leaves order invoices out; issued invoices cannot be edited, deleted or —
 * once the business is GST-registered — voided; two invoices across 1 April
 * land in their own financial year's series; a Karnataka business billing a
 * Goa café charges IGST.
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

import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { createHmac } from "node:crypto";

import type { OrganizationContext } from "../../common/types/organization-context";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import {
    FakeWebhookProvider,
    FakeWebhookProviderFactory,
} from "../webhooks/providers/fake.webhook";
import { WebhooksService } from "../webhooks/webhooks.service";
import { InvoicesService } from "./invoices.service";
import { financialYear } from "./numbering";
import {
    correctOrderInvoiceForEdit,
    creditNoteForRefund,
    ensureOrderInvoice,
} from "./order-invoicing";
import { toCents } from "./totals";

const WEBHOOK_SECRET = "whsec_gst_test";

const fake = new FakeMerchantProvider("RAZORPAY");
const payments = new PaymentsService(new FakeProviderFactory(fake));
const webhooks = new WebhooksService(
    new FakeWebhookProviderFactory(new FakeWebhookProvider("RAZORPAY")),
    payments,
);
const invoices = new InvoicesService();

/** Rye & Co.: GST-registered in Karnataka, prefix RC. */
let rye: OrganizationContext;
let storeId: string;
let customerId: string;
let contactId: string;
let bread: string;
let pastry: string;
let eventSeq = 0;

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: `gst-org-${process.pid}` },
    });
    rye = { organizationId: org.id, userId: "user_owner", role: "OWNER" };
    await prisma.businessProfile.create({
        data: {
            organizationId: org.id,
            taxId: "29AAGCR4375J1ZU",
            gstRegistered: true,
            gstState: "29",
            invoicePrefix: "RC",
            timezone: "Asia/Kolkata",
            deliveryGstRate: "18",
            deliverySacCode: "996813",
            addressLine1: "14 Hill Road",
            addressLine2: "Indiranagar",
            city: "Bengaluru",
            postalCode: "560038",
        },
    });
    storeId = (
        await prisma.store.create({
            data: {
                name: "Rye & Co.",
                slug: `gst-store-${process.pid}`,
                organizationId: org.id,
            },
        })
    ).id;
    customerId = (
        await prisma.customer.create({
            data: {
                storeId,
                organizationId: org.id,
                email: "meera@example.in",
                firstName: "Meera",
                lastName: "Iyer",
            },
        })
    ).id;
    contactId = (
        await prisma.contact.create({
            data: {
                organizationId: org.id,
                email: "orders@cafegoa.in",
                firstName: "Café",
                lastName: "Goa",
            },
        })
    ).id;
    const product = async (name: string, price: string, gstRate: string) =>
        (
            await prisma.product.create({
                data: {
                    storeId,
                    organizationId: org.id,
                    name,
                    slug: `${name.toLowerCase()}-gst-${process.pid}`,
                    price,
                    gstRate,
                    hsnCode: "19059010",
                },
            })
        ).id;
    bread = await product("Sourdough", "180.00", "0");
    pastry = await product("Croissant", "118.00", "18");
    await payments.connectProvider(rye, {
        provider: "RAZORPAY",
        publicKey: "rzp_public",
        keyId: "rzp_key",
        keySecret: "rzp_secret",
        webhookSecret: WEBHOOK_SECRET,
    });
});

/**
 * An unpaid delivery order: two loaves and a croissant (478.00), ₹47.80 off,
 * ₹59 delivery — ₹489.20 — with a pending payment for it.
 */
async function unpaidOrder(): Promise<{ id: string; intentId: string }> {
    const n = await prisma.order.count({ where: { storeId } });
    const order = await prisma.order.create({
        data: {
            storeId,
            organizationId: rye.organizationId,
            customerId,
            orderId: `ORD-G${n + 1}`,
            currency: "INR",
            subtotal: "478.00",
            shipping: "59.00",
            discount: "47.80",
            total: "489.20",
            fulfilment: "DELIVERY",
            deliveryLine1: "12 Church Street",
            deliveryCity: "Bengaluru",
            deliveryState: "Karnataka",
            deliveryPostalCode: "560001",
            items: {
                create: [
                    { productId: bread, quantity: 2, price: "180.00" },
                    { productId: pastry, quantity: 1, price: "118.00" },
                ],
            },
        },
    });
    const intent = await prisma.paymentIntent.create({
        data: {
            organizationId: rye.organizationId,
            orderId: order.id,
            provider: "RAZORPAY",
            providerIntentId: `prov_${order.id}`,
            amountCents: 48920,
            currency: "INR",
            status: "REQUIRES_PAYMENT",
        },
    });
    return { id: order.id, intentId: intent.id };
}

async function deliver(event: Record<string, unknown>, id?: string) {
    const providerEventId = id ?? `evt_g_${++eventSeq}`;
    const raw = Buffer.from(JSON.stringify({ providerEventId, ...event }));
    return webhooks.handle("razorpay", rye.organizationId, raw, {
        "x-fake-signature": createHmac("sha256", WEBHOOK_SECRET)
            .update(raw)
            .digest("hex"),
    });
}

describe("an invoice for every order (real database)", () => {
    it("a verified payment makes exactly one invoice; a replayed delivery makes none", async () => {
        const order = await unpaidOrder();
        const paid = {
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId: `prov_${order.id}`,
            providerPaymentRef: `pay_${order.id}`,
        };
        await expect(deliver(paid, `evt_pay_${order.id}`)).resolves.toEqual({
            status: "processed",
            changed: true,
        });
        // The same delivery again, and the provider's second event for the
        // same payment.
        await deliver(paid, `evt_pay_${order.id}`);
        await deliver({ ...paid, eventType: "order.paid" });

        const made = await prisma.invoice.findMany({
            where: { orderId: order.id },
            include: { lines: { orderBy: { position: "asc" } } },
        });
        expect(made).toHaveLength(1);
        const [invoice] = made;
        expect(invoice.kind).toBe("INVOICE");
        expect(invoice.status).toBe("PAID");
        expect(invoice.payTokenHash).toBeNull();
        expect(invoice.number).toBe(`RC/${financialYear(new Date())}/0001`);
        // Totals equal the order's; GST inside, intra-state.
        expect(invoice.total.toString()).toBe("489.2");
        expect(invoice.taxType).toBe("INTRA");
        expect(invoice.sellerGstin).toBe("29AAGCR4375J1ZU");
        expect(invoice.billToName).toBe("Meera Iyer");
        expect(invoice.lines.map((l) => l.description)).toEqual([
            "Sourdough",
            "Croissant",
            "Delivery",
        ]);
    });

    it("two reconciliations racing for one order make one invoice", async () => {
        const order = await unpaidOrder();
        await prisma.order.update({
            where: { id: order.id },
            data: { paymentStatus: "PAID" },
        });
        const results = await Promise.all(
            [1, 2, 3].map(() =>
                prisma.$transaction((tx) => ensureOrderInvoice(tx, order.id)),
            ),
        );
        expect(results.filter((r) => r?.created)).toHaveLength(1);
        expect(
            await prisma.invoice.count({
                where: { orderId: order.id, kind: "INVOICE" },
            }),
        ).toBe(1);
    });

    it("a refund makes a credit note for the refunded line, once", async () => {
        const order = await unpaidOrder();
        await deliver({
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId: `prov_${order.id}`,
            providerPaymentRef: `pay_${order.id}`,
        });
        const invoice = await prisma.invoice.findFirstOrThrow({
            where: { orderId: order.id, kind: "INVOICE" },
        });
        const croissant = await prisma.orderItem.findFirstOrThrow({
            where: { orderId: order.id, productId: pastry },
        });
        // Through the real refund path: the row, its line and its amount
        // are the ones the merchant's refund makes.
        const refund = await payments.initiateRefund(rye, order.id, {
            lines: [{ itemId: croissant.id, quantity: 1 }],
        });
        expect(refund.amountCents).toBe(10620);

        await deliver({
            eventType: "refund.processed",
            outcome: "REFUNDED",
            providerIntentId: `prov_${order.id}`,
            providerRefundId: refund.providerRefundId,
            refundReference: refund.refundId,
            refundAmountCents: 10620,
        });
        // The refund path making it too finds the one already there.
        await prisma.$transaction((tx) =>
            creditNoteForRefund(tx, refund.refundId),
        );

        const notes = await prisma.invoice.findMany({
            where: { relatedInvoiceId: invoice.id, kind: "CREDIT_NOTE" },
            include: { lines: true },
        });
        expect(notes).toHaveLength(1);
        const [note] = notes;
        expect(note.number).toMatch(/^RCCN\//);
        expect(note.paymentRefundId).toBe(refund.refundId);
        expect(note.total.toString()).toBe("106.2");
        expect(note.cgst.toString()).toBe("8.1");
        expect(note.lines[0].orderItemId).toBe(croissant.id);
        // Partly refunded: the order stays PAID, the invoice as it was.
        const after = await prisma.invoice.findUniqueOrThrow({
            where: { id: invoice.id },
        });
        expect(after.status).toBe("PAID");
    });

    it("what is owed leaves order invoices out", async () => {
        const order = await unpaidOrder();
        await invoices.issueInTx(prisma as never, rye.organizationId, {
            contactId,
            currency: "INR",
            lines: [
                {
                    description: "Trade loaves",
                    quantity: 10,
                    unitPrice: "150",
                    gstRate: "0",
                },
            ],
            source: "PACK",
        });
        // An order's paper billed to the same person, still ISSUED.
        await prisma.invoice.create({
            data: {
                organizationId: rye.organizationId,
                kind: "SUPPLEMENTARY",
                status: "ISSUED",
                number: `TEST-${order.id.slice(-6)}`,
                orderId: order.id,
                contactId,
                currency: "INR",
                subtotal: "100",
                total: "100",
                issuedAt: new Date(),
            },
        });
        const owed = await invoices.owedFor(rye.organizationId, { contactId });
        expect(owed.totals).toEqual([{ currency: "INR", amount: "1500.00" }]);
        expect(owed.unpaidCount).toBe(1);
    });
});

describe("the refund webhook settles at the provider's amount (real database)", () => {
    afterEach(() => jest.restoreAllMocks());

    /** A paid order (₹489.20) with its invoice, and its croissant line. */
    async function paidOrder() {
        const order = await unpaidOrder();
        await deliver({
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId: `prov_${order.id}`,
            providerPaymentRef: `pay_${order.id}`,
        });
        const invoice = await prisma.invoice.findFirstOrThrow({
            where: { orderId: order.id, kind: "INVOICE" },
        });
        const croissant = await prisma.orderItem.findFirstOrThrow({
            where: { orderId: order.id, productId: pastry },
        });
        return { ...order, invoiceId: invoice.id, croissant: croissant.id };
    }

    /** The fake provider's id for the first refund on this order's payment. */
    const providerRefundId = (orderId: string) => `fake_refund_prov_${orderId}`;

    const refunded = (
        orderId: string,
        over: Record<string, unknown> = {},
    ): Record<string, unknown> => ({
        eventType: "refund.processed",
        outcome: "REFUNDED",
        providerIntentId: `prov_${orderId}`,
        ...over,
    });

    const creditNotes = (invoiceId: string) =>
        prisma.invoice.findMany({
            where: { relatedInvoiceId: invoiceId, kind: "CREDIT_NOTE" },
            orderBy: { createdAt: "asc" },
        });

    const refundSteps = (orderId: string) =>
        prisma.orderEvent.findMany({
            where: { orderId, kind: "REFUND" },
        });

    it("a ₹400 refund made in the provider's dashboard is one ₹400 row; the order stays PAID and the credit note is ₹400", async () => {
        const order = await paidOrder();

        await deliver(
            refunded(order.id, {
                providerRefundId: `rfnd_dash_${order.id}`,
                refundAmountCents: 40000,
            }),
        );

        const rows = await prisma.paymentRefund.findMany({
            where: { paymentIntentId: order.intentId },
        });
        expect(rows).toEqual([
            expect.objectContaining({
                amountCents: 40000,
                status: "SUCCEEDED",
            }),
        ]);
        const after = await prisma.order.findUniqueOrThrow({
            where: { id: order.id },
        });
        expect(after.paymentStatus).toBe("PAID");
        const notes = await creditNotes(order.invoiceId);
        expect(notes).toHaveLength(1);
        expect(notes[0].total.toString()).toBe("400");
    });

    it("the same refund delivered twice is one row and one credit note", async () => {
        const order = await paidOrder();
        const refund = await payments.initiateRefund(rye, order.id, {
            lines: [{ itemId: order.croissant, quantity: 1 }],
        });
        const event = refunded(order.id, {
            providerRefundId: refund.providerRefundId,
            refundReference: refund.refundId,
            refundAmountCents: 10620,
        });

        await deliver(event);
        await deliver(event); // a second delivery, under another event id

        const rows = await prisma.paymentRefund.findMany({
            where: { paymentIntentId: order.intentId },
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].status).toBe("SUCCEEDED");
        expect(await creditNotes(order.invoiceId)).toHaveLength(1);
        expect(await refundSteps(order.id)).toHaveLength(1);
    });

    it("arriving before the refund path stored the provider's id, it settles Saroh's row — no second row, one REFUND step", async () => {
        const order = await paidOrder();
        // The provider's webhook lands while its answer to the call is
        // still on the way back.
        const refund = fake.refund.bind(fake);
        jest.spyOn(fake, "refund").mockImplementationOnce(async (input) => {
            const made = await refund(input);
            await deliver(
                refunded(order.id, {
                    providerRefundId: made.providerRefundId,
                    refundReference: input.reference,
                    refundAmountCents: input.amountCents,
                }),
            );
            return made;
        });

        const result = await payments.initiateRefund(rye, order.id, {
            lines: [{ itemId: order.croissant, quantity: 1 }],
        });

        const rows = await prisma.paymentRefund.findMany({
            where: { paymentIntentId: order.intentId },
        });
        expect(rows).toEqual([
            expect.objectContaining({
                id: result.refundId,
                status: "SUCCEEDED",
                providerRefundId: providerRefundId(order.id),
                amountCents: 10620,
            }),
        ]);
        const steps = await refundSteps(order.id);
        expect(steps).toHaveLength(1);
        expect(steps[0].amountCents).toBe(10620);
        expect(await creditNotes(order.invoiceId)).toHaveLength(1);
    });

    it("a refund whose call timed out is confirmed by the webhook: that row SUCCEEDED, one REFUND step on the timeline", async () => {
        const order = await paidOrder();
        fake.failNextRefund("UNKNOWN", { madeAnyway: true });
        const lost = await payments.initiateRefund(rye, order.id, {
            lines: [{ itemId: order.croissant, quantity: 1 }],
        });
        expect(lost.beingConfirmed).toBe(true);
        expect(await refundSteps(order.id)).toHaveLength(0);

        await deliver(
            refunded(order.id, {
                providerRefundId: providerRefundId(order.id),
                refundReference: lost.refundId,
                refundAmountCents: 10620,
            }),
        );

        const rows = await prisma.paymentRefund.findMany({
            where: { paymentIntentId: order.intentId },
        });
        expect(rows).toEqual([
            expect.objectContaining({
                id: lost.refundId,
                status: "SUCCEEDED",
                providerRefundId: providerRefundId(order.id),
            }),
        ]);
        const steps = await refundSteps(order.id);
        expect(steps).toHaveLength(1);
        expect(steps[0]).toMatchObject({
            amountCents: 10620,
            actorUserId: null,
        });
        expect(await creditNotes(order.invoiceId)).toHaveLength(1);
        // Settled: try-again has nothing left to do.
        await expect(
            payments.retryRefund(rye, order.id, lost.refundId),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("a refund the provider failed frees its line: FAILED, no credit note, the order still PAID", async () => {
        const order = await paidOrder();
        fake.failNextRefund("UNKNOWN");
        const lost = await payments.initiateRefund(rye, order.id, {
            lines: [{ itemId: order.croissant, quantity: 1 }],
        });

        await deliver({
            eventType: "refund.failed",
            outcome: "REFUND_FAILED",
            providerIntentId: `prov_${order.id}`,
            providerRefundId: `rfnd_failed_${order.id}`,
            refundReference: lost.refundId,
            refundAmountCents: 10620,
        });

        expect(
            await prisma.paymentRefund.findUniqueOrThrow({
                where: { id: lost.refundId },
            }),
        ).toMatchObject({ status: "FAILED" });
        expect(await creditNotes(order.invoiceId)).toHaveLength(0);
        expect(
            (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
                .paymentStatus,
        ).toBe("PAID");
        // The croissant can be refunded again.
        const again = await payments.initiateRefund(rye, order.id, {
            lines: [{ itemId: order.croissant, quantity: 1 }],
        });
        expect(again.amountCents).toBe(10620);
    });

    it("a dashboard refund of the same amount as Saroh's pending one is its own row; Saroh's stays PENDING", async () => {
        const order = await paidOrder();
        fake.failNextRefund("UNKNOWN");
        const pending = await payments.initiateRefund(rye, order.id, {
            lines: [{ itemId: order.croissant, quantity: 1 }],
        });

        await deliver(
            refunded(order.id, {
                providerRefundId: `rfnd_dash_${order.id}`,
                refundAmountCents: 10620,
            }),
        );

        const rows = await prisma.paymentRefund.findMany({
            where: { paymentIntentId: order.intentId },
            orderBy: { createdAt: "asc" },
        });
        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({
            id: pending.refundId,
            status: "PENDING",
            providerRefundId: null,
        });
        expect(rows[1]).toMatchObject({
            amountCents: 10620,
            status: "SUCCEEDED",
            providerRefundId: `rfnd_dash_${order.id}`,
        });
    });

    it("two partial refunds that add up to the payment move the order to REFUNDED once; the credit notes total the payment", async () => {
        const order = await paidOrder();
        const first = await payments.initiateRefund(rye, order.id, {
            lines: [{ itemId: order.croissant, quantity: 1 }],
        });
        const rest = await payments.initiateRefund(rye, order.id);
        expect(first.amountCents + rest.amountCents).toBe(48920);

        await deliver(
            refunded(order.id, {
                providerRefundId: first.providerRefundId,
                refundReference: first.refundId,
                refundAmountCents: first.amountCents,
            }),
        );
        expect(
            (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
                .paymentStatus,
        ).toBe("PAID");

        await deliver(
            refunded(order.id, {
                providerRefundId: rest.providerRefundId,
                refundReference: rest.refundId,
                refundAmountCents: rest.amountCents,
            }),
        );
        // Delivered again: still once.
        await deliver(
            refunded(order.id, {
                providerRefundId: rest.providerRefundId,
                refundReference: rest.refundId,
                refundAmountCents: rest.amountCents,
            }),
        );

        expect(
            (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
                .paymentStatus,
        ).toBe("REFUNDED");
        const notes = await creditNotes(order.invoiceId);
        expect(notes).toHaveLength(2);
        expect(
            notes.reduce((s, n) => s + Math.round(Number(n.total) * 100), 0),
        ).toBe(48920);
        expect(
            (
                await prisma.invoice.findUniqueOrThrow({
                    where: { id: order.invoiceId },
                })
            ).status,
        ).toBe("CREDITED");
    });
});

describe("credit notes see every invoiced line (real database)", () => {
    let chai: string;

    beforeAll(async () => {
        chai = (
            await prisma.product.create({
                data: {
                    storeId,
                    organizationId: rye.organizationId,
                    name: "Masala chai",
                    slug: `chai-gst-${process.pid}`,
                    price: "100.00",
                    gstRate: "5",
                    hsnCode: "09023020",
                },
            })
        ).id;
    });

    /**
     * A paid order edited up before preparing: one masala chai (₹100, 5%)
     * added on a supplementary invoice, its difference paid online.
     */
    async function editedUpOrder() {
        const order = await unpaidOrder();
        await deliver({
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId: `prov_${order.id}`,
            providerPaymentRef: `pay_${order.id}`,
        });
        const item = await prisma.orderItem.create({
            data: {
                orderId: order.id,
                productId: chai,
                quantity: 1,
                price: "100.00",
            },
        });
        await prisma.order.update({
            where: { id: order.id },
            data: { subtotal: "578.00", total: "589.20" },
        });
        await prisma.$transaction((tx) =>
            correctOrderInvoiceForEdit(tx, {
                orderId: order.id,
                changes: [
                    {
                        orderItemId: item.id,
                        productId: chai,
                        description: "Masala chai",
                        deltaQuantity: 1,
                        unitCents: 10000,
                    },
                ],
                note: "Added masala chai",
                createdByUserId: null,
                settled: false,
            }),
        );
        await prisma.paymentIntent.create({
            data: {
                organizationId: rye.organizationId,
                orderId: order.id,
                provider: "RAZORPAY",
                providerIntentId: `prov_diff_${order.id}`,
                amountCents: 10000,
                currency: "INR",
                status: "REQUIRES_PAYMENT",
            },
        });
        await deliver({
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId: `prov_diff_${order.id}`,
            providerPaymentRef: `pay_diff_${order.id}`,
        });
        const invoice = await prisma.invoice.findFirstOrThrow({
            where: { orderId: order.id, kind: "INVOICE" },
        });
        return { id: order.id, invoiceId: invoice.id, chaiItem: item.id };
    }

    const creditNotes = (invoiceId: string) =>
        prisma.invoice.findMany({
            where: { relatedInvoiceId: invoiceId, kind: "CREDIT_NOTE" },
            include: { lines: true },
            orderBy: { createdAt: "asc" },
        });

    it("refunding the line an edit added credits it at its own rate and HSN", async () => {
        const order = await editedUpOrder();

        const refund = await payments.initiateRefund(rye, order.id, {
            lines: [{ itemId: order.chaiItem, quantity: 1 }],
        });

        const notes = await creditNotes(order.invoiceId);
        expect(notes).toHaveLength(1);
        expect(notes[0].paymentRefundId).toBe(refund.refundId);
        expect(toCents(notes[0].total.toString())).toBe(refund.amountCents);
        expect(notes[0].lines).toHaveLength(1);
        expect(notes[0].lines[0]).toMatchObject({
            description: "Masala chai",
            hsnSac: "09023020",
            orderItemId: order.chaiItem,
        });
        expect(notes[0].lines[0].gstRate?.toString()).toBe("5");
    });

    it("a full refund of an edited-up order is credited by the refund's own notes; nothing is left to credit after", async () => {
        const order = await editedUpOrder();

        const refund = await payments.initiateRefund(rye, order.id);
        expect(refund.amountCents).toBe(58920);
        // The webhook settles each part; the last closes the order.
        for (const part of refund.refunds) {
            await deliver({
                eventType: "refund.processed",
                outcome: "REFUNDED",
                providerIntentId: (
                    await prisma.paymentIntent.findUniqueOrThrow({
                        where: { id: part.paymentIntentId },
                    })
                ).providerIntentId,
                providerRefundId: part.providerRefundId,
                refundReference: part.id,
                refundAmountCents: part.amountCents,
            });
        }

        expect(
            (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
                .paymentStatus,
        ).toBe("REFUNDED");
        const notes = await creditNotes(order.invoiceId);
        // One note per refund row, each keyed on it: the rest-of-order
        // credit found nothing left.
        expect(notes).toHaveLength(refund.refunds.length);
        expect(notes.every((n) => n.paymentRefundId !== null)).toBe(true);
        for (const part of refund.refunds) {
            const note = notes.find((n) => n.paymentRefundId === part.id);
            expect(toCents(note!.total.toString())).toBe(part.amountCents);
        }
        // No credit note line at a rate its item was not invoiced at.
        const rates = new Map([
            ["Sourdough", "0"],
            ["Croissant", "18"],
            ["Delivery", "18"],
            ["Masala chai", "5"],
        ]);
        const lines = notes.flatMap((n) => n.lines);
        for (const line of lines) {
            expect(line.gstRate?.toString()).toBe(rates.get(line.description));
        }
        // The chai's money comes back as chai, at 5% — not spread over the
        // original invoice's rates — so the notes hand back exactly the GST
        // the invoice and its supplementary invoice charged.
        expect(lines.map((l) => l.description)).toContain("Masala chai");
        const charged = await prisma.invoice.aggregate({
            where: {
                OR: [
                    { id: order.invoiceId },
                    {
                        relatedInvoiceId: order.invoiceId,
                        kind: "SUPPLEMENTARY",
                    },
                ],
            },
            _sum: { tax: true },
        });
        expect(notes.reduce((s, n) => s + toCents(n.tax.toString()), 0)).toBe(
            toCents((charged._sum.tax ?? 0).toString()),
        );
        expect(
            (
                await prisma.invoice.findUniqueOrThrow({
                    where: { id: order.invoiceId },
                })
            ).status,
        ).toBe("CREDITED");
    });

    it("an order never edited is credited as before", async () => {
        const order = await unpaidOrder();
        await deliver({
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId: `prov_${order.id}`,
            providerPaymentRef: `pay_${order.id}`,
        });
        const invoice = await prisma.invoice.findFirstOrThrow({
            where: { orderId: order.id, kind: "INVOICE" },
        });

        const refund = await payments.initiateRefund(rye, order.id);

        const notes = await creditNotes(invoice.id);
        expect(notes).toHaveLength(1);
        expect(notes[0].paymentRefundId).toBe(refund.refundId);
        expect(notes[0].total.toString()).toBe("489.2");
        expect(notes[0].lines.map((l) => l.description).sort()).toEqual(
            ["Croissant", "Delivery", "Sourdough"].sort(),
        );
    });
});

describe("issued paper never changes (real database)", () => {
    it("keeps the registered address it was issued with after the business moves", async () => {
        const address =
            "14 Hill Road, Indiranagar, Bengaluru 560038, Karnataka";
        const order = await unpaidOrder();
        await prisma.order.update({
            where: { id: order.id },
            data: { paymentStatus: "PAID" },
        });
        const made = await prisma.$transaction((tx) =>
            ensureOrderInvoice(tx, order.id),
        );
        expect(made).not.toBeNull();
        const id = made!.id;
        expect(
            (await prisma.invoice.findUniqueOrThrow({ where: { id } }))
                .sellerAddress,
        ).toBe(address);

        await prisma.businessProfile.update({
            where: { organizationId: rye.organizationId },
            data: { addressLine1: "2 New Street", postalCode: "560001" },
        });
        try {
            expect((await invoices.get(rye, id)).sellerAddress).toBe(address);
        } finally {
            await prisma.businessProfile.update({
                where: { organizationId: rye.organizationId },
                data: { addressLine1: "14 Hill Road", postalCode: "560038" },
            });
        }
    });

    it("refuses to edit, delete or void a registered business's issued invoice; a credit note cancels it", async () => {
        const draft = await invoices.createDraft(rye, {
            contactId,
            currency: "INR",
            billToGstin: "30AAACR5055K1ZK",
            lines: [
                {
                    description: "Croissants (trade)",
                    quantity: 40,
                    unitPrice: "59",
                    gstRate: "18",
                    hsnSac: "19059020",
                },
            ],
        });
        const issued = await invoices.issue(rye, draft.id);
        // Karnataka to a café in Goa: IGST.
        expect(issued.gst).toEqual(
            expect.objectContaining({
                taxType: "INTER",
                placeOfSupply: { code: "30", name: "Goa" },
                igst: "360.00",
                cgst: "0.00",
            }),
        );

        await expect(
            invoices.updateDraft(rye, issued.id, { dueAt: null }),
        ).rejects.toBeInstanceOf(ConflictException);
        await expect(
            invoices.deleteDraft(rye, issued.id),
        ).rejects.toBeInstanceOf(ConflictException);
        await expect(
            invoices.voidInvoice(rye, issued.id, { reason: "x" }),
        ).rejects.toThrow(/credit note/);

        const note = await invoices.credit(rye, issued.id, {
            reason: "Order cancelled",
        });
        expect(note.kind).toBe("CREDIT_NOTE");
        expect(note.total).toBe("2360.00");
        const after = await invoices.get(rye, issued.id);
        expect(after.status).toBe("CREDITED");
        expect(after.number).toBe(issued.number);
        expect(after.corrections).toEqual([
            expect.objectContaining({ id: note.id, kind: "CREDIT_NOTE" }),
        ]);
    });

    it("two invoices issued at once across 1 April land in their own year's series", async () => {
        const march = new Date("2027-03-31T18:29:59Z"); // 23:59:59 IST
        const april = new Date("2027-03-31T18:30:00Z"); // 00:00 IST
        const issue = (issuedAt: Date) =>
            prisma.$transaction((tx) =>
                invoices.issueInTx(tx, rye.organizationId, {
                    contactId,
                    currency: "INR",
                    lines: [
                        { description: "Loaf", quantity: 1, unitPrice: "180" },
                    ],
                    source: "PACK",
                    issuedAt,
                    dueAt: new Date("2027-05-01T00:00:00Z"),
                }),
            );
        const [a, b] = await Promise.all([issue(march), issue(april)]);
        expect(a.number).toMatch(/^RC\/26-27\/\d{4}$/);
        expect(b.number).toBe("RC/27-28/0001");
    });

    it("numbers in the year the business chose; moving the month renumbers nothing issued", async () => {
        const issue = (issuedAt: Date) =>
            prisma.$transaction((tx) =>
                invoices.issueInTx(tx, rye.organizationId, {
                    contactId,
                    currency: "INR",
                    lines: [
                        { description: "Loaf", quantity: 1, unitPrice: "180" },
                    ],
                    source: "PACK",
                    issuedAt,
                    dueAt: new Date("2028-12-01T00:00:00Z"),
                }),
            );
        const setMonth = (financialYearStartMonth: number) =>
            prisma.businessProfile.update({
                where: { organizationId: rye.organizationId },
                data: { financialYearStartMonth },
            });
        const september = new Date("2028-09-23T10:00:00Z");
        try {
            // April (the default): 28-29.
            const april = await issue(september);
            expect(april.number).toBe("RC/28-29/0001");

            // January: the year is 2028, a series never used.
            await setMonth(1);
            const january = await issue(september);
            expect(january.number).toBe("RC/2028/0001");

            // July: July 2028 to June 2029 is 28-29 again, which carries on.
            await setMonth(7);
            const july = await issue(september);
            expect(july.number).toBe("RC/28-29/0002");

            // What was issued keeps its number.
            const kept = await prisma.invoice.findMany({
                where: { id: { in: [april.id, january.id] } },
                select: { number: true },
                orderBy: { number: "asc" },
            });
            expect(kept.map((k) => k.number)).toEqual([
                "RC/2028/0001",
                "RC/28-29/0001",
            ]);
        } finally {
            await setMonth(4);
        }
    });
});
