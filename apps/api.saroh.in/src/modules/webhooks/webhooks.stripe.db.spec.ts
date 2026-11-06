/**
 * Stripe's webhooks through the real verifier and the real inbox, against
 * a real Postgres:
 *
 * - a Stripe event delivered twice (the same `evt_`) is applied once;
 * - a refund Stripe reports `succeeded` on `refund.created`, and again on
 *   `refund.updated` under another event id, settles once: one refund row,
 *   the order refunded once.
 *
 * The merchant provider is the network-free fake; every key and secret is
 * made up. Runs in the integration project (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import { Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { createHmac } from "node:crypto";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import { StripeWebhookProvider } from "./providers/stripe.webhook";
import { DefaultWebhookProviderFactory } from "./providers/webhook-provider.factory";
import { WebhooksService } from "./webhooks.service";

const WEBHOOK_SECRET = "whsec_madeupstripedbspec";
const tag = `${process.pid}-${Date.now()}`;

const payments = new PaymentsService(
    new FakeProviderFactory(new FakeMerchantProvider("STRIPE")),
);
const webhooks = new WebhooksService(
    new DefaultWebhookProviderFactory([new StripeWebhookProvider()]),
    payments,
);

let orgId = "";
let storeId = "";
let customerId = "";
let seq = 0;

beforeAll(async () => {
    const owner = await prisma.user.create({
        data: { email: `stripe-owner-${tag}@example.com` },
    });
    orgId = (
        await prisma.organization.create({
            data: {
                name: "Harbour Tea",
                slug: `stripe-harbour-${tag}`,
                // Stripe is the Global edition's provider (DEC-208).
                edition: "GLOBAL",
                currency: "USD",
            },
        })
    ).id;
    await prisma.membership.create({
        data: { organizationId: orgId, userId: owner.id, role: "OWNER" },
    });
    const ctx: OrganizationContext = {
        organizationId: orgId,
        userId: owner.id,
        role: "OWNER",
        edition: "GLOBAL",
    };
    await giveBusinessDetails(orgId);
    storeId = (
        await prisma.store.create({
            data: {
                name: "Quay",
                slug: `stripe-quay-${tag}`,
                organizationId: orgId,
            },
        })
    ).id;
    customerId = (
        await prisma.customer.create({
            data: {
                storeId,
                organizationId: orgId,
                email: `stripe-buyer-${tag}@example.com`,
                firstName: "Ana",
                lastName: "Diaz",
            },
        })
    ).id;
    await payments.connectProvider(ctx, {
        provider: "STRIPE",
        publicKey: "pk_test_madeup",
        keyId: "pk_test_madeup",
        keySecret: "rk_test_madeup",
        webhookSecret: WEBHOOK_SECRET,
    });
});

beforeEach(() => {
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

/** Deliver one event as Stripe signs it now. */
function deliver(event: Record<string, unknown>) {
    const raw = Buffer.from(JSON.stringify(event));
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac("sha256", WEBHOOK_SECRET)
        .update(`${t}.`)
        .update(raw)
        .digest("hex");
    return webhooks.handle("stripe", orgId, raw, {
        "stripe-signature": `t=${t},v1=${v1}`,
    });
}

const evt = (id: string, type: string, object: Record<string, unknown>) => ({
    id,
    object: "event",
    api_version: "2026-10-28.endive",
    created: Math.floor(Date.now() / 1000),
    data: { object },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
});

/** A USD 20.00 order with an open Stripe PaymentIntent. */
async function stripeOrder() {
    seq += 1;
    const order = await prisma.order.create({
        data: {
            storeId,
            organizationId: orgId,
            orderId: `ST-${seq}`,
            customerId,
            currency: "USD",
            subtotal: "20.00",
            tax: "0.00",
            total: "20.00",
            status: "PENDING",
            paymentStatus: "UNPAID",
            fulfilment: "PICKUP",
        },
        select: { id: true },
    });
    const pi = `pi_st_${seq}_${tag}`;
    const intent = await prisma.paymentIntent.create({
        data: {
            organizationId: orgId,
            orderId: order.id,
            provider: "STRIPE",
            providerIntentId: pi,
            amountCents: 2000,
            currency: "USD",
            status: "REQUIRES_PAYMENT",
        },
    });
    return { order, intent, pi, charge: `ch_st_${seq}_${tag}` };
}

function succeeded(id: string, pi: string, charge: string) {
    return evt(id, "payment_intent.succeeded", {
        id: pi,
        object: "payment_intent",
        amount: 2000,
        amount_received: 2000,
        currency: "usd",
        latest_charge: charge,
        status: "succeeded",
        metadata: {},
    });
}

describe("Stripe webhooks (real verifier, real database)", () => {
    it("the same evt_ delivered twice is applied once", async () => {
        const { order, pi, charge } = await stripeOrder();
        const event = succeeded(`evt_dup_${tag}`, pi, charge);

        await expect(deliver(event)).resolves.toMatchObject({
            status: "processed",
        });
        await expect(deliver(event)).resolves.toEqual({
            status: "duplicate",
            changed: false,
        });
        expect(
            await prisma.webhookEvent.count({
                where: {
                    organizationId: orgId,
                    providerEventId: `evt_dup_${tag}`,
                },
            }),
        ).toBe(1);
        expect(
            (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
                .paymentStatus,
        ).toBe("PAID");
    });

    it("a refund created succeeded, then updated, settles once", async () => {
        const { order, intent, pi, charge } = await stripeOrder();
        await deliver(succeeded(`evt_paid_${seq}_${tag}`, pi, charge));

        // Made in Stripe's dashboard: no Saroh reference in its metadata.
        const refund = {
            id: `re_st_${seq}_${tag}`,
            object: "refund",
            amount: 2000,
            charge,
            currency: "usd",
            metadata: {},
            payment_intent: pi,
            status: "succeeded",
        };
        await deliver(evt(`evt_rc_${seq}_${tag}`, "refund.created", refund));
        const second = await deliver(
            evt(`evt_ru_${seq}_${tag}`, "refund.updated", refund),
        );
        expect(second.changed).toBe(false);

        const rows = await prisma.paymentRefund.findMany({
            where: { paymentIntentId: intent.id },
            select: { status: true, amountCents: true, providerRefundId: true },
        });
        expect(rows).toEqual([
            {
                status: "SUCCEEDED",
                amountCents: 2000,
                providerRefundId: refund.id,
            },
        ]);
        expect(
            (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
                .paymentStatus,
        ).toBe("REFUNDED");
    });
});
