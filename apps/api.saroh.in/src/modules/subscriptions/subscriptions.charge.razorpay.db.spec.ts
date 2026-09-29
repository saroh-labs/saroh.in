/**
 * Renewals charge the mandate through REAL Razorpay (round-2 D13 on D19),
 * against a real Postgres: the real adapter (its HTTP answered with the
 * D11 spike's shapes, `test/fixtures/razorpay-recurring.ts`) and the real
 * webhook verifier, signed with the business's own secret.
 *
 * - the gate: RAZORPAY_AUTOPAY off → the renewal is invoiced exactly as
 *   before, nothing is queued and Razorpay is never asked;
 * - on: the renewal's order carries the pre-debit notice 26 hours ahead,
 *   `order.notification.delivered` lets the debit go, and
 *   `payment.captured` pays the invoice (CHARGED);
 * - `payment.failed` → RENEWAL_FAILED, and Retry's look-up reads the
 *   order's payments before charging anything again.
 *
 * Only the app env is stubbed (for the credential key). Runs in the
 * integration project (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import { createHmac } from "node:crypto";

import { prisma } from "@saroh/database";

import {
    authLink,
    authPayment,
    chargeOrder,
    chargePayment,
    delivery,
    notice,
    token,
} from "../../../test/fixtures/razorpay-recurring";
import type { OrganizationContext } from "../../common/types/organization-context";
import { FlagKey } from "../feature-flags/flags";
import { InvoicesService } from "../invoices/invoices.service";
import { MandateChargesService } from "../payments/mandate-charges.service";
import { MandateSetupService } from "../payments/mandate-setup.service";
import { PaymentsService } from "../payments/payments.service";
import { DefaultProviderFactory } from "../payments/providers/provider.factory";
import { DefaultWebhookProviderFactory } from "../webhooks/providers/webhook-provider.factory";
import { WebhooksService } from "../webhooks/webhooks.service";
import type { ChargeJobPayload } from "./charge-job";
import { SUBSCRIPTION_CHARGE_TYPE } from "./charge-job";
import { SubscriptionChargeHandler } from "./subscription-charge.handler";
import { SubscriptionsService } from "./subscriptions.service";

const WEBHOOK_SECRET = "whsec_d13_razorpay";
const HOUR = 60 * 60 * 1000;

const providers = new DefaultProviderFactory();
const payments = new PaymentsService(providers);
const setups = new MandateSetupService(providers);
const charges = new MandateChargesService(providers);
const subscriptions = new SubscriptionsService(
    new InvoicesService(),
    undefined,
    charges,
);
const handler = new SubscriptionChargeHandler(charges);
const webhooks = new WebhooksService(
    new DefaultWebhookProviderFactory(),
    payments,
);

const tag = `${process.pid}-${Date.now()}`;
let n = 0;
const next = () => `${tag.replace(/\D/g, "")}${++n}`;

let owner: OrganizationContext;
let planId: string;

/** Razorpay's answers, by "METHOD path" (query string dropped). */
let routes: Record<string, unknown> = {};
const fetchMock = jest.fn((url: string, init?: RequestInit) => {
    const path = new URL(url).pathname.replace(/^\/v1/, "");
    const key = `${init?.method ?? "GET"} ${path}`;
    if (!(key in routes)) {
        return Promise.resolve(
            new Response(JSON.stringify({ error: { reason: "not_mocked" } }), {
                status: 400,
            }),
        );
    }
    const answer = routes[key];
    if (answer instanceof Response) return Promise.resolve(answer.clone());
    return Promise.resolve(
        new Response(JSON.stringify(routes[key]), { status: 200 }),
    );
});

/** The calls Razorpay was sent, as `METHOD path`. */
const sent = () =>
    fetchMock.mock.calls.map(
        ([url, init]) =>
            `${init?.method ?? "GET"} ${new URL(url).pathname.replace(/^\/v1/, "")}`,
    );

async function setFlag(enabled: boolean) {
    await prisma.featureFlag.upsert({
        where: { key: FlagKey.RAZORPAY_AUTOPAY },
        create: { key: FlagKey.RAZORPAY_AUTOPAY, enabledByDefault: false },
        update: {},
    });
    await prisma.featureFlagOverride.upsert({
        where: {
            flagKey_organizationId: {
                flagKey: FlagKey.RAZORPAY_AUTOPAY,
                organizationId: owner.organizationId,
            },
        },
        create: {
            flagKey: FlagKey.RAZORPAY_AUTOPAY,
            organizationId: owner.organizationId,
            enabled,
        },
        update: { enabled },
    });
}

beforeAll(async () => {
    global.fetch = fetchMock as unknown as typeof fetch;
    const user = await prisma.user.create({
        data: { email: `d13r-owner-${tag}@x.com` },
    });
    const org = await prisma.organization.create({
        data: { name: "Northwind", slug: `d13r-${tag}` },
    });
    owner = { organizationId: org.id, userId: user.id, role: "OWNER" };
    await payments.connectProvider(owner, {
        provider: "RAZORPAY",
        publicKey: "rzp_test_Public1",
        keyId: "rzp_test_Public1",
        keySecret: "rzp_secret",
        webhookSecret: WEBHOOK_SECRET,
    });
    planId = (
        await subscriptions.createPlan(owner, {
            name: "Monthly",
            price: "1200",
            currency: "INR",
            interval: "MONTH",
        })
    ).id;
});

beforeEach(async () => {
    routes = {};
    fetchMock.mockClear();
    await setFlag(true);
});

/** A delivery signed as Razorpay signs it, with the business's secret. */
async function webhook(body: unknown) {
    const raw = Buffer.from(JSON.stringify(body));
    return webhooks.handle("razorpay", owner.organizationId, raw, {
        "x-razorpay-signature": createHmac("sha256", WEBHOOK_SECRET)
            .update(raw)
            .digest("hex"),
        "x-razorpay-event-id": `evt_${next()}`,
    });
}

/** A member with ACTIVE UPI autopay through Razorpay, first period paid. */
async function autopayMember() {
    const contactId = (
        await prisma.contact.create({
            data: {
                organizationId: owner.organizationId,
                email: `m-${next()}@example.in`,
                firstName: "Asha",
                phone: "+919000090000",
            },
        })
    ).id;
    const { id: subscriptionId } = await subscriptions.subscribe(owner, {
        contactId,
        planId,
    });
    await prisma.invoice.updateMany({
        where: { subscriptionId },
        data: { status: "PAID", paidAt: new Date() },
    });
    const ids = {
        link: `inv_${next()}`,
        order: `order_${next()}`,
        customer: `cust_${next()}`,
        payment: `pay_${next()}`,
        token: `token_${next()}`,
    };
    routes["POST /subscription_registration/auth_links"] = authLink({
        id: ids.link,
        order_id: ids.order,
        customer_id: ids.customer,
    });
    const view = await setups.createSetup({
        organizationId: owner.organizationId,
        subscriptionId,
        method: "UPI",
        maxAmountCents: 180_000,
        firstAmountCents: 100,
        handoff: "HOSTED_LINK",
    });
    await webhook(
        delivery("payment.captured", {
            payment: authPayment({
                id: ids.payment,
                order_id: ids.order,
                invoice_id: ids.link,
                customer_id: ids.customer,
                token_id: ids.token,
            }),
        }),
    );
    await webhook(
        delivery("token.confirmed", {
            token: token("confirmed", { id: ids.token, max_amount: 180_000 }),
        }),
    );
    expect(
        (
            await prisma.paymentMandate.findUniqueOrThrow({
                where: { id: view.mandateId },
            })
        ).status,
    ).toBe("ACTIVE");
    return { subscriptionId, ids };
}

/** The period ends; the job renews it an hour later. */
async function renew(subscriptionId: string) {
    const sub = await prisma.customerSubscription.findUniqueOrThrow({
        where: { id: subscriptionId },
    });
    const at = new Date(sub.currentPeriodEnd.getTime() + HOUR);
    expect(await subscriptions.renewOne(subscriptionId, at)).toBe("renewed");
    const invoice = await prisma.invoice.findFirstOrThrow({
        where: { subscriptionId, status: "ISSUED" },
    });
    return { invoice, at };
}

async function runDue(invoiceId: string, now: Date) {
    const due = await prisma.job.findMany({
        where: {
            organizationId: owner.organizationId,
            type: SUBSCRIPTION_CHARGE_TYPE,
            status: "PENDING",
            runAt: { lte: now },
            payload: { path: ["invoiceId"], equals: invoiceId },
        },
        orderBy: { createdAt: "asc" },
    });
    for (const job of due) {
        await prisma.job.update({
            where: { id: job.id },
            data: { status: "DONE" },
        });
        await handler.run(
            owner.organizationId,
            job.payload as unknown as ChargeJobPayload,
            now,
        );
    }
    return due.length;
}

const kinds = async (subscriptionId: string) =>
    (
        await prisma.subscriptionEvent.findMany({
            where: { subscriptionId },
            orderBy: { createdAt: "asc" },
        })
    ).map((e) => e.kind);

describe("the gate (waves plan boundary 6)", () => {
    it("RAZORPAY_AUTOPAY off: the renewal is invoiced as before, and Razorpay is never asked", async () => {
        const who = await autopayMember();
        await setFlag(false);
        fetchMock.mockClear();
        const { invoice } = await renew(who.subscriptionId);
        expect(invoice.status).toBe("ISSUED");
        expect(
            await prisma.paymentIntent.count({
                where: { invoiceId: invoice.id },
            }),
        ).toBe(0);
        expect(
            await prisma.job.count({
                where: {
                    type: SUBSCRIPTION_CHARGE_TYPE,
                    payload: { path: ["invoiceId"], equals: invoice.id },
                },
            }),
        ).toBe(0);
        expect(fetchMock).not.toHaveBeenCalled();
        // Retry is a pay link, as before D13.
        await prisma.invoice.update({
            where: { id: invoice.id },
            data: { dueAt: new Date(Date.now() - HOUR) },
        });
        expect(
            (await subscriptions.get(owner, who.subscriptionId)).retryVia,
        ).toBe("PAY_LINK");
    });

    it("switched off after the renewal: the queued charge is let go, never sent", async () => {
        const who = await autopayMember();
        const { invoice, at } = await renew(who.subscriptionId);
        await setFlag(false);
        fetchMock.mockClear();
        await runDue(invoice.id, at);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(
            (
                await prisma.paymentIntent.findFirstOrThrow({
                    where: { invoiceId: invoice.id },
                })
            ).status,
        ).toBe("CANCELLED");
    });
});

describe("a renewal charged through Razorpay", () => {
    it("order with the notice → notice delivered → debit → payment.captured → PAID and CHARGED", async () => {
        const who = await autopayMember();
        const { invoice, at } = await renew(who.subscriptionId);
        const key = `inv_${invoice.id}_1`;
        const orderId = `order_${next()}`;
        const paymentId = `pay_${next()}`;
        const paymentAfter = Math.floor((at.getTime() + 26 * HOUR) / 1000);

        routes["GET /orders"] = { count: 0, items: [] };
        routes["POST /orders"] = chargeOrder("created", {
            id: orderId,
            receipt: key,
            notification: {
                id: `notification_${next()}`,
                token_id: who.ids.token,
                payment_after: paymentAfter,
                status: "created",
                delivered_at: null,
            },
        });
        expect(await runDue(invoice.id, at)).toBe(1);
        const order = fetchMock.mock.calls.find(
            ([u, i]) => i?.method === "POST" && u.endsWith("/orders"),
        );
        expect(JSON.parse(order?.[1]?.body as string)).toMatchObject({
            amount: 120_000,
            receipt: key,
            notification: {
                token_id: who.ids.token,
                payment_after: paymentAfter,
            },
        });

        await webhook(
            delivery("order.notification.delivered", {
                notification: { ...notice("delivered"), order_id: orderId },
            }),
        );

        routes[`GET /orders/${orderId}/payments`] = { items: [] };
        routes[`GET /customers/${who.ids.customer}`] = {
            id: who.ids.customer,
            email: "asha@example.in",
            contact: "+919000090000",
        };
        routes["POST /payments/create/recurring"] = {
            razorpay_payment_id: paymentId,
            razorpay_order_id: orderId,
        };
        fetchMock.mockClear();
        expect(
            await runDue(invoice.id, new Date(at.getTime() + 27 * HOUR)),
        ).toBe(1);
        expect(sent()).toContain("POST /payments/create/recurring");

        await webhook(
            delivery("payment.captured", {
                payment: chargePayment("captured", {
                    id: paymentId,
                    order_id: orderId,
                    customer_id: who.ids.customer,
                    token_id: who.ids.token,
                }),
            }),
        );
        expect(
            (
                await prisma.invoice.findUniqueOrThrow({
                    where: { id: invoice.id },
                })
            ).status,
        ).toBe("PAID");
        expect((await kinds(who.subscriptionId)).slice(-2)).toEqual([
            "RENEWED",
            "CHARGED",
        ]);
    });

    it("payment.failed → RENEWAL_FAILED; Retry reads the order's payments before charging again", async () => {
        const who = await autopayMember();
        const { invoice, at } = await renew(who.subscriptionId);
        const key = `inv_${invoice.id}_1`;
        const orderId = `order_${next()}`;
        const paymentId = `pay_${next()}`;
        routes["GET /orders"] = { count: 0, items: [] };
        routes["POST /orders"] = chargeOrder("delivered", {
            id: orderId,
            receipt: key,
            notification: {
                id: `notification_${next()}`,
                token_id: who.ids.token,
                payment_after: Math.floor((at.getTime() + 26 * HOUR) / 1000),
                status: "delivered",
                delivered_at: Math.floor(at.getTime() / 1000),
            },
        });
        await runDue(invoice.id, at);
        routes[`GET /orders/${orderId}/payments`] = { items: [] };
        routes[`GET /customers/${who.ids.customer}`] = {
            id: who.ids.customer,
            email: "asha@example.in",
            contact: "+919000090000",
        };
        routes["POST /payments/create/recurring"] = {
            razorpay_payment_id: paymentId,
            razorpay_order_id: orderId,
        };
        await runDue(invoice.id, new Date(at.getTime() + 27 * HOUR));

        const failed = chargePayment("failed", {
            id: paymentId,
            order_id: orderId,
            customer_id: who.ids.customer,
            token_id: who.ids.token,
        });
        await webhook(delivery("payment.failed", { payment: failed }));
        expect(await kinds(who.subscriptionId)).toContain("RENEWAL_FAILED");
        expect(
            (
                await prisma.paymentIntent.findFirstOrThrow({
                    where: { invoiceId: invoice.id, idempotencyKey: key },
                })
            ).status,
        ).toBe("FAILED");

        // Retry by autopay: a new order under the next key.
        routes["POST /orders"] = chargeOrder("created", {
            id: `order_${next()}`,
            receipt: `inv_${invoice.id}_2`,
        });
        const retried = await subscriptions.retryPayment(
            owner,
            who.subscriptionId,
            "MANDATE",
        );
        expect(retried.via).toBe("MANDATE");
        fetchMock.mockClear();
        await runDue(invoice.id, new Date());
        const second = fetchMock.mock.calls.find(
            ([u, i]) => i?.method === "POST" && u.endsWith("/orders"),
        );
        expect(JSON.parse(second?.[1]?.body as string)).toMatchObject({
            receipt: `inv_${invoice.id}_2`,
        });
    });

    it("an unanswered debit: Retry finds Razorpay's capture and pays the invoice, with no second debit", async () => {
        const who = await autopayMember();
        const { invoice, at } = await renew(who.subscriptionId);
        const key = `inv_${invoice.id}_1`;
        const orderId = `order_${next()}`;
        const paymentId = `pay_${next()}`;
        routes["GET /orders"] = { count: 0, items: [] };
        routes["POST /orders"] = chargeOrder("delivered", {
            id: orderId,
            receipt: key,
            notification: {
                id: `notification_${next()}`,
                token_id: who.ids.token,
                payment_after: Math.floor((at.getTime() + 26 * HOUR) / 1000),
                status: "delivered",
                delivered_at: Math.floor(at.getTime() / 1000),
            },
        });
        await runDue(invoice.id, at);
        routes[`GET /orders/${orderId}/payments`] = { items: [] };
        routes[`GET /customers/${who.ids.customer}`] = {
            id: who.ids.customer,
            email: "asha@example.in",
        };
        // Razorpay took the debit; its answer never came back (a 504).
        routes["POST /payments/create/recurring"] = new Response("{}", {
            status: 504,
        });
        await runDue(invoice.id, new Date(at.getTime() + 27 * HOUR));
        expect(
            (
                await prisma.paymentIntent.findFirstOrThrow({
                    where: { invoiceId: invoice.id, idempotencyKey: key },
                })
            ).status,
        ).toBe("PROCESSING");

        // It was captured after all; the webhook is lost.
        routes[`GET /orders/${orderId}/payments`] = {
            items: [
                chargePayment("captured", {
                    id: paymentId,
                    order_id: orderId,
                }),
            ],
        };
        await prisma.invoice.update({
            where: { id: invoice.id },
            data: { dueAt: new Date(Date.now() - HOUR) },
        });
        fetchMock.mockClear();
        const retried = await subscriptions.retryPayment(
            owner,
            who.subscriptionId,
            "MANDATE",
        );
        expect(retried).toMatchObject({ paid: true });
        expect(sent()).toEqual([`GET /orders/${orderId}/payments`]);
        expect(
            await prisma.invoice.findUniqueOrThrow({
                where: { id: invoice.id },
            }),
        ).toMatchObject({ status: "PAID", paymentReference: paymentId });
    });
});
