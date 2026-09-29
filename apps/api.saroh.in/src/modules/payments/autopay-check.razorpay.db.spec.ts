/**
 * The ₹1 autopay check (round-2 D12B, DEC-064), end to end through REAL
 * Razorpay against a real Postgres: the real adapter (its HTTP answered in
 * the D11 spike's and Razorpay's documented shapes, `test/fixtures/
 * razorpay-recurring.ts`), the real webhook verifier signed with the
 * business's own secret, and the real refund job.
 *
 * - nothing owed: UPI and card authorise with a ₹1 order, eMandate with ₹0;
 *   the check is an AUTHORISATION intent on no order or invoice;
 * - its capture → one refund job → Razorpay asked to refund ₹1 once, under
 *   the refund's own id: a duplicate delivery, `order.paid`, a retried job
 *   and an unsure answer never make a second;
 * - `refund.processed` / `refund.failed` settle it, and the customer's and
 *   the merchant's lines say so;
 * - a set-up that fails after the capture still refunds; a lost webhook is
 *   recovered by the page's read-back;
 * - never money: not in Spent, This week's takings or the calendar's fees.
 *
 * Only the app env is stubbed. Runs in the integration project
 * (TEST_DATABASE_URL).
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

import type { Job } from "@saroh/database";
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
import { readFees } from "../calendar/money-read";
import { spentPart } from "../customer-workspace/customer-spent";
import { FlagKey } from "../feature-flags/flags";
import { readWeek } from "../home/home-week";
import { InvoicesService } from "../invoices/invoices.service";
import { AccountPlanService } from "../site-accounts/account-plan.service";
import type { CustomerContext } from "../site-accounts/customer-context.decorator";
import { AccountAutopayService } from "../subscriptions/account-autopay.service";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { DefaultWebhookProviderFactory } from "../webhooks/providers/webhook-provider.factory";
import { WebhooksService } from "../webhooks/webhooks.service";
import { AUTHORISATION_PURPOSE, CHECK_REFUND_KEY } from "./authorisation-check";
import { AutopayService } from "./autopay.service";
import { MandateSetupService } from "./mandate-setup.service";
import { PaymentsService } from "./payments.service";
import { DefaultProviderFactory } from "./providers/provider.factory";
import { PublicInvoicesService } from "./public-invoices.service";
import { SEND_REFUND_TYPE, SendRefundHandler } from "./send-refund.handler";

const WEBHOOK_SECRET = "whsec_d12b_razorpay";
const CHECK = 100;

const providers = new DefaultProviderFactory();
const payments = new PaymentsService(providers);
const setups = new MandateSetupService(providers);
const autopay = new AutopayService(setups);
const invoices = new InvoicesService();
const subscriptions = new SubscriptionsService(invoices, autopay);
const lots = () => new FixedWindowRateLimiter(1_000);
const accountAutopay = new AccountAutopayService(autopay, lots());
const accountPlan = new AccountPlanService(subscriptions, undefined, autopay);
const publicInvoices = new PublicInvoicesService(
    payments,
    lots(),
    lots(),
    autopay,
);
const sender = new SendRefundHandler(payments);
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

/** The requests Razorpay was sent, as `METHOD path`, body and headers. */
const sent = () =>
    fetchMock.mock.calls.map(([url, init]) => ({
        call: `${init?.method ?? "GET"} ${new URL(url).pathname.replace(/^\/v1/, "")}`,
        body: init?.body ? (JSON.parse(init.body as string) as unknown) : null,
        headers: (init?.headers ?? {}) as Record<string, string>,
    }));
const refundPosts = () =>
    sent().filter((c) => /^POST \/payments\/.+\/refund$/.test(c.call));

beforeAll(async () => {
    global.fetch = fetchMock as unknown as typeof fetch;
    const user = await prisma.user.create({
        data: { email: `d12b-owner-${tag}@x.com` },
    });
    const org = await prisma.organization.create({
        data: { name: "Pulse Fitness", slug: `d12b-${tag}` },
    });
    owner = { organizationId: org.id, userId: user.id, role: "OWNER" };
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: "Asia/Kolkata" },
    });
    await giveBusinessDetails(org.id);
    for (const key of ["MODULE_PAYMENTS", FlagKey.RAZORPAY_AUTOPAY]) {
        await prisma.featureFlag.upsert({
            where: { key },
            create: { key, enabledByDefault: false },
            update: {},
        });
        await prisma.featureFlagOverride.create({
            data: { flagKey: key, organizationId: org.id, enabled: true },
        });
    }
    await prisma.organizationModule.create({
        data: {
            organizationId: org.id,
            moduleKey: "PAYMENTS",
            status: "ENABLED",
        },
    });
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Pulse Fitness",
            slug: `d12b-site-${tag}`,
            subdomain: `d12bx${process.pid}x${Date.now() % 100000}`,
        },
    });
    siteId = site.id;
    await payments.connectProvider(owner, {
        provider: "RAZORPAY",
        publicKey: "rzp_test_D12B",
        keyId: "rzp_test_D12B",
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

beforeEach(() => {
    routes = {};
    fetchMock.mockClear();
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

/** A member on the plan, their first invoice already paid: nothing owed. */
async function paidUpMember(): Promise<{
    subscriptionId: string;
    contactId: string;
    customer: CustomerContext;
    invoiceId: string;
}> {
    const email = `m-${next()}@example.in`;
    const contactId = (
        await prisma.contact.create({
            data: {
                organizationId: owner.organizationId,
                email,
                firstName: "Meera",
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
    await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: "PAID", paidAt: new Date() },
    });
    return {
        subscriptionId: sub.id,
        contactId,
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

/** Razorpay's answers to an in-page set-up, and its deliveries after. */
function razorpay(amount: number, method = "upi") {
    const ids = {
        order: `order_${next()}`,
        customer: `cust_${next()}`,
        payment: `pay_${next()}`,
        token: `token_${next()}`,
        refund: `rfnd_${next()}`,
    };
    routes["POST /customers"] = authCustomer({ id: ids.customer });
    routes["POST /orders"] = authOrder({
        id: ids.order,
        customer_id: ids.customer,
        amount,
        method,
    });
    const payment = authPayment({
        id: ids.payment,
        order_id: ids.order,
        invoice_id: null,
        customer_id: ids.customer,
        token_id: ids.token,
        amount,
        method,
    });
    const refund = (status: "processed" | "failed", receipt: string) => ({
        id: ids.refund,
        entity: "refund",
        amount,
        currency: "INR",
        payment_id: ids.payment,
        receipt,
        notes: { saroh_refund_id: receipt },
        status,
        created_at: 1790000300,
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
        confirmed: delivery("token.confirmed", {
            token: token("confirmed", { id: ids.token, method }),
        }),
        rejected: delivery("token.rejected", {
            token: token("rejected", { id: ids.token, method }),
        }),
        refunded: (receipt: string) =>
            delivery("refund.processed", {
                refund: refund("processed", receipt),
                payment,
            }),
        refundFailed: (receipt: string) =>
            delivery("refund.failed", {
                refund: refund("failed", receipt),
                payment,
            }),
        /** Razorpay has made no refund under Saroh's reference yet. */
        noRefundYet: () => {
            routes[`GET /payments/${ids.payment}/refunds`] = { items: [] };
        },
        /** Razorpay takes the refund. */
        takesRefund: () => {
            routes[`POST /payments/${ids.payment}/refund`] = {
                id: ids.refund,
                entity: "refund",
                amount,
                status: "pending",
            };
        },
    };
}

const checkOf = (mandateId: string) =>
    prisma.paymentIntent.findFirstOrThrow({
        where: { checkForMandateId: mandateId },
        include: { refunds: true },
    });

const refundJobs = (refundId: string) =>
    prisma.job.findMany({
        where: {
            type: SEND_REFUND_TYPE,
            payload: { equals: { refundId } },
        },
    });

/** Start autopay from the account with nothing owed, and capture its check. */
async function capturedCheck(method: "UPI" | "CARD" = "UPI") {
    const m = await paidUpMember();
    const rzp = razorpay(CHECK, method.toLowerCase());
    const started = await accountAutopay.start(
        m.customer,
        m.subscriptionId,
        method,
    );
    await webhook(rzp.captured);
    const check = await checkOf(started.ref);
    const refund = check.refunds[0];
    if (!refund) throw new Error("no refund reserved");
    const [job] = await refundJobs(refund.id);
    return { ...m, rzp, started, check, refund, job: job as Job };
}

describe("nothing owed: the authorisation takes the ₹1 check", () => {
    it.each([
        ["UPI", "upi"],
        ["CARD", "card"],
    ] as const)(
        "%s: a ₹1 order, told up front, recorded as a check — never a sale",
        async (method, rzpMethod) => {
            const { subscriptionId, customer } = await paidUpMember();
            const rzp = razorpay(CHECK, rzpMethod);
            const start = await accountAutopay.start(
                customer,
                subscriptionId,
                method,
            );

            expect(sent()[1]?.body).toMatchObject({
                amount: CHECK,
                method: rzpMethod,
                token: { max_amount: 380_000 },
            });
            expect(start).toMatchObject({
                mode: "AUTHORISE",
                check: { amount: "1.00", currency: "INR" },
                handoff: {
                    amountCents: CHECK,
                    providerIntentId: rzp.ids.order,
                },
            });
            const check = await checkOf(start.ref);
            expect(check).toMatchObject({
                purpose: AUTHORISATION_PURPOSE,
                orderId: null,
                invoiceId: null,
                providerIntentId: rzp.ids.order,
                amountCents: CHECK,
                status: "REQUIRES_PAYMENT",
            });
            // Nothing captured yet: no check on the line, nothing to refund.
            expect(
                (await accountAutopay.outcome(customer, subscriptionId))
                    .autopay,
            ).toMatchObject({ state: "PENDING", check: null });
        },
    );

    it("eMandate: a ₹0 order, no check", async () => {
        const { subscriptionId, customer } = await paidUpMember();
        const rzp = razorpay(0, "emandate");
        const start = await accountAutopay.start(
            customer,
            subscriptionId,
            "EMANDATE",
        );
        expect(sent()[1]?.body).toMatchObject({ amount: 0 });
        expect(start).toMatchObject({
            check: null,
            handoff: { amountCents: 0, providerIntentId: rzp.ids.order },
        });
        expect(
            await prisma.paymentIntent.count({
                where: { checkForMandateId: start.ref },
            }),
        ).toBe(0);
    });

    it("the pay link of a paid invoice takes the check too", async () => {
        const { invoiceId } = await paidUpMember();
        // Its link was sent while it was owed; it has been paid since.
        await prisma.invoice.update({
            where: { id: invoiceId },
            data: { status: "ISSUED", paidAt: null },
        });
        const { token: payToken } = await invoices.createPayLink(
            owner,
            invoiceId,
        );
        await prisma.invoice.update({
            where: { id: invoiceId },
            data: { status: "PAID", paidAt: new Date() },
        });
        expect((await publicInvoices.read(payToken)).autopay).toMatchObject({
            checks: {
                UPI: { amount: "1.00", currency: "INR" },
                CARD: { amount: "1.00", currency: "INR" },
            },
        });
        razorpay(CHECK);
        const start = await publicInvoices.startAutopay(payToken, {
            method: "UPI",
        });
        expect(start).toMatchObject({
            mode: "AUTHORISE",
            check: { amount: "1.00" },
            handoff: { amountCents: CHECK },
        });
    });

    it("My plan says which methods take the check before they pick", async () => {
        const { customer } = await paidUpMember();
        const tab = await accountPlan.tab(customer);
        expect(tab.autopayMethods).toEqual(["UPI", "CARD", "EMANDATE"]);
        expect(tab.autopayChecks).toEqual({
            UPI: { amount: "1.00", currency: "INR" },
            CARD: { amount: "1.00", currency: "INR" },
        });
    });

    it("a genuine refusal still fails the set-up, with nothing to refund", async () => {
        const { subscriptionId, customer } = await paidUpMember();
        routes["POST /customers"] = authCustomer();
        routes["POST /orders"] = new Response(
            JSON.stringify({
                error: { code: "BAD_REQUEST_ERROR", reason: "method_disabled" },
            }),
            { status: 400 },
        );
        await expect(
            accountAutopay.start(customer, subscriptionId, "CARD"),
        ).rejects.toThrow("Razorpay didn't accept the autopay set-up");
        const mandate = await prisma.paymentMandate.findFirstOrThrow({
            where: { subscriptionId },
        });
        expect(mandate).toMatchObject({
            status: "FAILED",
            failureReason: "SETUP_REFUSED",
        });
        expect(
            await prisma.paymentIntent.count({
                where: { checkForMandateId: mandate.id },
            }),
        ).toBe(0);
    });
});

describe("captured → refunded automatically, once", () => {
    it("the capture reserves one refund and its job; the job asks Razorpay once, under the refund's own id", async () => {
        const { rzp, check, refund, job } = await capturedCheck();
        expect(check.status).toBe("SUCCEEDED");
        expect(refund).toMatchObject({
            amountCents: CHECK,
            status: "PENDING",
            idempotencyKey: CHECK_REFUND_KEY,
        });
        expect(await refundJobs(refund.id)).toHaveLength(1);

        rzp.noRefundYet();
        rzp.takesRefund();
        await sender.handle(job);
        const posts = refundPosts();
        expect(posts).toHaveLength(1);
        expect(posts[0]).toMatchObject({
            call: `POST /payments/${rzp.ids.payment}/refund`,
            body: { amount: CHECK, receipt: refund.id },
            headers: { "X-Refund-Idempotency": refund.id },
        });
        expect(
            await prisma.paymentRefund.findUniqueOrThrow({
                where: { id: refund.id },
            }),
        ).toMatchObject({
            status: "PENDING",
            providerRefundId: rzp.ids.refund,
        });

        // The job run again: nothing more is sent.
        await sender.handle(job);
        expect(refundPosts()).toHaveLength(1);
    });

    it("a duplicate delivery and `order.paid` for the same payment reserve nothing more", async () => {
        const { rzp, refund, started } = await capturedCheck();
        expect((await webhook(rzp.captured)).changed).toBe(false);
        expect((await webhook(rzp.orderPaid)).changed).toBe(false);
        const again = await checkOf(started.ref);
        expect(again.refunds).toHaveLength(1);
        expect(await refundJobs(refund.id)).toHaveLength(1);
        expect(
            await prisma.paymentAttempt.count({
                where: { paymentIntentId: again.id, status: "CAPTURED" },
            }),
        ).toBe(1);
    });

    it("an unsure answer holds the refund; the retry finds the one Razorpay made and sends no second", async () => {
        const { rzp, refund, job } = await capturedCheck();
        rzp.noRefundYet();
        routes[`POST /payments/${rzp.ids.payment}/refund`] = new Response(
            "{}",
            { status: 502 },
        );
        await expect(sender.handle(job)).rejects.toThrow(
            "no answer from the provider",
        );
        expect(
            await prisma.paymentRefund.findUniqueOrThrow({
                where: { id: refund.id },
            }),
        ).toMatchObject({ status: "PENDING", providerRefundId: null });

        // It had made it: the retry looks first, and finds it.
        routes[`GET /payments/${rzp.ids.payment}/refunds`] = {
            items: [
                {
                    id: rzp.ids.refund,
                    status: "processed",
                    receipt: refund.id,
                    notes: { saroh_refund_id: refund.id },
                },
            ],
        };
        await sender.handle(job);
        expect(refundPosts()).toHaveLength(1);
        expect(
            await prisma.paymentRefund.findUniqueOrThrow({
                where: { id: refund.id },
            }),
        ).toMatchObject({ providerRefundId: rzp.ids.refund });
    });

    it("refund.processed settles it: the customer and the merchant are told it's back", async () => {
        const { rzp, refund, job, customer, subscriptionId, started } =
            await capturedCheck();
        await webhook(rzp.confirmed);
        // Before the refund lands: on its way.
        expect(
            (await accountAutopay.outcome(customer, subscriptionId)).autopay,
        ).toMatchObject({
            state: "ON",
            check: { amount: "1.00", state: "REFUNDING", refundedAt: null },
        });

        rzp.noRefundYet();
        rzp.takesRefund();
        await sender.handle(job);
        expect(await webhook(rzp.refunded(refund.id))).toEqual({
            status: "processed",
            changed: true,
        });
        const settled = await prisma.paymentRefund.findUniqueOrThrow({
            where: { id: refund.id },
        });
        expect(settled.status).toBe("SUCCEEDED");
        // No credit note: the check was on no invoice.
        expect(
            await prisma.invoice.count({
                where: { paymentRefundId: refund.id },
            }),
        ).toBe(0);

        const outcome = await accountAutopay.outcome(customer, subscriptionId);
        expect(outcome.autopay?.check).toEqual({
            amount: "1.00",
            currency: "INR",
            state: "REFUNDED",
            refundedAt: settled.updatedAt.toISOString(),
        });
        const tab = await accountPlan.tab(customer);
        expect(
            tab.subscriptions.ok && tab.subscriptions.value[0]?.autopay?.check,
        ).toMatchObject({ state: "REFUNDED" });
        expect(
            (await subscriptions.get(owner, subscriptionId)).autopay?.check,
        ).toMatchObject({ state: "REFUNDED", amount: "1.00" });
        expect(started.ref).toBeTruthy();

        // Delivered again: nothing moves.
        expect((await webhook(rzp.refunded(refund.id))).changed).toBe(false);
    });

    it("the refund webhook before the call's answer is matched by Saroh's reference", async () => {
        const { rzp, refund } = await capturedCheck();
        expect((await webhook(rzp.refunded(refund.id))).changed).toBe(true);
        expect(
            await prisma.paymentRefund.findUniqueOrThrow({
                where: { id: refund.id },
            }),
        ).toMatchObject({
            status: "SUCCEEDED",
            providerRefundId: rzp.ids.refund,
        });
    });

    it("refund.failed: not refunded, and said so", async () => {
        const { rzp, refund, job, customer, subscriptionId, started } =
            await capturedCheck("CARD");
        rzp.noRefundYet();
        rzp.takesRefund();
        await sender.handle(job);
        await webhook(rzp.refundFailed(refund.id));
        expect(
            (
                await prisma.paymentRefund.findUniqueOrThrow({
                    where: { id: refund.id },
                })
            ).status,
        ).toBe("FAILED");
        expect(
            (await accountAutopay.outcome(customer, subscriptionId)).autopay
                ?.check,
        ).toMatchObject({ state: "NOT_REFUNDED" });
        // The failed webhook reserves no second refund by itself.
        expect((await checkOf(started.ref)).refunds).toHaveLength(1);
    });

    it("a set-up that fails after the capture still refunds the ₹1", async () => {
        const { rzp, refund, job, customer, subscriptionId, started } =
            await capturedCheck();
        await webhook(rzp.rejected);
        expect(
            (
                await prisma.paymentMandate.findUniqueOrThrow({
                    where: { id: started.ref },
                })
            ).status,
        ).toBe("FAILED");
        rzp.noRefundYet();
        rzp.takesRefund();
        await sender.handle(job);
        expect(refundPosts()).toHaveLength(1);
        expect(
            (await accountAutopay.outcome(customer, subscriptionId)).autopay,
        ).toMatchObject({
            state: "FAILED",
            check: { state: "REFUNDING" },
        });
        expect(refund.amountCents).toBe(CHECK);
    });

    it("both webhooks lost: the page's read-back captures the check and queues its refund", async () => {
        const { subscriptionId, customer } = await paidUpMember();
        const rzp = razorpay(CHECK);
        const start = await accountAutopay.start(
            customer,
            subscriptionId,
            "UPI",
        );
        routes[`GET /orders/${rzp.ids.order}/payments`] = {
            entity: "collection",
            count: 1,
            items: [
                authPayment({
                    id: rzp.ids.payment,
                    order_id: rzp.ids.order,
                    invoice_id: null,
                    customer_id: rzp.ids.customer,
                    token_id: rzp.ids.token,
                }),
            ],
        };
        routes[`GET /customers/${rzp.ids.customer}/tokens/${rzp.ids.token}`] =
            token("confirmed", { id: rzp.ids.token });

        const outcome = await accountAutopay.outcome(customer, subscriptionId);
        expect(outcome.autopay).toMatchObject({
            state: "ON",
            check: { state: "REFUNDING" },
        });
        const check = await checkOf(start.ref);
        expect(check.status).toBe("SUCCEEDED");
        expect(check.refunds).toHaveLength(1);
        expect(await refundJobs(check.refunds[0]?.id as string)).toHaveLength(
            1,
        );

        // The webhook arriving late changes nothing more.
        await webhook(rzp.captured);
        expect((await checkOf(start.ref)).refunds).toHaveLength(1);
    });
});

describe("never money", () => {
    it("the check and its refund leave Spent, This week's takings and the calendar's fees as they were", async () => {
        const m = await paidUpMember();
        const now = new Date();
        const zone = "Asia/Kolkata";
        const spent = async () => [
            await spentPart(
                prisma,
                owner.organizationId,
                m.contactId,
                "orders",
            ),
            await spentPart(
                prisma,
                owner.organizationId,
                m.contactId,
                "invoices",
            ),
        ];
        const week = () =>
            readWeek(
                prisma,
                owner.organizationId,
                { takings: true, bookings: false, orders: false, owed: false },
                { now, zone },
            );
        const window = {
            start: new Date(now.getTime() - 86_400_000),
            end: new Date(now.getTime() + 86_400_000),
        };
        const fees = () => readFees(prisma, owner.organizationId, window, zone);

        const before = {
            spent: await spent(),
            week: (await week()).takings,
            fees: await fees(),
        };

        const rzp = razorpay(CHECK);
        const start = await accountAutopay.start(
            m.customer,
            m.subscriptionId,
            "UPI",
        );
        await webhook(rzp.captured);
        const check = await checkOf(start.ref);
        // Razorpay reported its fee on the check: kept for audit, never a cell.
        expect(check.feeCents).toBe(236);
        await webhook(rzp.refunded(check.refunds[0]?.id as string));

        expect(await spent()).toEqual(before.spent);
        expect((await week()).takings).toEqual(before.week);
        expect(await fees()).toEqual(before.fees);
    });
});
