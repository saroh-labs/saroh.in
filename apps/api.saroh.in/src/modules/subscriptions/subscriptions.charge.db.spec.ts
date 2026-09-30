/**
 * Renewals charge the mandate (round-2 D13), with the fake provider against
 * a real Postgres and the clock moved by hand: the renewal queues the
 * charge, the `subscription.charge` job prepares it (the order and its
 * pre-debit notice), debits once the notice is delivered and `debitAfter`
 * has passed, and the payment's webhook settles the invoice. Around it:
 * one charge at a time (every other way to pay is a 409 while it is under
 * way), a decline falls back to the pay link, the limit is checked before
 * anything is charged, an unsure answer is looked up before anything is
 * charged again, and a cancelled subscription or mandate is never charged.
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

import { ConflictException } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { failedRenewals } from "../home/home-money-sources";
import { InvoicesService } from "../invoices/invoices.service";
import { chargeUnderWayOn } from "../payments/charge-under-way";
import { MandateChargesService } from "../payments/mandate-charges.service";
import { MandateSetupService } from "../payments/mandate-setup.service";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import { PublicInvoicesService } from "../payments/public-invoices.service";
import { AccountPlanService } from "../site-accounts/account-plan.service";
import {
    FakeWebhookProvider,
    FakeWebhookProviderFactory,
} from "../webhooks/providers/fake.webhook";
import { WebhooksService } from "../webhooks/webhooks.service";
import { SUBSCRIPTION_CHARGE_TYPE } from "./charge-job";
import { SubscriptionChargeHandler } from "./subscription-charge.handler";
import { SubscriptionsService } from "./subscriptions.service";

const WEBHOOK_SECRET = "whsec_d13_charge";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const fake = new FakeMerchantProvider("RAZORPAY");
const factory = new FakeProviderFactory(fake);
const payments = new PaymentsService(factory);
const setups = new MandateSetupService(factory);
const charges = new MandateChargesService(factory);
const invoices = new InvoicesService();
const subscriptions = new SubscriptionsService(invoices, undefined, charges);
const handler = new SubscriptionChargeHandler(charges);
const webhooks = new WebhooksService(
    new FakeWebhookProviderFactory(new FakeWebhookProvider("RAZORPAY")),
    payments,
);
const lots = () => new FixedWindowRateLimiter(1_000);
const publicInvoices = new PublicInvoicesService(payments, lots(), lots());
const account = new AccountPlanService(
    subscriptions,
    async (organizationId, invoiceId) =>
        (await chargeUnderWayOn(prisma, organizationId, invoiceId)) !== null,
);

const tag = `${process.pid}-${Date.now()}`;
let n = 0;
const next = () => `${tag}-${++n}`;

let owner: OrganizationContext;
let planId: string;
let clock = new Date();

beforeAll(async () => {
    const user = await prisma.user.create({
        data: { email: `d13-owner-${tag}@x.com` },
    });
    const org = await prisma.organization.create({
        data: { name: "Pulse", slug: `d13-${tag}` },
    });
    await giveBusinessDetails(org.id);
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
    fake.now = () => clock;
});

beforeEach(() => {
    clock = new Date();
    fake.mandateCalls.length = 0;
    fake.preDebitMethods.clear();
    fake.preDebitMethods.add("UPI");
});

async function webhook(event: Record<string, unknown>) {
    const raw = Buffer.from(
        JSON.stringify({ providerEventId: `evt_${next()}`, ...event }),
    );
    return webhooks.handle("razorpay", owner.organizationId, raw, {
        "x-fake-signature": createHmac("sha256", WEBHOOK_SECRET)
            .update(raw)
            .digest("hex"),
    });
}

/**
 * A member on the plan with ACTIVE autopay (limit `limitCents`), whose
 * renewal is due: the subscription's period is moved to end now.
 */
async function autopayMember(limitCents = 180_000) {
    const contactId = (
        await prisma.contact.create({
            data: {
                organizationId: owner.organizationId,
                email: `c-${next()}@example.in`,
                firstName: "Ravi",
            },
        })
    ).id;
    const { id: subscriptionId } = await subscriptions.subscribe(owner, {
        contactId,
        planId,
    });
    // The first period's invoice is paid; the renewal is what's charged.
    await prisma.invoice.updateMany({
        where: { subscriptionId },
        data: { status: "PAID", paidAt: new Date() },
    });
    const view = await setups.createSetup({
        organizationId: owner.organizationId,
        subscriptionId,
        method: "UPI",
        maxAmountCents: limitCents,
    });
    const setup = fake.authorise(`fake_setup_${view.mandateId}`);
    await webhook({
        eventType: "token.confirmed",
        outcome: "MANDATE",
        mandate: {
            status: "ACTIVE",
            setupReference: setup.setupReference,
            providerMandateId: setup.providerMandateId,
            method: "UPI",
        },
    });
    return { contactId, subscriptionId, mandateId: view.mandateId };
}

/** The renewal: the period ends, and the job renews it `clock` later. */
async function renew(subscriptionId: string) {
    const sub = await prisma.customerSubscription.findUniqueOrThrow({
        where: { id: subscriptionId },
    });
    clock = new Date(sub.currentPeriodEnd.getTime() + HOUR);
    expect(await subscriptions.renewOne(subscriptionId, clock)).toBe("renewed");
    return prisma.invoice.findFirstOrThrow({
        where: { subscriptionId, status: { in: ["ISSUED", "PAID"] } },
        orderBy: { issuedAt: "desc" },
    });
}

/** The charge jobs waiting for this invoice, oldest first. */
function chargeJobs(invoiceId: string) {
    return prisma.job.findMany({
        where: {
            organizationId: owner.organizationId,
            type: SUBSCRIPTION_CHARGE_TYPE,
            status: "PENDING",
            payload: { path: ["invoiceId"], equals: invoiceId },
        },
        orderBy: { createdAt: "asc" },
    });
}

/**
 * Run the charge jobs that are due by `clock`, as the worker would: each
 * claimed (DONE) and handled. `twice` runs each one a second time too, as a
 * redelivery would.
 */
async function runDue(invoiceId: string, opts: { twice?: boolean } = {}) {
    const due = (await chargeJobs(invoiceId)).filter(
        (j) => j.runAt.getTime() <= clock.getTime(),
    );
    for (const job of due) {
        await prisma.job.update({
            where: { id: job.id },
            data: { status: "DONE" },
        });
        await handler.run(owner.organizationId, job.payload as never, clock);
        if (opts.twice) {
            await handler.handle({ ...job } as Job);
        }
    }
    return due.map((j) => (j.payload as { step: string }).step);
}

const intentsOf = (invoiceId: string) =>
    prisma.paymentIntent.findMany({
        where: { invoiceId, viaMandateId: { not: null } },
        orderBy: { createdAt: "asc" },
    });

const eventsOf = async (subscriptionId: string) =>
    (
        await prisma.subscriptionEvent.findMany({
            where: { subscriptionId },
            orderBy: { createdAt: "asc" },
        })
    ).map((e) => e.kind);

const calls = (op: string) => fake.mandateCalls.filter((c) => c.op === op);

/** Prepare, deliver the notice, debit: the charge as far as the bank. */
async function chargeToBank(invoiceId: string) {
    expect(await runDue(invoiceId)).toEqual(["PREPARE"]);
    const [intent] = await intentsOf(invoiceId);
    const orderId = intent.providerIntentId ?? "";
    fake.settlePreDebit(orderId, "DELIVERED");
    await webhook({
        eventType: "order.notification.delivered",
        outcome: "PRE_DEBIT",
        providerIntentId: orderId,
        preDebitStatus: "DELIVERED",
    });
    clock = new Date(clock.getTime() + 27 * HOUR);
    expect(await runDue(invoiceId)).toEqual(["DEBIT"]);
    return { intentId: intent.id, orderId };
}

describe("a renewal with autopay", () => {
    it("renews, prepares with a notice, debits once it's delivered, and is paid by the webhook: RENEWED then CHARGED", async () => {
        const who = await autopayMember();
        const invoice = await renew(who.subscriptionId);

        // Queued with the renewal: a CREATED charge, its first step.
        let [intent] = await intentsOf(invoice.id);
        expect(intent).toMatchObject({
            status: "CREATED",
            idempotencyKey: `inv_${invoice.id}_1`,
            viaMandateId: who.mandateId,
            amountCents: 120_000,
            purpose: null,
        });
        expect(
            await chargeUnderWayOn(prisma, owner.organizationId, invoice.id),
        ).not.toBeNull();

        // Step one: the order with its pre-debit notice, 26 hours ahead.
        expect(await runDue(invoice.id)).toEqual(["PREPARE"]);
        [intent] = await intentsOf(invoice.id);
        expect(intent).toMatchObject({
            status: "REQUIRES_PAYMENT",
            preDebitStatus: "PENDING",
        });
        expect(intent.debitAfter?.getTime()).toBeGreaterThanOrEqual(
            clock.getTime() + 26 * HOUR,
        );
        const [debit] = await chargeJobs(invoice.id);
        expect(debit.runAt.getTime()).toBe(intent.debitAfter?.getTime());

        // Due, but the notice isn't out yet: asked again later, no debit.
        clock = new Date(clock.getTime() + 27 * HOUR);
        expect(await runDue(invoice.id)).toEqual(["DEBIT"]);
        expect(calls("charge")).toHaveLength(0);
        expect(await chargeJobs(invoice.id)).toHaveLength(1);

        // The notice's webhook, then the debit.
        const orderId = intent.providerIntentId ?? "";
        fake.settlePreDebit(orderId, "DELIVERED");
        await webhook({
            eventType: "order.notification.delivered",
            outcome: "PRE_DEBIT",
            providerIntentId: orderId,
            preDebitStatus: "DELIVERED",
        });
        clock = new Date(clock.getTime() + 2 * HOUR);
        expect(await runDue(invoice.id)).toEqual(["DEBIT"]);
        expect(calls("charge")).toHaveLength(1);
        expect((await intentsOf(invoice.id))[0].status).toBe("PROCESSING");

        // The bank answers; the payment's webhook pays the invoice.
        const answered = fake.answerCharge(orderId, "SUCCEEDED");
        await webhook({
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId: orderId,
            providerPaymentRef: answered.providerPaymentRef,
        });
        expect(
            await prisma.invoice.findUniqueOrThrow({
                where: { id: invoice.id },
            }),
        ).toMatchObject({ status: "PAID", paymentMethod: "ONLINE" });
        const events = await eventsOf(who.subscriptionId);
        expect(events.slice(-2)).toEqual(["RENEWED", "CHARGED"]);
        expect(
            await chargeUnderWayOn(prisma, owner.organizationId, invoice.id),
        ).toBeNull();

        // The look-up, later, finds it settled and changes nothing.
        clock = new Date(clock.getTime() + 37 * HOUR);
        expect(await runDue(invoice.id)).toEqual(["LOOK"]);
        expect(
            (await eventsOf(who.subscriptionId)).filter((k) => k === "CHARGED"),
        ).toHaveLength(1);
    });

    it("a card needs no notice: debited as soon as it is prepared", async () => {
        fake.preDebitMethods.clear();
        const who = await autopayMember();
        const invoice = await renew(who.subscriptionId);
        expect(await runDue(invoice.id)).toEqual(["PREPARE"]);
        expect(await runDue(invoice.id)).toEqual(["DEBIT"]);
        expect(calls("charge")).toHaveLength(1);
    });

    it("a job delivered twice prepares one order and debits once", async () => {
        const who = await autopayMember();
        const invoice = await renew(who.subscriptionId);
        await runDue(invoice.id, { twice: true });
        expect(
            new Set(
                calls("prepareCharge").map(
                    (c) => (c.input as { reference: string }).reference,
                ),
            ).size,
        ).toBe(1);
        // One DEBIT step waits, not two.
        expect(await chargeJobs(invoice.id)).toHaveLength(1);

        const [intent] = await intentsOf(invoice.id);
        fake.settlePreDebit(intent.providerIntentId ?? "", "DELIVERED");
        clock = new Date(clock.getTime() + 27 * HOUR);
        await runDue(invoice.id, { twice: true });
        expect(calls("charge")).toHaveLength(1);
        expect(await intentsOf(invoice.id)).toHaveLength(1);
    });
});

describe("one charge at a time", () => {
    it("while it is under way every other way to pay is a 409, and the account, Detail and Home say so", async () => {
        const who = await autopayMember();
        const { token } = await (async () => {
            // A pay link out before the renewal: its checkout must refuse too.
            const renewal = await renew(who.subscriptionId);
            await prisma.paymentIntent.updateMany({
                where: { invoiceId: renewal.id },
                data: { status: "CANCELLED" },
            });
            const link = await invoices.createPayLink(owner, renewal.id);
            await prisma.paymentIntent.updateMany({
                where: { invoiceId: renewal.id },
                data: { status: "CREATED" },
            });
            return link;
        })();
        const invoice = await prisma.invoice.findFirstOrThrow({
            where: { subscriptionId: who.subscriptionId, status: "ISSUED" },
        });
        await runDue(invoice.id);
        // Overdue meanwhile, so "Pay now" would otherwise show.
        await prisma.invoice.update({
            where: { id: invoice.id },
            data: { dueAt: new Date(Date.now() - DAY) },
        });

        // Staff "New link".
        await expect(invoices.createPayLink(owner, invoice.id)).rejects.toThrow(
            "Autopay charge in progress",
        );
        // Retry by pay link, and by mandate.
        await expect(
            subscriptions.retryPayment(owner, who.subscriptionId),
        ).rejects.toThrow("Autopay charge in progress");
        await expect(
            subscriptions.retryPayment(owner, who.subscriptionId, "MANDATE"),
        ).rejects.toBeInstanceOf(ConflictException);
        // The customer's pay page: says so, and its checkout refuses.
        const page = await publicInvoices.read(token);
        expect(page.autopayCharging?.at).toBeDefined();
        await expect(publicInvoices.createIntent(token, {})).rejects.toThrow(
            "Autopay charge in progress",
        );
        // The account: no "Pay now", the charge named, and a 409.
        const member = {
            organizationId: owner.organizationId,
            contactId: who.contactId,
            accountId: "acct_none",
        };
        const tab = await account.tab(member);
        if (!tab.subscriptions.ok) throw new Error("tab failed");
        const plan = tab.subscriptions.value[0];
        expect(plan.payNow).toBeNull();
        expect(plan.autopayCharging?.at).toBeDefined();
        await expect(
            account.payLink(member, who.subscriptionId),
        ).rejects.toThrow("Autopay charge in progress");
        // Subscription Detail: no Retry, the charge named.
        const detail = await subscriptions.get(owner, who.subscriptionId);
        expect(detail.retryVia).toBeNull();
        expect(detail.autopayCharge?.at).toBeDefined();
        // Home: the row says so.
        const home = await failedRenewals(
            prisma,
            owner.organizationId,
            new Date(),
            true,
        );
        const row = home?.evidence?.find((e) => e.id === who.subscriptionId);
        expect(row?.tag).toMatch(/^Autopay charge in progress · /);
        // No second intent anywhere.
        const all = await prisma.paymentIntent.findMany({
            where: { invoiceId: invoice.id, status: { not: "CANCELLED" } },
        });
        expect(all).toHaveLength(1);
    });
});

describe("a decline", () => {
    it("fails the charge, writes RENEWAL_FAILED, tells the team, opens the pay link, and Retry charges again under a new key", async () => {
        const who = await autopayMember();
        const invoice = await renew(who.subscriptionId);
        const { intentId, orderId } = await chargeToBank(invoice.id);

        fake.answerCharge(orderId, "FAILED");
        await webhook({
            eventType: "payment.failed",
            outcome: "FAILED",
            providerIntentId: orderId,
        });
        expect(
            (
                await prisma.paymentIntent.findUniqueOrThrow({
                    where: { id: intentId },
                })
            ).status,
        ).toBe("FAILED");
        expect(
            (
                await prisma.invoice.findUniqueOrThrow({
                    where: { id: invoice.id },
                })
            ).status,
        ).toBe("ISSUED");
        const failed = await prisma.subscriptionEvent.findFirstOrThrow({
            where: {
                subscriptionId: who.subscriptionId,
                kind: "RENEWAL_FAILED",
            },
        });
        expect(failed).toMatchObject({
            invoiceId: invoice.id,
            data: { reason: "DECLINED" },
        });
        // The team's "Payment failed" alert (F14).
        expect(
            await prisma.job.count({
                where: {
                    organizationId: owner.organizationId,
                    type: "team.alert",
                    payload: { path: ["paymentIntentId"], equals: intentId },
                },
            }),
        ).toBe(1);
        // Home: "Payment failed", before the due date.
        const home = await failedRenewals(
            prisma,
            owner.organizationId,
            new Date(),
            true,
        );
        expect(
            home?.evidence?.find((e) => e.id === who.subscriptionId)?.tag,
        ).toBe("Payment failed");
        // Detail offers Retry by autopay; the pay link works again.
        const detail = await subscriptions.get(owner, who.subscriptionId);
        expect(detail.paymentFailed).toBe(true);
        expect(detail.retryVia).toBe("MANDATE");
        await expect(
            invoices.createPayLink(owner, invoice.id),
        ).resolves.toHaveProperty("token");

        // Retry by autopay: a new attempt, a new order and notice.
        const retried = await subscriptions.retryPayment(
            owner,
            who.subscriptionId,
            "MANDATE",
        );
        expect(retried).toEqual({
            invoiceId: invoice.id,
            via: "MANDATE",
            token: null,
        });
        const intents = await intentsOf(invoice.id);
        expect(intents.map((i) => i.idempotencyKey)).toEqual([
            `inv_${invoice.id}_1`,
            `inv_${invoice.id}_2`,
        ]);
        expect(intents[1].status).toBe("CREATED");
        expect(await runDue(invoice.id)).toEqual(["PREPARE"]);
        expect((await intentsOf(invoice.id))[1].providerIntentId).not.toBe(
            orderId,
        );
    });

    it("a notice that fails: no debit, RENEWAL_FAILED (NOTICE_FAILED), the pay link opens", async () => {
        const who = await autopayMember();
        const invoice = await renew(who.subscriptionId);
        await runDue(invoice.id);
        const [intent] = await intentsOf(invoice.id);
        fake.settlePreDebit(intent.providerIntentId ?? "", "FAILED");
        await webhook({
            eventType: "order.notification.failed",
            outcome: "PRE_DEBIT",
            providerIntentId: intent.providerIntentId,
            preDebitStatus: "FAILED",
        });
        clock = new Date(clock.getTime() + 27 * HOUR);
        await runDue(invoice.id);
        expect(calls("charge")).toHaveLength(0);
        expect((await intentsOf(invoice.id))[0].status).toBe("CANCELLED");
        expect(
            await prisma.subscriptionEvent.findFirst({
                where: {
                    subscriptionId: who.subscriptionId,
                    kind: "RENEWAL_FAILED",
                },
            }),
        ).toMatchObject({ data: { reason: "NOTICE_FAILED" } });
        await expect(
            invoices.createPayLink(owner, invoice.id),
        ).resolves.toHaveProperty("token");
    });
});

describe("an unsure answer", () => {
    it("stays in progress; Retry asks first, finds the capture and pays the invoice without a second debit", async () => {
        const who = await autopayMember();
        const invoice = await renew(who.subscriptionId);
        await runDue(invoice.id);
        const [intent] = await intentsOf(invoice.id);
        const orderId = intent.providerIntentId ?? "";
        fake.settlePreDebit(orderId, "DELIVERED");
        clock = new Date(clock.getTime() + 27 * HOUR);
        // The debit went through, but its answer was lost.
        fake.failNextMandateCall("charge", "UNKNOWN", { madeAnyway: true });
        await runDue(invoice.id);
        expect((await intentsOf(invoice.id))[0].status).toBe("PROCESSING");
        // Still under way: never FAILED, never charged again.
        await expect(invoices.createPayLink(owner, invoice.id)).rejects.toThrow(
            "Autopay charge in progress",
        );

        // The bank took it; its webhook was lost.
        fake.answerCharge(orderId, "SUCCEEDED");
        await prisma.invoice.update({
            where: { id: invoice.id },
            data: { dueAt: new Date(Date.now() - DAY) },
        });
        const retried = await subscriptions.retryPayment(
            owner,
            who.subscriptionId,
            "MANDATE",
        );
        expect(retried).toMatchObject({ paid: true, via: "MANDATE" });
        expect(calls("findCharge")).toHaveLength(1);
        expect(calls("charge")).toHaveLength(1);
        expect(
            (
                await prisma.invoice.findUniqueOrThrow({
                    where: { id: invoice.id },
                })
            ).status,
        ).toBe("PAID");
        expect(await intentsOf(invoice.id)).toHaveLength(1);
        expect(await eventsOf(who.subscriptionId)).toContain("CHARGED");

        // The webhook, late: nothing twice.
        await webhook({
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId: orderId,
            providerPaymentRef: `fake_mandate_pay_inv_${invoice.id}_1`,
        });
        expect(
            (await eventsOf(who.subscriptionId)).filter((k) => k === "CHARGED"),
        ).toHaveLength(1);
    });

    it("the job's look-up asks for the debit again when the provider made none", async () => {
        const who = await autopayMember();
        const invoice = await renew(who.subscriptionId);
        await runDue(invoice.id);
        const [intent] = await intentsOf(invoice.id);
        fake.settlePreDebit(intent.providerIntentId ?? "", "DELIVERED");
        clock = new Date(clock.getTime() + 27 * HOUR);
        // No answer, and nothing was made.
        fake.failNextMandateCall("charge", "UNKNOWN");
        await runDue(invoice.id);
        clock = new Date(clock.getTime() + 2 * HOUR);
        expect(await runDue(invoice.id)).toEqual(["LOOK"]);
        expect((await intentsOf(invoice.id))[0].status).toBe(
            "REQUIRES_PAYMENT",
        );
        expect(await runDue(invoice.id)).toEqual(["DEBIT"]);
        expect(calls("charge")).toHaveLength(2);
        expect((await intentsOf(invoice.id))[0].status).toBe("PROCESSING");
    });
});

describe("the limit", () => {
    it("a renewal above it isn't charged: MANDATE_LIMIT_LOW, Home says so, and Retry makes a pay link", async () => {
        // Authorised for ₹1,000; the plan is ₹1,200.
        const who = await autopayMember(100_000);
        const invoice = await renew(who.subscriptionId);
        expect(await intentsOf(invoice.id)).toHaveLength(0);
        expect(await chargeJobs(invoice.id)).toHaveLength(0);
        expect(
            await prisma.subscriptionEvent.findFirst({
                where: {
                    subscriptionId: who.subscriptionId,
                    kind: "MANDATE_LIMIT_LOW",
                },
            }),
        ).toMatchObject({
            invoiceId: invoice.id,
            data: { limit: "1000.00", amount: "1200.00", currency: "INR" },
        });
        const home = await failedRenewals(
            prisma,
            owner.organizationId,
            new Date(),
            true,
        );
        expect(
            home?.evidence?.find((e) => e.id === who.subscriptionId)?.tag,
        ).toBe("Autopay limit too low");
        const detail = await subscriptions.get(owner, who.subscriptionId);
        expect(detail.retryVia).toBe("PAY_LINK");
        await expect(
            subscriptions.retryPayment(owner, who.subscriptionId, "MANDATE"),
        ).rejects.toThrow("more than their autopay covers");
        expect(
            await subscriptions.retryPayment(owner, who.subscriptionId),
        ).toMatchObject({ via: "PAY_LINK", token: expect.any(String) });
        expect(calls("prepareCharge")).toHaveLength(0);
    });
});

describe("never charged", () => {
    it("a subscription cancelled between the renewal and the job", async () => {
        const who = await autopayMember();
        const invoice = await renew(who.subscriptionId);
        await subscriptions.cancel(owner, who.subscriptionId, { when: "now" });
        await runDue(invoice.id);
        expect(calls("prepareCharge")).toHaveLength(0);
        expect((await intentsOf(invoice.id))[0].status).toBe("CANCELLED");
    });

    it("a mandate the customer cancelled after the notice went out", async () => {
        const who = await autopayMember();
        const invoice = await renew(who.subscriptionId);
        await runDue(invoice.id);
        const mandate = await prisma.paymentMandate.findUniqueOrThrow({
            where: { id: who.mandateId },
        });
        await webhook({
            eventType: "token.cancelled",
            outcome: "MANDATE",
            mandate: {
                status: "CANCELLED",
                providerMandateId: mandate.providerMandateId,
            },
        });
        const [intent] = await intentsOf(invoice.id);
        fake.settlePreDebit(intent.providerIntentId ?? "", "DELIVERED");
        clock = new Date(clock.getTime() + 27 * HOUR);
        await runDue(invoice.id);
        expect(calls("charge")).toHaveLength(0);
        expect((await intentsOf(invoice.id))[0].status).toBe("CANCELLED");
        // The pay link is the way now.
        await expect(
            invoices.createPayLink(owner, invoice.id),
        ).resolves.toHaveProperty("token");
    });

    it("an invoice paid another way before the job ran", async () => {
        const who = await autopayMember();
        const invoice = await renew(who.subscriptionId);
        await prisma.invoice.update({
            where: { id: invoice.id },
            data: { status: "PAID", paidAt: new Date() },
        });
        await runDue(invoice.id);
        expect(calls("prepareCharge")).toHaveLength(0);
        expect((await intentsOf(invoice.id))[0].status).toBe("CANCELLED");
    });

    it("a renewal without autopay: invoiced exactly as before", async () => {
        const contactId = (
            await prisma.contact.create({
                data: {
                    organizationId: owner.organizationId,
                    email: `c-${next()}@example.in`,
                },
            })
        ).id;
        const { id } = await subscriptions.subscribe(owner, {
            contactId,
            planId,
        });
        const invoice = await renew(id);
        expect(invoice.status).toBe("ISSUED");
        expect(await intentsOf(invoice.id)).toHaveLength(0);
        expect(await chargeJobs(invoice.id)).toHaveLength(0);
    });
});
