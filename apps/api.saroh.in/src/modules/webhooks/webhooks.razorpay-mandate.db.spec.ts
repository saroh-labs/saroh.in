/**
 * Razorpay autopay end to end against a real Postgres (round-2 D19): the
 * real adapter (its HTTP answered with the D11 spike's recorded shapes)
 * and the real webhook verifier, signed with the business's own secret.
 *
 * - the gate: no autopay through Razorpay until RAZORPAY_AUTOPAY is on;
 * - set-up → the authorisation's payment names its token → token.confirmed
 *   → ACTIVE with a masked hint; the same when token.confirmed comes first;
 * - a charge: order with notice → notice delivered → debit → captured →
 *   the invoice PAID; then token.cancelled → CANCELLED;
 * - a link that lapses → FAILED; an unknown token → acknowledged, nothing
 *   written; a bad signature → 401, nothing written.
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

import { ConflictException, UnauthorizedException } from "@nestjs/common";
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
import {
    earliestDebitAt,
    MandateChargesService,
} from "../payments/mandate-charges.service";
import { MandateSetupService } from "../payments/mandate-setup.service";
import { PaymentsService } from "../payments/payments.service";
import { DefaultProviderFactory } from "../payments/providers/provider.factory";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { DefaultWebhookProviderFactory } from "./providers/webhook-provider.factory";
import { WebhooksService } from "./webhooks.service";

const WEBHOOK_SECRET = "whsec_d19_business";
const HOUR = 60 * 60 * 1000;

const providers = new DefaultProviderFactory();
const payments = new PaymentsService(providers);
const setups = new MandateSetupService(providers);
const charges = new MandateChargesService(providers);
const webhooks = new WebhooksService(
    new DefaultWebhookProviderFactory(),
    payments,
);
const subscriptions = new SubscriptionsService(new InvoicesService());

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
    return Promise.resolve(
        new Response(JSON.stringify(routes[key]), { status: 200 }),
    );
});

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
        data: { email: `d19-owner-${tag}@x.com` },
    });
    const org = await prisma.organization.create({
        data: { name: "Northwind", slug: `d19-${tag}` },
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
async function webhook(body: unknown, secret = WEBHOOK_SECRET) {
    const raw = Buffer.from(JSON.stringify(body));
    return webhooks.handle("razorpay", owner.organizationId, raw, {
        "x-razorpay-signature": createHmac("sha256", secret)
            .update(raw)
            .digest("hex"),
        "x-razorpay-event-id": `evt_${next()}`,
    });
}

/** A member, and a Razorpay set-up for them with per-test ids. */
async function setUp() {
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
    });
    const payment = authPayment({
        id: ids.payment,
        order_id: ids.order,
        invoice_id: ids.link,
        customer_id: ids.customer,
        token_id: ids.token,
    });
    const confirmed = token("confirmed", {
        id: ids.token,
        max_amount: 180_000,
    });
    return {
        contactId,
        subscriptionId,
        mandateId: view.mandateId,
        ids,
        payment,
        confirmed,
    };
}

const mandateOf = (id: string) =>
    prisma.paymentMandate.findUniqueOrThrow({ where: { id } });

describe("the gate (waves plan boundary 6)", () => {
    it("RAZORPAY_AUTOPAY off: no autopay offered, no set-up, no call", async () => {
        await setFlag(false);
        expect(await setups.mandateMethods(owner.organizationId)).toEqual([]);

        const contactId = (
            await prisma.contact.create({
                data: {
                    organizationId: owner.organizationId,
                    email: `off-${next()}@example.in`,
                    firstName: "Off",
                },
            })
        ).id;
        const { id: subscriptionId } = await subscriptions.subscribe(owner, {
            contactId,
            planId,
        });
        await expect(
            setups.createSetup({
                organizationId: owner.organizationId,
                subscriptionId,
                method: "UPI",
                maxAmountCents: 180_000,
            }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(
            await prisma.paymentMandate.count({ where: { subscriptionId } }),
        ).toBe(0);
    });

    it("never configured: fails closed", async () => {
        await prisma.featureFlagOverride.deleteMany({
            where: { organizationId: owner.organizationId },
        });
        await prisma.featureFlag.deleteMany({
            where: { key: FlagKey.RAZORPAY_AUTOPAY },
        });
        expect(await setups.mandateMethods(owner.organizationId)).toEqual([]);
    });

    it("on: UPI, card and eMandate are offered", async () => {
        expect(await setups.mandateMethods(owner.organizationId)).toEqual([
            { provider: "RAZORPAY", methods: ["UPI", "CARD", "EMANDATE"] },
        ]);
    });
});

describe("authorisation", () => {
    it("set-up → the payment names the token → token.confirmed → ACTIVE with a masked hint", async () => {
        const s = await setUp();
        let row = await mandateOf(s.mandateId);
        expect(row).toMatchObject({
            status: "PENDING",
            provider: "RAZORPAY",
            setupReference: s.ids.link,
            providerCustomerId: s.ids.customer,
            providerMandateId: null,
        });

        expect(
            await webhook(delivery("payment.captured", { payment: s.payment })),
        ).toEqual({ status: "processed", changed: true });
        row = await mandateOf(s.mandateId);
        expect(row).toMatchObject({
            status: "PENDING",
            providerMandateId: s.ids.token,
        });

        expect(
            await webhook(delivery("token.confirmed", { token: s.confirmed })),
        ).toEqual({ status: "processed", changed: true });
        row = await mandateOf(s.mandateId);
        expect(row).toMatchObject({
            status: "ACTIVE",
            method: "UPI",
            displayHint: "te•••@razorpay",
        });
        expect(JSON.stringify(row)).not.toContain("test.user");
    });

    it("token.confirmed before the payment: applied once the paid link names the token", async () => {
        const s = await setUp();

        expect(
            await webhook(delivery("token.confirmed", { token: s.confirmed })),
        ).toEqual({ status: "ignored", changed: false });
        expect((await mandateOf(s.mandateId)).status).toBe("PENDING");

        expect(
            await webhook(
                delivery("invoice.paid", {
                    invoice: authLink({
                        id: s.ids.link,
                        status: "paid",
                        payment_id: s.ids.payment,
                        customer_id: s.ids.customer,
                        order_id: s.ids.order,
                    }),
                    payment: s.payment,
                }),
            ),
        ).toEqual({ status: "processed", changed: true });

        expect(await mandateOf(s.mandateId)).toMatchObject({
            status: "ACTIVE",
            providerMandateId: s.ids.token,
        });
        const early = await prisma.webhookEvent.findFirst({
            where: {
                organizationId: owner.organizationId,
                eventType: "token.confirmed",
                payload: {
                    path: ["payload", "token", "entity", "id"],
                    equals: s.ids.token,
                },
            },
        });
        expect(early?.status).toBe("PROCESSED");
    });

    it("the link lapses unpaid → FAILED", async () => {
        const s = await setUp();
        await webhook(
            delivery("invoice.expired", {
                invoice: authLink({ id: s.ids.link, status: "expired" }),
            }),
        );
        expect(await mandateOf(s.mandateId)).toMatchObject({
            status: "FAILED",
            failureReason: "setup_expired",
        });
    });

    it("a token Saroh doesn't have: acknowledged, nothing written", async () => {
        const before = await prisma.paymentMandate.count();
        expect(
            await webhook(
                delivery("token.cancelled", {
                    token: token("cancelled", { id: `token_${next()}` }),
                }),
            ),
        ).toEqual({ status: "ignored", changed: false });
        expect(await prisma.paymentMandate.count()).toBe(before);
    });

    it("signed with another secret: 401, nothing recorded", async () => {
        const s = await setUp();
        const inbox = await prisma.webhookEvent.count();
        await expect(
            webhook(
                delivery("token.confirmed", { token: s.confirmed }),
                "whsec_someone_else",
            ),
        ).rejects.toBeInstanceOf(UnauthorizedException);
        expect(await prisma.webhookEvent.count()).toBe(inbox);
        expect((await mandateOf(s.mandateId)).status).toBe("PENDING");
    });
});

describe("a charge, then the customer cancels", () => {
    it("notice delivered → debit → captured → invoice PAID; token.cancelled → CANCELLED", async () => {
        const s = await setUp();
        await webhook(delivery("payment.captured", { payment: s.payment }));
        await webhook(delivery("token.confirmed", { token: s.confirmed }));

        const invoice = await prisma.invoice.create({
            data: {
                organizationId: owner.organizationId,
                contactId: s.contactId,
                subscriptionId: s.subscriptionId,
                status: "ISSUED",
                currency: "INR",
                subtotal: "1200",
                total: "1200",
                issuedAt: new Date(),
                dueAt: new Date(Date.now() + 7 * 24 * HOUR),
            },
        });
        const key = `inv_${invoice.id}_1`;
        const orderId = `order_${next()}`;
        const paymentId = `pay_${next()}`;
        const now = new Date();

        routes["GET /orders"] = { count: 0, items: [] };
        routes["POST /orders"] = chargeOrder("created", {
            id: orderId,
            receipt: key,
            notification: {
                id: `notification_${next()}`,
                token_id: s.ids.token,
                payment_after: Math.floor(
                    earliestDebitAt(now).getTime() / 1000,
                ),
                status: "created",
                delivered_at: null,
            },
        });
        const prepared = await charges.prepareCharge({
            organizationId: owner.organizationId,
            mandateId: s.mandateId,
            invoiceId: invoice.id,
            key,
            debitAt: earliestDebitAt(now),
        });
        expect(prepared).toMatchObject({
            status: "PREPARED",
            providerIntentId: orderId,
            preDebitStatus: "PENDING",
        });
        if (prepared.status !== "PREPARED") throw new Error("not prepared");
        const sentOrder = fetchMock.mock.calls.find(
            ([u, i]) => i?.method === "POST" && u.endsWith("/orders"),
        );
        expect(JSON.parse(sentOrder?.[1]?.body as string)).toMatchObject({
            receipt: key,
            notification: { token_id: s.ids.token },
        });

        expect(
            await webhook(
                delivery("order.notification.delivered", {
                    notification: { ...notice("delivered"), order_id: orderId },
                }),
            ),
        ).toEqual({ status: "processed", changed: true });

        routes[`GET /orders/${orderId}/payments`] = { items: [] };
        routes[`GET /customers/${s.ids.customer}`] = {
            id: s.ids.customer,
            email: "asha@example.in",
            contact: "+919000090000",
        };
        routes["POST /payments/create/recurring"] = {
            razorpay_payment_id: paymentId,
            razorpay_order_id: orderId,
        };
        expect(
            await charges.charge({
                organizationId: owner.organizationId,
                intentId: prepared.intentId,
                now: new Date(now.getTime() + 27 * HOUR),
            }),
        ).toEqual({
            status: "CHARGING",
            intentId: prepared.intentId,
            providerPaymentRef: paymentId,
        });

        await webhook(
            delivery("payment.captured", {
                payment: chargePayment("captured", {
                    id: paymentId,
                    order_id: orderId,
                    customer_id: s.ids.customer,
                    token_id: s.ids.token,
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
        expect(
            (
                await prisma.paymentIntent.findUniqueOrThrow({
                    where: { id: prepared.intentId },
                })
            ).status,
        ).toBe("SUCCEEDED");

        await webhook(
            delivery("token.cancelled", {
                token: token("cancelled", { id: s.ids.token }),
            }),
        );
        expect(await mandateOf(s.mandateId)).toMatchObject({
            status: "CANCELLED",
            cancelReason: "PROVIDER",
        });
    });
});
