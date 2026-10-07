/**
 * The customer sets up autopay through REAL Razorpay (D12 on D19), end to
 * end against a real Postgres: the real adapter (its HTTP answered with the
 * D11 spike's and Razorpay's documented shapes, `test/fixtures/
 * razorpay-recurring.ts`) and the real webhook verifier, signed with the
 * business's own secret.
 *
 * - the gate: RAZORPAY_AUTOPAY off → nothing offered, nothing started;
 * - the pay link, UPI: one authorisation ORDER for the invoice's amount →
 *   its `payment.captured` pays the invoice once (and `order.paid` doesn't
 *   again) and names the token → `token.confirmed` → ACTIVE; and the same
 *   when `token.confirmed` comes first;
 * - a lost webhook: the page asks Razorpay (the order's payment → token);
 * - joining from the Prices page, both arrival orders: the mandate row is
 *   made by the payment that starts the subscription, then linked;
 * - the account with nothing owed, eMandate: a ₹0 authorisation (UPI and
 *   card take the ₹1 check: `autopay-check.razorpay.db.spec.ts`, D12B).
 *
 * Only the app env is stubbed (the credential key, and the renderer's
 * apex). Runs in the integration project (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
        RENDERER_URL: "https://saroh.app",
    },
}));

import { createHmac } from "node:crypto";

import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { giveBusinessDetails } from "../../../test/business-details";
import {
    authCustomer,
    authOrder,
    authPayment,
    delivery,
    token,
} from "../../../test/fixtures/razorpay-recurring";
import type { OrganizationContext } from "../../common/types/organization-context";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { FlagKey } from "../feature-flags/flags";
import { InvoicesService } from "../invoices/invoices.service";
import type { CustomerContext } from "../site-accounts/customer-context.decorator";
import { AccountAutopayService } from "../subscriptions/account-autopay.service";
import { PublicPlanJoinService } from "../subscriptions/public-plan-join.service";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { DefaultWebhookProviderFactory } from "../webhooks/providers/webhook-provider.factory";
import { WebhooksService } from "../webhooks/webhooks.service";
import { AutopayService } from "./autopay.service";
import { MandateSetupService } from "./mandate-setup.service";
import { PaymentsService } from "./payments.service";
import { DefaultProviderFactory } from "./providers/provider.factory";
import { PublicInvoicesService } from "./public-invoices.service";

const WEBHOOK_SECRET = "whsec_d12_razorpay";
const PRICE_CENTS = 250_000;

const providers = new DefaultProviderFactory();
const payments = new PaymentsService(providers);
const setups = new MandateSetupService(providers);
const autopay = new AutopayService(setups);
const invoices = new InvoicesService();
const subscriptions = new SubscriptionsService(invoices, autopay);
const lots = () => new FixedWindowRateLimiter(1_000);
const publicInvoices = new PublicInvoicesService(
    payments,
    lots(),
    lots(),
    autopay,
);
const accountAutopay = new AccountAutopayService(autopay, lots());
const joins = new PublicPlanJoinService(payments, lots(), autopay);
const webhooks = new WebhooksService(
    new DefaultWebhookProviderFactory(),
    payments,
);

const tag = `${process.pid}-${Date.now()}`;
let n = 0;
const next = () => `${tag.replace(/\D/g, "")}${++n}`;

let owner: OrganizationContext;
let planId: string;
let siteId: string;
let subdomain: string;

/** Razorpay's answers, by "METHOD path" (query string dropped). */
let routes: Record<string, unknown> = {};
const fetchMock = jest.fn((url: string, init?: RequestInit) => {
    const path = new URL(url).pathname.replace(/^\/v1/, "");
    const key = `${init?.method ?? "GET"} ${path}`;
    const answer = routes[key];
    if (answer === undefined) {
        return Promise.resolve(
            new Response(JSON.stringify({ error: { reason: "not_mocked" } }), {
                status: 400,
            }),
        );
    }
    if (answer instanceof Response) return Promise.resolve(answer.clone());
    return Promise.resolve(
        new Response(JSON.stringify(answer), { status: 200 }),
    );
});

/** The requests Razorpay was sent, as `METHOD path` and body. */
const sent = () =>
    fetchMock.mock.calls.map(([url, init]) => ({
        call: `${init?.method ?? "GET"} ${new URL(url).pathname.replace(/^\/v1/, "")}`,
        body: init?.body ? (JSON.parse(init.body as string) as unknown) : null,
    }));

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
        data: { email: `d12r-owner-${tag}@x.com` },
    });
    const org = await prisma.organization.create({
        data: { name: "Pulse Fitness", slug: `d12r-${tag}` },
    });
    owner = { organizationId: org.id, userId: user.id, role: "OWNER" };
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: "Asia/Kolkata" },
    });
    await giveBusinessDetails(org.id);
    await prisma.featureFlag.upsert({
        where: { key: "MODULE_PAYMENTS" },
        create: { key: "MODULE_PAYMENTS", enabledByDefault: false },
        update: {},
    });
    await prisma.featureFlagOverride.create({
        data: {
            flagKey: "MODULE_PAYMENTS",
            organizationId: org.id,
            enabled: true,
        },
    });
    await prisma.organizationModule.create({
        data: {
            organizationId: org.id,
            moduleKey: "PAYMENTS",
            status: "ENABLED",
        },
    });
    subdomain = `d12rx${process.pid}x${Date.now() % 100000}`;
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Pulse Fitness",
            slug: `d12r-site-${tag}`,
            subdomain,
        },
    });
    siteId = site.id;
    const publication = await prisma.publication.create({
        data: {
            siteId: site.id,
            organizationId: org.id,
            snapshot: { pages: [] },
            templateId: "blank",
            templateVersion: 1,
        },
    });
    await prisma.site.update({
        where: { id: site.id },
        data: { currentPublicationId: publication.id },
    });
    // Razorpay answers the key check on connect (UX-012).
    routes["GET /payments"] = { items: [] };
    await payments.connectProvider(owner, {
        provider: "RAZORPAY",
        publicKey: "rzp_test_D12R",
        keyId: "rzp_test_D12R",
        keySecret: "rzp_secret",
        webhookSecret: WEBHOOK_SECRET,
    });
    planId = (
        await subscriptions.createPlan(owner, {
            name: "Monthly unlimited",
            price: "2500",
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

/**
 * Per-test Razorpay ids, and its answers to an in-page set-up: the
 * customer, then the authorisation order for `amount`.
 */
function razorpaySetUp(amount: number, method = "upi") {
    const ids = {
        order: `order_${next()}`,
        customer: `cust_${next()}`,
        payment: `pay_${next()}`,
        token: `token_${next()}`,
    };
    routes["POST /customers"] = authCustomer({ id: ids.customer });
    routes["POST /orders"] = authOrder({
        id: ids.order,
        customer_id: ids.customer,
        amount,
        method,
    });
    // The authorisation's payment: an in-page order's, so no link.
    const payment = authPayment({
        id: ids.payment,
        order_id: ids.order,
        invoice_id: null,
        customer_id: ids.customer,
        token_id: ids.token,
        amount,
        method,
    });
    const confirmed = token("confirmed", {
        id: ids.token,
        method,
        max_amount: 380_000,
        ...(method === "card"
            ? { vpa: null, card: { last4: "4242", network: "Visa" } }
            : {}),
    });
    return {
        ids,
        captured: delivery("payment.captured", { payment }),
        orderPaid: delivery("order.paid", {
            payment,
            order: authOrder({
                id: ids.order,
                customer_id: ids.customer,
                amount,
                amount_paid: amount,
                amount_due: 0,
                status: "paid",
            }),
        }),
        confirmed: delivery("token.confirmed", { token: confirmed }),
    };
}

/** A customer with a site account, on the plan, with its first invoice. */
async function member(): Promise<{
    subscriptionId: string;
    invoiceId: string;
    customer: CustomerContext;
}> {
    const email = `m-${next()}@example.in`;
    const contactId = (
        await prisma.contact.create({
            data: {
                organizationId: owner.organizationId,
                email,
                firstName: "Meera",
                lastName: "Iyer",
                phone: "+919000090000",
            },
        })
    ).id;
    const account = await prisma.customerAccount.create({
        data: {
            organizationId: owner.organizationId,
            contactId,
            email,
            emailVerifiedAt: new Date(),
        },
    });
    const sub = await subscriptions.subscribe(owner, { contactId, planId });
    const invoice = await prisma.invoice.findFirstOrThrow({
        where: { subscriptionId: sub.id, status: "ISSUED" },
        select: { id: true },
    });
    return {
        subscriptionId: sub.id,
        invoiceId: invoice.id,
        customer: {
            organizationId: owner.organizationId,
            siteId,
            accountId: account.id,
            contactId,
            sessionId: `sess-${next()}`,
        },
    };
}

async function joiner() {
    const email = `j-${next()}@example.in`;
    const contactId = (
        await prisma.contact.create({
            data: {
                organizationId: owner.organizationId,
                email,
                firstName: "Asha",
            },
        })
    ).id;
    const account = await prisma.customerAccount.create({
        data: {
            organizationId: owner.organizationId,
            contactId,
            email,
            emailVerifiedAt: new Date(),
        },
    });
    return {
        organizationId: owner.organizationId,
        contactId,
        accountId: account.id,
        siteId,
    };
}

const invoiceStatus = async (id: string) =>
    (await prisma.invoice.findUniqueOrThrow({ where: { id } })).status;

/** The invoice's payments that landed: exactly one when it was paid once. */
const capturedAttempts = (invoiceId: string) =>
    prisma.paymentAttempt.count({
        where: { paymentIntent: { invoiceId }, status: "CAPTURED" },
    });

describe("the gate: RAZORPAY_AUTOPAY off", () => {
    it("offers nothing anywhere, starts nothing, and never calls Razorpay", async () => {
        await setFlag(false);
        expect(await autopay.offer(owner.organizationId)).toEqual([]);

        const { invoiceId, customer, subscriptionId } = await member();
        const { token: payToken } = await invoices.createPayLink(
            owner,
            invoiceId,
        );
        expect(
            (await publicInvoices.read(payToken)).autopay ?? null,
        ).toBeNull();
        await expect(
            publicInvoices.startAutopay(payToken, { method: "UPI" }),
        ).rejects.toBeInstanceOf(ConflictException);
        await expect(
            accountAutopay.start(customer, subscriptionId, "UPI"),
        ).rejects.toBeInstanceOf(ConflictException);
        const who = await joiner();
        await expect(
            joins.start(who, planId, `off-${next()}`, new Date(), "UPI"),
        ).rejects.toBeInstanceOf(ConflictException);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(
            await prisma.paymentMandate.count({ where: { subscriptionId } }),
        ).toBe(0);
    });

    it("on: every method Razorpay takes is offered", async () => {
        expect(await autopay.offer(owner.organizationId)).toEqual([
            "UPI",
            "CARD",
            "EMANDATE",
        ]);
    });
});

describe("from the pay link, UPI", () => {
    async function start() {
        const { invoiceId, subscriptionId } = await member();
        const { token: payToken } = await invoices.createPayLink(
            owner,
            invoiceId,
        );
        const rzp = razorpaySetUp(PRICE_CENTS);
        const started = await publicInvoices.startAutopay(payToken, {
            method: "UPI",
            idempotencyKey: `tab-${next()}`,
        });
        return { invoiceId, subscriptionId, payToken, rzp, started };
    }

    it("one authorisation order for the invoice → captured pays it once → token.confirmed → ACTIVE", async () => {
        const { invoiceId, subscriptionId, payToken, rzp, started } =
            await start();
        const returnUrl = `https://${subdomain}.saroh.app/autopay?pay=${payToken}`;

        // Razorpay was asked for its customer, then the authorisation order
        // for the invoice's amount, the picked method and the token block.
        expect(sent().map((c) => c.call)).toEqual([
            "POST /customers",
            "POST /orders",
        ]);
        expect(sent()[1]?.body).toMatchObject({
            amount: PRICE_CENTS,
            currency: "INR",
            customer_id: rzp.ids.customer,
            method: "upi",
            receipt: started.ref,
            token: { max_amount: 380_000, frequency: "as_presented" },
        });
        // The site's window: the order, the customer, recurring, and the
        // business's own page to come back to.
        expect(started).toMatchObject({
            mode: "PAY_AND_AUTHORISE",
            authorisationUrl: null,
            returnUrl,
            handoff: {
                provider: "RAZORPAY",
                amountCents: PRICE_CENTS,
                providerIntentId: rzp.ids.order,
                publicKey: "rzp_test_D12R",
                clientParams: {
                    razorpayOrderId: rzp.ids.order,
                    razorpayCustomerId: rzp.ids.customer,
                    recurring: true,
                    method: "upi",
                    callbackUrl: returnUrl,
                },
            },
        });
        expect(
            await prisma.paymentMandate.findUniqueOrThrow({
                where: { id: started.ref },
            }),
        ).toMatchObject({
            status: "PENDING",
            subscriptionId,
            setupReference: rzp.ids.order,
            providerCustomerId: rzp.ids.customer,
            providerMandateId: null,
        });

        // The authorisation's own payment: the invoice paid, the token named.
        expect(await webhook(rzp.captured)).toEqual({
            status: "processed",
            changed: true,
        });
        expect(await invoiceStatus(invoiceId)).toBe("PAID");
        expect(
            await prisma.paymentMandate.findUniqueOrThrow({
                where: { id: started.ref },
            }),
        ).toMatchObject({
            status: "PENDING",
            providerMandateId: rzp.ids.token,
        });

        // Razorpay's `order.paid` for the same payment changes nothing.
        expect(await webhook(rzp.orderPaid)).toEqual({
            status: "ignored",
            changed: false,
        });
        expect(await capturedAttempts(invoiceId)).toBe(1);

        expect(await webhook(rzp.confirmed)).toEqual({
            status: "processed",
            changed: true,
        });
        expect(
            await prisma.paymentMandate.findUniqueOrThrow({
                where: { id: started.ref },
            }),
        ).toMatchObject({
            status: "ACTIVE",
            method: "UPI",
            displayHint: "te•••@razorpay",
        });
        expect(await publicInvoices.autopayOutcome(payToken)).toMatchObject({
            autopay: { state: "ON", method: "UPI", hint: "te•••@razorpay" },
            paid: true,
        });
    });

    it("token.confirmed first: acknowledged, then applied once the payment names the token", async () => {
        const { invoiceId, rzp, started } = await start();

        expect(await webhook(rzp.confirmed)).toEqual({
            status: "ignored",
            changed: false,
        });
        expect(
            (
                await prisma.paymentMandate.findUniqueOrThrow({
                    where: { id: started.ref },
                })
            ).status,
        ).toBe("PENDING");

        await webhook(rzp.captured);
        expect(await invoiceStatus(invoiceId)).toBe("PAID");
        expect(await capturedAttempts(invoiceId)).toBe(1);
        expect(
            await prisma.paymentMandate.findUniqueOrThrow({
                where: { id: started.ref },
            }),
        ).toMatchObject({ status: "ACTIVE", providerMandateId: rzp.ids.token });
    });

    it("both webhooks lost: the page asks Razorpay, from the order's payment to the token", async () => {
        const { payToken, rzp, started } = await start();
        routes[`GET /orders/${rzp.ids.order}/payments`] = {
            entity: "collection",
            count: 1,
            items: [
                authPayment({
                    order_id: rzp.ids.order,
                    invoice_id: null,
                    customer_id: rzp.ids.customer,
                    token_id: rzp.ids.token,
                }),
            ],
        };
        routes[`GET /customers/${rzp.ids.customer}/tokens/${rzp.ids.token}`] =
            token("confirmed", { id: rzp.ids.token });

        const outcome = await publicInvoices.autopayOutcome(payToken);
        expect(outcome.autopay).toMatchObject({ state: "ON", method: "UPI" });
        expect(
            await prisma.paymentMandate.findUniqueOrThrow({
                where: { id: started.ref },
            }),
        ).toMatchObject({ status: "ACTIVE", providerMandateId: rzp.ids.token });
    });
});

describe("while joining from the Prices page (DEC-062 pay-first)", () => {
    async function start(method: "UPI" | "CARD") {
        const who = await joiner();
        const rzp = razorpaySetUp(PRICE_CENTS, method.toLowerCase());
        const started = await joins.start(
            who,
            planId,
            `join-${next()}`,
            new Date(),
            method,
        );
        return { who, rzp, started };
    }

    it("token.confirmed first, then the payment: joined once, autopay on", async () => {
        const { who, rzp, started } = await start("UPI");
        expect(started.payment.providerIntentId).toBe(rzp.ids.order);
        expect(started.autopay?.handoff.clientParams).toMatchObject({
            razorpayOrderId: rzp.ids.order,
            recurring: true,
            callbackUrl: `https://${subdomain}.saroh.app/autopay?join=${started.ref}`,
        });
        expect(sent()[1]?.body).toMatchObject({ amount: PRICE_CENTS });

        // Nobody is on the plan yet: the token names nothing Saroh has.
        expect(await webhook(rzp.confirmed)).toEqual({
            status: "ignored",
            changed: false,
        });

        await webhook(rzp.captured);
        const paid = await prisma.invoice.findUniqueOrThrow({
            where: { id: started.ref },
        });
        expect(paid.status).toBe("PAID");
        expect(
            await prisma.paymentMandate.findUniqueOrThrow({
                where: { id: started.autopay?.ref },
            }),
        ).toMatchObject({
            status: "ACTIVE",
            subscriptionId: paid.subscriptionId,
            providerMandateId: rzp.ids.token,
            setupSource: "PRICES",
            setupAccountId: who.accountId,
            displayHint: "te•••@razorpay",
        });

        // `order.paid` for the same payment: no second join, no second pay.
        await webhook(rzp.orderPaid);
        expect(await capturedAttempts(started.ref)).toBe(1);
        expect(
            await prisma.customerSubscription.count({
                where: { contactId: who.contactId },
            }),
        ).toBe(1);
        expect(
            (await accountAutopay.join({ ...who, sessionId: "s" }, started.ref))
                .outcome?.autopay?.state,
        ).toBe("ON");
    });

    it("the payment first, then token.confirmed: the same", async () => {
        const { who, rzp, started } = await start("CARD");
        expect(sent()[1]?.body).toMatchObject({ method: "card" });

        await webhook(rzp.captured);
        const joined = await prisma.invoice.findUniqueOrThrow({
            where: { id: started.ref },
        });
        expect(joined.status).toBe("PAID");
        expect(
            await prisma.paymentMandate.findUniqueOrThrow({
                where: { id: started.autopay?.ref },
            }),
        ).toMatchObject({
            status: "PENDING",
            method: "CARD",
            providerMandateId: rzp.ids.token,
        });

        await webhook(rzp.confirmed);
        expect(
            (await subscriptions.get(owner, joined.subscriptionId as string))
                .autopay,
        ).toMatchObject({ state: "ON", method: "CARD", hint: "•••• 4242" });
        expect(
            await prisma.customerSubscription.count({
                where: { contactId: who.contactId },
            }),
        ).toBe(1);
    });
});

describe("from the account with nothing owed", () => {
    it("eMandate's ₹0 authorisation is what it always is", async () => {
        const { subscriptionId, customer, invoiceId } = await member();
        await prisma.invoice.update({
            where: { id: invoiceId },
            data: { status: "PAID", paidAt: new Date() },
        });
        const rzp = razorpaySetUp(0, "emandate");
        const start = await accountAutopay.start(
            customer,
            subscriptionId,
            "EMANDATE",
        );
        expect(start).toMatchObject({
            mode: "AUTHORISE",
            handoff: { amountCents: 0, providerIntentId: rzp.ids.order },
        });
        expect(sent()[1]?.body).toMatchObject({
            amount: 0,
            method: "emandate",
        });
    });
});
