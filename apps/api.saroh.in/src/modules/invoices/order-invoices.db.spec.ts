/**
 * GST and an invoice for every order against a real Postgres (ADR-008, U5):
 * a verified payment webhook makes exactly one order invoice and a replayed
 * delivery none; a refund makes its credit note; what is owed leaves order
 * invoices out; issued invoices cannot be edited, deleted or — once the
 * business is GST-registered — voided; two invoices across 1 April land in
 * their own financial year's series; a Karnataka business billing a Goa café
 * charges IGST.
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
import { creditNoteForRefund, ensureOrderInvoice } from "./order-invoicing";

const WEBHOOK_SECRET = "whsec_gst_test";

const payments = new PaymentsService(
    new FakeProviderFactory(new FakeMerchantProvider("RAZORPAY")),
);
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
        const refund = await prisma.paymentRefund.create({
            data: {
                organizationId: rye.organizationId,
                paymentIntentId: order.intentId,
                amountCents: 10620,
                currency: "INR",
                status: "PENDING",
                providerRefundId: `rfnd_${order.id}`,
                lines: {
                    create: [
                        {
                            organizationId: rye.organizationId,
                            orderItemId: croissant.id,
                            quantity: 1,
                            amountCents: 10620,
                        },
                    ],
                },
            },
        });

        await deliver({
            eventType: "refund.processed",
            outcome: "REFUNDED",
            providerIntentId: `prov_${order.id}`,
            providerRefundId: `rfnd_${order.id}`,
        });
        // The refund path making it too finds the one already there.
        await prisma.$transaction((tx) => creditNoteForRefund(tx, refund.id));

        const notes = await prisma.invoice.findMany({
            where: { relatedInvoiceId: invoice.id, kind: "CREDIT_NOTE" },
            include: { lines: true },
        });
        expect(notes).toHaveLength(1);
        const [note] = notes;
        expect(note.number).toMatch(/^RCCN\//);
        expect(note.paymentRefundId).toBe(refund.id);
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
});
