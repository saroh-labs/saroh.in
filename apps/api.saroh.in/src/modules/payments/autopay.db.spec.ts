/**
 * The customer sets up autopay (round-2 D12), end to end with the fake
 * provider against a real Postgres: from the invoice's pay link, from the
 * account, and while joining a plan from the Prices page. The offer is the
 * provider's own list; UPI and card pay the invoice and authorise in one
 * provider flow (its capture pays the invoice, its token webhook turns the
 * mandate on); eMandate authorises alone; the customer lands on the
 * business's own site; the account only ever reaches the customer's own
 * plan; and Subscription Detail and the log say what was set up, by whom
 * and from where.
 *
 * Only the app env is stubbed (the credential key, and the renderer's apex).
 * Runs in the integration project (TEST_DATABASE_URL).
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

import { ConflictException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { InvoicesService } from "../invoices/invoices.service";
import type { CustomerContext } from "../site-accounts/customer-context.decorator";
import { AccountAutopayService } from "../subscriptions/account-autopay.service";
import { PublicPlanJoinService } from "../subscriptions/public-plan-join.service";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import {
    FakeWebhookProvider,
    FakeWebhookProviderFactory,
} from "../webhooks/providers/fake.webhook";
import { WebhooksService } from "../webhooks/webhooks.service";
import { AutopayService } from "./autopay.service";
import { MANDATE_CANCEL_TYPE } from "./mandate-cancel-job";
import { MandateSetupService } from "./mandate-setup.service";
import { PaymentsService } from "./payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "./providers/fake.provider";
import { PublicInvoicesService } from "./public-invoices.service";

const WEBHOOK_SECRET = "whsec_d12";

const fake = new FakeMerchantProvider("RAZORPAY");
const factory = new FakeProviderFactory(fake);
const payments = new PaymentsService(factory);
const setups = new MandateSetupService(factory);
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
    new FakeWebhookProviderFactory(new FakeWebhookProvider("RAZORPAY")),
    payments,
);

const tag = `${process.pid}-${Date.now()}`;
let n = 0;
const next = () => `${tag}-${++n}`;

let owner: OrganizationContext;
let planId: string;
let siteId: string;
let subdomain: string;

beforeAll(async () => {
    const user = await prisma.user.create({
        data: { email: `d12-owner-${tag}@x.com` },
    });
    const org = await prisma.organization.create({
        data: { name: "Pulse Fitness", slug: `d12-${tag}` },
    });
    owner = { organizationId: org.id, userId: user.id, role: "OWNER" };
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: "Asia/Kolkata" },
    });
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
    subdomain = `d12x${process.pid}x${Date.now() % 100000}`;
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Pulse Fitness",
            slug: `d12-site-${tag}`,
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
    await payments.connectProvider(owner, {
        provider: "RAZORPAY",
        publicKey: "rzp_test_D12",
        keyId: "rzp_test_D12",
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
    fake.mandateMethodList = ["UPI", "CARD", "EMANDATE"];
    fake.mandateCalls.length = 0;
});

/** A customer with a site account, on the plan, with its first invoice. */
async function member(): Promise<{
    contactId: string;
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
        contactId,
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

/** The provider's capture of a payment on `providerIntentId`. */
const captured = (providerIntentId: string) =>
    webhook({
        eventType: "payment.captured",
        outcome: "SUCCEEDED",
        providerIntentId,
        providerPaymentRef: `pay_${next()}`,
    });

/** The provider's `token.confirmed` for a set-up the customer approved. */
function confirmed(setupReference: string, displayHint = "mo•••@okicici") {
    const setup = fake.authorise(setupReference, { displayHint });
    return webhook({
        eventType: "token.confirmed",
        outcome: "MANDATE",
        mandate: {
            status: "ACTIVE",
            setupReference,
            providerMandateId: setup.providerMandateId,
            providerCustomerId: setup.providerCustomerId,
            method: setup.method,
            displayHint: setup.displayHint,
            maxAmountCents: setup.maxAmountCents,
            expiresAt: setup.expiresAt.toISOString(),
        },
    });
}

const setUpEvents = (subscriptionId: string) =>
    prisma.subscriptionEvent.findMany({
        where: { subscriptionId, kind: "MANDATE_SET_UP" },
        select: {
            actorKind: true,
            customerAccountId: true,
            data: true,
        },
    });

describe("what autopay is offered", () => {
    it("is the provider's own list, in its order, never narrowed", async () => {
        fake.mandateMethodList = ["CARD", "UPI"];
        expect(await autopay.offer(owner.organizationId)).toEqual([
            "CARD",
            "UPI",
        ]);
        const { invoiceId } = await member();
        const { token } = await invoices.createPayLink(owner, invoiceId);
        const read = await publicInvoices.read(token);
        expect(read.autopay).toEqual({
            plan: "Monthly unlimited",
            methods: ["CARD", "UPI"],
            on: null,
            // The fake takes no ₹1 check unless a test says so (D12B).
            checks: {},
        });
    });

    it("isn't offered anywhere when the provider takes none", async () => {
        fake.mandateMethodList = [];
        const { invoiceId, customer, subscriptionId } = await member();
        const { token } = await invoices.createPayLink(owner, invoiceId);
        expect((await publicInvoices.read(token)).autopay ?? null).toBeNull();
        await expect(
            publicInvoices.startAutopay(token, { method: "UPI" }),
        ).rejects.toBeInstanceOf(ConflictException);
        await expect(
            accountAutopay.start(customer, subscriptionId, "UPI"),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(
            await prisma.paymentMandate.count({ where: { subscriptionId } }),
        ).toBe(0);
    });

    it("isn't offered on an invoice that isn't a plan's, and a POST is a 409", async () => {
        const inv = await prisma.invoice.create({
            data: {
                organizationId: owner.organizationId,
                status: "ISSUED",
                kind: "INVOICE",
                source: "PACK",
                number: `PK-${next()}`,
                issuedAt: new Date(),
                currency: "INR",
                subtotal: "4500.00",
                total: "4500.00",
            },
        });
        const { token } = await invoices.createPayLink(owner, inv.id);
        expect((await publicInvoices.read(token)).autopay ?? null).toBeNull();
        await expect(
            publicInvoices.startAutopay(token, { method: "UPI" }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(
            await prisma.paymentIntent.count({ where: { invoiceId: inv.id } }),
        ).toBe(0);
    });
});

describe("from the pay link", () => {
    it("pays the invoice and turns autopay on in one provider flow, and lands on the business's site", async () => {
        const { invoiceId, subscriptionId } = await member();
        const { token } = await invoices.createPayLink(owner, invoiceId);

        const start = await publicInvoices.startAutopay(token, {
            method: "UPI",
            idempotencyKey: "tab-1",
        });
        expect(start).toMatchObject({
            method: "UPI",
            mode: "PAY_AND_AUTHORISE",
            limit: "3800.00",
            handoff: {
                provider: "RAZORPAY",
                amountCents: 250000,
                publicKey: "rzp_test_D12",
            },
            returnUrl: `https://${subdomain}.saroh.app/autopay?pay=${token}`,
        });
        // The authorisation's first payment is the invoice's (D11 spike).
        const call = fake.mandateCalls.find((c) => c.op === "createSetup");
        expect(call?.input).toMatchObject({
            method: "UPI",
            firstAmountCents: 250000,
            maxAmountCents: 380000,
            returnUrl: `https://${subdomain}.saroh.app/autopay?pay=${token}`,
        });
        const setupReference = start.handoff.providerIntentId as string;
        const mandate = await prisma.paymentMandate.findUniqueOrThrow({
            where: { id: start.ref },
        });
        expect(mandate).toMatchObject({
            status: "PENDING",
            subscriptionId,
            setupReference,
            setupSource: "PAY_LINK",
            setupAccountId: null,
        });
        // A retried request gets the same window back, and no second set-up.
        const again = await publicInvoices.startAutopay(token, {
            method: "UPI",
            idempotencyKey: "tab-1",
        });
        expect(again.ref).toBe(start.ref);
        expect(
            await prisma.paymentMandate.count({ where: { subscriptionId } }),
        ).toBe(1);

        // Being confirmed until the provider says.
        const waiting = await publicInvoices.autopayOutcome(token);
        expect(waiting.autopay?.state).toBe("PENDING");
        expect(waiting.paid).toBe(false);

        await captured(setupReference);
        await confirmed(setupReference);

        const invoice = await prisma.invoice.findUniqueOrThrow({
            where: { id: invoiceId },
        });
        expect(invoice.status).toBe("PAID");
        const on = await prisma.paymentMandate.findUniqueOrThrow({
            where: { id: start.ref },
        });
        expect(on).toMatchObject({
            status: "ACTIVE",
            subscriptionId,
            displayHint: "mo•••@okicici",
        });

        const outcome = await publicInvoices.autopayOutcome(token);
        expect(outcome).toMatchObject({
            plan: "Monthly unlimited",
            autopay: { state: "ON", method: "UPI", hint: "mo•••@okicici" },
            paid: true,
            nextAmount: "2500.00",
        });
        expect(outcome.nextPaymentAt).not.toBeNull();
        expect((await publicInvoices.read(token)).autopay?.on).toEqual({
            method: "UPI",
            hint: "mo•••@okicici",
        });

        // The merchant can check it: Subscription Detail and the log.
        const detail = await subscriptions.get(owner, subscriptionId);
        expect(detail.autopay).toMatchObject({
            state: "ON",
            method: "UPI",
            hint: "mo•••@okicici",
            limit: "3800.00",
        });
        expect(await setUpEvents(subscriptionId)).toEqual([
            {
                actorKind: "CUSTOMER",
                customerAccountId: null,
                data: { method: "UPI", source: "PAY_LINK" },
            },
        ]);
    });

    it("eMandate authorises alone: nothing taken, the invoice paid as usual", async () => {
        const { invoiceId, subscriptionId } = await member();
        const { token } = await invoices.createPayLink(owner, invoiceId);
        const start = await publicInvoices.startAutopay(token, {
            method: "EMANDATE",
        });
        expect(start.mode).toBe("AUTHORISE");
        expect(start.handoff.amountCents).toBe(0);
        const call = fake.mandateCalls.find((c) => c.op === "createSetup");
        expect(call?.input).toMatchObject({ firstAmountCents: 0 });
        // No payment rides on the authorisation.
        expect(
            await prisma.paymentIntent.count({
                where: {
                    invoiceId,
                    providerIntentId: start.handoff.providerIntentId,
                },
            }),
        ).toBe(0);
        expect(
            (
                await prisma.paymentMandate.findUniqueOrThrow({
                    where: { id: start.ref },
                })
            ).subscriptionId,
        ).toBe(subscriptionId);
    });

    it("an abandoned authorisation stays PENDING, then reads as failed; the invoice is as the payment went", async () => {
        const { invoiceId, subscriptionId } = await member();
        const { token } = await invoices.createPayLink(owner, invoiceId);
        const start = await publicInvoices.startAutopay(token, {
            method: "CARD",
        });
        expect(
            (
                await prisma.paymentMandate.findUniqueOrThrow({
                    where: { id: start.ref },
                })
            ).status,
        ).toBe("PENDING");
        expect(
            (
                await prisma.invoice.findUniqueOrThrow({
                    where: { id: invoiceId },
                })
            ).status,
        ).toBe("ISSUED");
        expect(
            (await autopay.line(owner.organizationId, subscriptionId))?.state,
        ).toBe("PENDING");

        // A day on, the set-up has lapsed.
        const later = new Date(Date.now() + 25 * 60 * 60 * 1000);
        expect(
            await autopay.line(owner.organizationId, subscriptionId, {
                now: later,
            }),
        ).toMatchObject({ state: "FAILED", failure: "EXPIRED" });

        // Refused at the provider: failed, with its reason.
        fake.rejectSetup(start.handoff.providerIntentId as string);
        await webhook({
            eventType: "token.rejected",
            outcome: "MANDATE",
            mandate: {
                status: "FAILED",
                setupReference: start.handoff.providerIntentId,
                failureReason: "mandate_rejected",
            },
        });
        const detail = await subscriptions.get(owner, subscriptionId);
        expect(detail.autopay).toMatchObject({
            state: "FAILED",
            failure: "NOT_APPROVED",
            method: "CARD",
        });
        const outcome = await publicInvoices.autopayOutcome(token);
        expect(outcome.paid).toBe(false);
        expect(outcome.autopay?.state).toBe("FAILED");
    });

    it("re-authorising turns the new mandate on and cancels the old at the provider", async () => {
        const { invoiceId, subscriptionId } = await member();
        const { token } = await invoices.createPayLink(owner, invoiceId);
        const first = await publicInvoices.startAutopay(token, {
            method: "UPI",
        });
        await captured(first.handoff.providerIntentId as string);
        await confirmed(first.handoff.providerIntentId as string);

        // Later — say its limit was too low — they authorise again.
        const second = await publicInvoices.startAutopay(token, {
            method: "CARD",
        });
        expect(second.mode).toBe("AUTHORISE");
        await confirmed(second.handoff.providerIntentId as string, "•••• 4242");

        const old = await prisma.paymentMandate.findUniqueOrThrow({
            where: { id: first.ref },
        });
        expect(old).toMatchObject({
            status: "CANCELLED",
            cancelReason: "REPLACED",
        });
        expect(
            await prisma.paymentMandate.findUniqueOrThrow({
                where: { id: second.ref },
            }),
        ).toMatchObject({ status: "ACTIVE", method: "CARD" });
        expect(
            await prisma.job.count({
                where: {
                    type: MANDATE_CANCEL_TYPE,
                    organizationId: owner.organizationId,
                },
            }),
        ).toBeGreaterThan(0);
        expect(
            (await subscriptions.get(owner, subscriptionId)).autopay,
        ).toMatchObject({ state: "ON", method: "CARD", hint: "•••• 4242" });
    });
});

describe("from the account", () => {
    it("pays what is owed and authorises, from their own plan, landing on their site", async () => {
        const { subscriptionId, customer, invoiceId } = await member();
        const start = await accountAutopay.start(
            customer,
            subscriptionId,
            "UPI",
            "acct-1",
        );
        expect(start).toMatchObject({
            mode: "PAY_AND_AUTHORISE",
            handoff: { amountCents: 250000 },
            returnUrl: `https://${subdomain}.saroh.app/autopay?plan=${subscriptionId}`,
        });
        const ref = start.handoff.providerIntentId as string;
        await captured(ref);
        await confirmed(ref);
        expect(
            (
                await prisma.invoice.findUniqueOrThrow({
                    where: { id: invoiceId },
                })
            ).status,
        ).toBe("PAID");
        const outcome = await accountAutopay.outcome(customer, subscriptionId);
        expect(outcome).toMatchObject({
            autopay: { state: "ON", method: "UPI" },
            paid: true,
        });
        expect(await setUpEvents(subscriptionId)).toEqual([
            {
                actorKind: "CUSTOMER",
                customerAccountId: customer.accountId,
                data: { method: "UPI", source: "ACCOUNT" },
            },
        ]);
    });

    it("with nothing owed, authorises alone", async () => {
        const { subscriptionId, customer, invoiceId } = await member();
        await prisma.invoice.update({
            where: { id: invoiceId },
            data: { status: "PAID", paidAt: new Date() },
        });
        const start = await accountAutopay.start(
            customer,
            subscriptionId,
            "CARD",
        );
        expect(start.mode).toBe("AUTHORISE");
        expect(start.handoff.amountCents).toBe(0);
    });

    it("another customer's plan, in the same business, is a 404 and makes no mandate", async () => {
        const asha = await member();
        const ravi = await member();
        await expect(
            accountAutopay.start(ravi.customer, asha.subscriptionId, "UPI"),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            accountAutopay.outcome(ravi.customer, asha.subscriptionId),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(
            await prisma.paymentMandate.count({
                where: { subscriptionId: asha.subscriptionId },
            }),
        ).toBe(0);
        expect(
            fake.mandateCalls.filter((c) => c.op === "createSetup"),
        ).toHaveLength(0);
    });
});

describe("while joining from the Prices page", () => {
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

    it("pays the first period and authorises in one flow; the mandate starts with the subscription, whichever webhook comes first", async () => {
        const who = await joiner();
        const started = await joins.start(
            who,
            planId,
            "join-1",
            new Date(),
            "UPI",
        );
        expect(started.autopay).toMatchObject({
            method: "UPI",
            mode: "PAY_AND_AUTHORISE",
            returnUrl: `https://${subdomain}.saroh.app/autopay?join=${started.ref}`,
        });
        const setupReference = started.autopay?.handoff
            .providerIntentId as string;
        expect(started.payment.providerIntentId).toBe(setupReference);
        // Nobody is on the plan yet, so no mandate row either (DEC-062).
        expect(
            await prisma.paymentMandate.count({
                where: { id: started.autopay?.ref },
            }),
        ).toBe(0);

        // The token webhook first: held on the draft.
        await confirmed(setupReference);
        const draft = await prisma.invoice.findUniqueOrThrow({
            where: { id: started.ref },
        });
        expect(draft.status).toBe("DRAFT");
        expect(
            (draft.planTerms as { autopay?: { reported?: unknown } }).autopay
                ?.reported,
        ).toMatchObject({ status: "ACTIVE" });

        // Then the payment: joined, and autopay on.
        await captured(setupReference);
        const paid = await prisma.invoice.findUniqueOrThrow({
            where: { id: started.ref },
        });
        expect(paid.status).toBe("PAID");
        const mandate = await prisma.paymentMandate.findUniqueOrThrow({
            where: { id: started.autopay?.ref },
        });
        expect(mandate).toMatchObject({
            status: "ACTIVE",
            subscriptionId: paid.subscriptionId,
            setupSource: "PRICES",
            setupAccountId: who.accountId,
            displayHint: "mo•••@okicici",
        });
        expect(await setUpEvents(paid.subscriptionId as string)).toEqual([
            {
                actorKind: "CUSTOMER",
                customerAccountId: who.accountId,
                data: { method: "UPI", source: "PRICES" },
            },
        ]);

        const page = await accountAutopay.join(
            { ...who, sessionId: "s" },
            started.ref,
        );
        expect(page).toMatchObject({
            state: "joined",
            outcome: { autopay: { state: "ON", method: "UPI" }, paid: true },
        });
    });

    it("the payment first, then the token: the same", async () => {
        const who = await joiner();
        const started = await joins.start(
            who,
            planId,
            "join-2",
            new Date(),
            "CARD",
        );
        const ref = started.autopay?.handoff.providerIntentId as string;
        await captured(ref);
        const joined = await prisma.invoice.findUniqueOrThrow({
            where: { id: started.ref },
        });
        expect(
            await prisma.paymentMandate.findUniqueOrThrow({
                where: { id: started.autopay?.ref },
            }),
        ).toMatchObject({ status: "PENDING", method: "CARD" });
        expect(
            (await accountAutopay.join({ ...who, sessionId: "s" }, started.ref))
                .outcome?.autopay?.state,
        ).toBe("PENDING");
        await confirmed(ref, "•••• 4242");
        expect(
            (await subscriptions.get(owner, joined.subscriptionId as string))
                .autopay,
        ).toMatchObject({ state: "ON", method: "CARD", hint: "•••• 4242" });
    });

    it("just paying joins without autopay", async () => {
        const who = await joiner();
        const started = await joins.start(who, planId, "join-3", new Date());
        expect(started.autopay).toBeNull();
        await captured(started.payment.providerIntentId);
        const paid = await prisma.invoice.findUniqueOrThrow({
            where: { id: started.ref },
        });
        expect(paid.status).toBe("PAID");
        expect(
            await prisma.paymentMandate.count({
                where: { subscriptionId: paid.subscriptionId as string },
            }),
        ).toBe(0);
        // The standing names the new plan, for eMandate's step after.
        expect((await joins.standing(who, started.ref)).subscriptionRef).toBe(
            paid.subscriptionId,
        );
    });
});
