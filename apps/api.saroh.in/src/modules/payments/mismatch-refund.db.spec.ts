/**
 * A capture taken at a different amount than asked (PAY-06), against a real
 * Postgres, from the payment webhook to the money going back:
 *
 * - it shows on Home's refunds owed at what it captured, though its order
 *   is FAILED;
 * - "Refund" sends exactly that, against that payment, once, and leaves the
 *   order as it was; the row leaves Home;
 * - the provider's refund webhook settles it rather than being refused on
 *   a FAILED order, and a refund made in the provider's dashboard clears it
 *   too;
 * - an invoice paid twice still lists by its intent, whatever its attempt
 *   recorded, and a mismatch is never listed twice.
 *
 * The provider and the webhook verifier are the network-free fakes. Runs in
 * the integration project (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import { prisma } from "@saroh/database";
import { createHmac } from "node:crypto";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import {
    invoiceRefundsOwedWhere,
    mismatchesOwed,
} from "../home/home-mismatch-refunds";
import { failedOrderRefunds } from "../home/home-refunds-failed";
import {
    FakeWebhookProvider,
    FakeWebhookProviderFactory,
} from "../webhooks/providers/fake.webhook";
import { WebhooksService } from "../webhooks/webhooks.service";
import { mismatchRefundKey } from "./mismatch-refund";
import { PaymentsService } from "./payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "./providers/fake.provider";

const WEBHOOK_SECRET = "whsec_mismatch_test";
const tag = `${process.pid}-${Date.now()}`;

const fake = new FakeMerchantProvider("RAZORPAY");
const payments = new PaymentsService(new FakeProviderFactory(fake));
const webhooks = new WebhooksService(
    new FakeWebhookProviderFactory(new FakeWebhookProvider("RAZORPAY")),
    payments,
);

let orgId = "";
let owner: OrganizationContext;
let storeId = "";
let customerId = "";
let seq = 0;

beforeAll(async () => {
    const ownerId = (
        await prisma.user.create({
            data: { email: `mm-owner-${tag}@example.com` },
        })
    ).id;
    orgId = (
        await prisma.organization.create({
            data: { name: "Rye & Co.", slug: `mm-rye-${tag}` },
        })
    ).id;
    await prisma.membership.create({
        data: { organizationId: orgId, userId: ownerId, role: "OWNER" },
    });
    owner = { organizationId: orgId, userId: ownerId, role: "OWNER" };
    await giveBusinessDetails(orgId);
    storeId = (
        await prisma.store.create({
            data: {
                name: "Hill Road",
                slug: `mm-hill-${tag}`,
                organizationId: orgId,
            },
        })
    ).id;
    customerId = (
        await prisma.customer.create({
            data: {
                storeId,
                organizationId: orgId,
                email: `mm-buyer-${tag}@example.com`,
                firstName: "Farah",
                lastName: "Khan",
            },
        })
    ).id;
    await payments.connectProvider(owner, {
        provider: "RAZORPAY",
        publicKey: "rzp_test_Public1",
        keyId: "rzp_test_Public1",
        keySecret: "rzp_secret",
        webhookSecret: WEBHOOK_SECRET,
    });
});

function webhook(event: Record<string, unknown>) {
    seq += 1;
    const raw = Buffer.from(
        JSON.stringify({ providerEventId: `evt_mm_${seq}_${tag}`, ...event }),
    );
    return webhooks.handle("razorpay", orgId, raw, {
        "x-fake-signature": createHmac("sha256", WEBHOOK_SECRET)
            .update(raw)
            .digest("hex"),
    });
}

/**
 * An unpaid ₹480 order whose payment the provider captured at ₹450: the
 * order fails, and the capture is recorded as owed back.
 */
async function mismatchedOrder() {
    seq += 1;
    const order = await prisma.order.create({
        data: {
            storeId,
            organizationId: orgId,
            orderId: `MM-${seq}`,
            customerId,
            currency: "INR",
            subtotal: "480.00",
            tax: "0.00",
            total: "480.00",
            status: "PENDING",
            paymentStatus: "UNPAID",
            fulfilment: "PICKUP",
        },
        select: { id: true, orderId: true },
    });
    const providerIntentId = `order_mm_${seq}_${tag}`;
    const paymentRef = `pay_mm_${seq}_${tag}`;
    const intent = await prisma.paymentIntent.create({
        data: {
            organizationId: orgId,
            orderId: order.id,
            provider: "RAZORPAY",
            providerIntentId,
            amountCents: 48000,
            currency: "INR",
            status: "REQUIRES_PAYMENT",
        },
    });
    await webhook({
        eventType: "payment.captured",
        outcome: "SUCCEEDED",
        providerIntentId,
        providerPaymentRef: paymentRef,
        capturedAmountCents: 45000,
        capturedCurrency: "INR",
    });
    const attempt = await prisma.paymentAttempt.findFirstOrThrow({
        where: {
            paymentIntentId: intent.id,
            status: "CAPTURED_NEEDS_REFUND",
        },
    });
    return { order, intent, attempt, providerIntentId, paymentRef };
}

const orderStatus = (id: string) =>
    prisma.order
        .findUniqueOrThrow({ where: { id }, select: { paymentStatus: true } })
        .then((o) => o.paymentStatus);

const owedIds = async () =>
    (await mismatchesOwed(prisma, orgId)).rows.map((r) => r.id);

describe("a capture at the wrong amount, refunded (PAY-06, real database)", () => {
    it("shows on Home at what it took, though its order failed", async () => {
        const { order, intent, attempt } = await mismatchedOrder();
        expect(await orderStatus(order.id)).toBe("FAILED");
        expect(
            (
                await prisma.paymentIntent.findUniqueOrThrow({
                    where: { id: intent.id },
                })
            ).status,
        ).toBe("FAILED");

        const { rows } = await mismatchesOwed(prisma, orgId);
        expect(rows.find((r) => r.id === attempt.id)).toMatchObject({
            title: `#${order.orderId}`,
            subtitle:
                "Farah Khan · Paid online at a different amount than asked",
            amountMinor: 45000,
            currency: "INR",
            href: `/commerce/orders/${order.id}`,
        });
    });

    it("Refund sends exactly what it took, against that payment, once — and the order stays as it was", async () => {
        const { order, attempt, paymentRef, providerIntentId } =
            await mismatchedOrder();
        const before = fake.refundCalls.length;

        const first = await payments.refundAmountMismatch(owner, attempt.id);
        expect(first).toMatchObject({ amountCents: 45000, currency: "INR" });
        expect(fake.refundCalls).toHaveLength(before + 1);
        expect(fake.refundCalls.at(-1)).toMatchObject({
            reference: first.refundId,
            providerIntentId,
            providerPaymentRef: paymentRef,
            amountCents: 45000,
        });
        const row = await prisma.paymentRefund.findUniqueOrThrow({
            where: { id: first.refundId },
        });
        expect(row).toMatchObject({
            status: "PENDING",
            idempotencyKey: mismatchRefundKey(attempt.id),
        });
        expect(row.providerRefundId).not.toBeNull();

        // Again: the same refund, nothing new sent.
        const again = await payments.refundAmountMismatch(owner, attempt.id);
        expect(again.refundId).toBe(first.refundId);
        expect(fake.refundCalls).toHaveLength(before + 1);

        // Off Home; the order untouched — no step, no credit note.
        expect(await owedIds()).not.toContain(attempt.id);
        expect(await orderStatus(order.id)).toBe("FAILED");
        expect(
            await prisma.orderEvent.count({
                where: { orderId: order.id, kind: "REFUND" },
            }),
        ).toBe(0);
        expect(
            await prisma.invoice.count({
                where: { orderId: order.id, kind: "CREDIT_NOTE" },
            }),
        ).toBe(0);

        // The provider's refund webhook settles it — never refused on the
        // FAILED order.
        const settled = await webhook({
            eventType: "refund.processed",
            outcome: "REFUNDED",
            providerIntentId,
            providerPaymentRef: paymentRef,
            providerRefundId: row.providerRefundId,
            refundReference: row.id,
            refundAmountCents: 45000,
        });
        expect(settled).toEqual({ status: "processed", changed: true });
        expect(
            (
                await prisma.paymentRefund.findUniqueOrThrow({
                    where: { id: row.id },
                })
            ).status,
        ).toBe("SUCCEEDED");
        expect(await orderStatus(order.id)).toBe("FAILED");
    });

    it("a refund the provider refused leaves it owed, and Refund sends a fresh one", async () => {
        const { attempt } = await mismatchedOrder();
        fake.failNextRefund("REFUSED");
        await expect(
            payments.refundAmountMismatch(owner, attempt.id),
        ).rejects.toThrow("refused the refund");
        expect(await owedIds()).toContain(attempt.id);
        // Not "a refund didn't go through" on its order: it is no order refund.
        expect(await failedOrderRefunds(prisma, orgId)).toBeNull();

        const retried = await payments.refundAmountMismatch(owner, attempt.id);
        const row = await prisma.paymentRefund.findUniqueOrThrow({
            where: { id: retried.refundId },
        });
        expect(row.idempotencyKey).toBe(mismatchRefundKey(attempt.id, 2));
        expect(await owedIds()).not.toContain(attempt.id);
    });

    it("a refund made in the provider's dashboard clears it too", async () => {
        const { order, intent, attempt, paymentRef, providerIntentId } =
            await mismatchedOrder();
        const result = await webhook({
            eventType: "refund.processed",
            outcome: "REFUNDED",
            providerIntentId,
            providerPaymentRef: paymentRef,
            providerRefundId: `rfnd_dash_${tag}`,
            refundAmountCents: 45000,
        });
        expect(result).toEqual({ status: "processed", changed: true });
        expect(
            await prisma.paymentRefund.findFirstOrThrow({
                where: { providerRefundId: `rfnd_dash_${tag}` },
            }),
        ).toMatchObject({
            paymentIntentId: intent.id,
            status: "SUCCEEDED",
            amountCents: 45000,
            idempotencyKey: mismatchRefundKey(attempt.id),
        });
        expect(await owedIds()).not.toContain(attempt.id);
        expect(await orderStatus(order.id)).toBe("FAILED");

        // A replay records nothing more.
        await webhook({
            eventType: "refund.processed",
            outcome: "REFUNDED",
            providerIntentId,
            providerPaymentRef: paymentRef,
            providerRefundId: `rfnd_dash_${tag}`,
            refundAmountCents: 45000,
        });
        expect(
            await prisma.paymentRefund.count({
                where: { providerRefundId: `rfnd_dash_${tag}` },
            }),
        ).toBe(1);
    });

    it("refuses another business's payment, and one that wasn't a mismatch", async () => {
        const { attempt } = await mismatchedOrder();
        await expect(
            payments.refundAmountMismatch(
                { ...owner, organizationId: "org_elsewhere" },
                attempt.id,
            ),
        ).rejects.toThrow("Payment not found");
        await expect(
            payments.refundAmountMismatch(owner, "att_nope"),
        ).rejects.toThrow("Payment not found");
    });
});

describe("invoices paid twice beside mismatches (Home's refunds owed)", () => {
    async function invoiceIntent(rawResponse: unknown) {
        seq += 1;
        const invoice = await prisma.invoice.create({
            data: {
                organizationId: orgId,
                currency: "INR",
                subtotal: "100.00",
                total: "100.00",
                status: "PAID",
            },
        });
        const intent = await prisma.paymentIntent.create({
            data: {
                organizationId: orgId,
                invoiceId: invoice.id,
                provider: "RAZORPAY",
                providerIntentId: `order_inv_${seq}_${tag}`,
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
                providerRef: `pay_inv_${seq}_${tag}`,
                status: "CAPTURED_NEEDS_REFUND",
                ...(rawResponse === undefined
                    ? {}
                    : { rawResponse: rawResponse as object }),
            },
        });
        return intent.id;
    }

    it("lists one whatever its attempt recorded, and never a mismatch twice", async () => {
        const paidTwice = await invoiceIntent({ invoiceStatus: "PAID" });
        const noReason = await invoiceIntent(undefined);
        const otherKeys = await invoiceIntent({ note: "no reason here" });
        const mismatch = await invoiceIntent({
            invoiceStatus: "AMOUNT_MISMATCH",
            capturedAmountCents: 12000,
        });
        const listed = (
            await prisma.paymentIntent.findMany({
                where: invoiceRefundsOwedWhere(orgId),
                select: { id: true },
            })
        ).map((r) => r.id);
        expect(listed).toEqual(
            expect.arrayContaining([paidTwice, noReason, otherKeys]),
        );
        expect(listed).not.toContain(mismatch);
        // The mismatch is listed by its own capture instead, at what it took.
        const own = (await mismatchesOwed(prisma, orgId)).rows.find(
            (r) => r.amountMinor === 12000,
        );
        expect(own?.href).toMatch(/^\/billing\/invoices\//);
    });
});
