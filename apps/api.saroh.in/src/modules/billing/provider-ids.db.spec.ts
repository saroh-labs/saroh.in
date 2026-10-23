/**
 * Every payment followed both ways (owner, 17 Oct 2026: "make sure the info
 * passed to razorpay properly and mapped in our app too with the razorpay
 * customer id"), against a real Postgres through the fake billing provider
 * (no Razorpay call is ever made):
 *
 * - the subscription keeps the business's provider customer on every path
 *   a checkout completes by (the return from paying, the webhook, a
 *   dropped checkout honoured, a yearly order), and a move to Free keeps it;
 * - Saroh's invoice keeps the payment and the customer; one written by the
 *   return from paying with no payment id is filled in by the charge's
 *   webhook, never a second invoice;
 * - the payment's notes get Saroh's invoice number, business and checkout
 *   (a job, never in the invoice's way).
 *
 * Every catalogue, price and seller detail is made up (`fakeCatalog`).
 * Integration project (TEST_DATABASE_URL).
 */
import { createHmac } from "node:crypto";

import type { Job } from "@saroh/database";
import {
    prisma,
    startOnFreePlan,
    writeCatalogueVersion,
} from "@saroh/database";
import { planRows } from "@saroh/pricing-catalog";

import {
    giveBillingDetails,
    giveBillingProfile,
} from "../../../test/business-details";
import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import type { OrganizationContext } from "../../common/types/organization-context";
import { BILLING_NOTE_AUTHOR } from "./billing-ops-notice";
import { BillingWebhookService } from "./billing-webhook.service";
import { CheckoutConfirmService } from "./checkout-confirm.service";
import { CheckoutService } from "./checkout.service";
import {
    BILLING_PAYMENT_NOTES_TYPE,
    PAYMENT_NOTES_MAX_ATTEMPTS,
    PaymentNotesHandler,
} from "./payment-notes.job";
import { PlansService } from "./plans.service";
import type { BillingEventPhase } from "./providers/billing-provider.port";
import { BillingProviderError } from "./providers/billing-provider.port";
import {
    FakeBillingProvider,
    FakeBillingProviderFactory,
} from "./providers/fake.provider";
import { SarohInvoicesService } from "./saroh-invoices.service";
import type { SarohSeller } from "./saroh-seller";

const SECRET = "whsec_fake_platform_secret";
const DAY = 24 * 60 * 60 * 1000;
const tag = `${process.pid}-${Date.now()}`;

const SELLER: SarohSeller = {
    name: "Saroh",
    legalName: "Example Labs Pvt Ltd",
    gstin: "29AAAAA0000A1Z5",
    state: "29",
    address: "1 Test Road, Testville",
    email: "billing@example.test",
    sac: "999999",
    prefix: "TST",
};

let fake: FakeBillingProvider;
let factory: FakeBillingProviderFactory;
let checkout: CheckoutService;
let webhooks: BillingWebhookService;
let confirmer: CheckoutConfirmService;

beforeEach(async () => {
    fake = new FakeBillingProvider("RAZORPAY", SECRET);
    factory = new FakeBillingProviderFactory(fake);
    checkout = new CheckoutService(new PlansService(), factory);
    webhooks = new BillingWebhookService(
        factory,
        undefined,
        new SarohInvoicesService(SELLER),
    );
    confirmer = new CheckoutConfirmService(factory, webhooks);
    await prisma.job.deleteMany({});
    await prisma.sarohInvoice.deleteMany({});
    await prisma.sarohInvoiceSequence.deleteMany({});
    await prisma.billingWebhookEvent.deleteMany({});
    await prisma.billingCheckout.deleteMany({});
    await prisma.subscription.deleteMany({});
    await prisma.pricingProviderPlan.deleteMany({});
    await prisma.pricingCatalogVersion.deleteMany({});
    await prisma.plan.deleteMany({});
    const catalog = fakeCatalog((c) => {
        c.yearly = { on: true, paid: 10 };
    });
    const rows = planRows(catalog, 1);
    const { planIds } = await writeCatalogueVersion(prisma, {
        version: 1,
        catalog,
        goLiveAt: new Date(Date.now() - DAY),
        policy: "keep",
        planRows: rows,
    });
    await prisma.pricingProviderPlan.createMany({
        data: planIds
            .filter((_, i) => rows[i]!.priceCents > 0)
            .map((planId) => ({
                planId,
                provider: "RAZORPAY",
                status: "SYNCED",
                providerPlanId: `plan_${planId}`,
            })),
    });
});

let seq = 0;
async function business(): Promise<OrganizationContext> {
    seq += 1;
    const org = await prisma.organization.create({
        data: { name: `Ids ${seq}`, slug: `ids-${seq}-${tag}` },
    });
    await startOnFreePlan(prisma, org.id, { planId: "free" });
    await giveBillingDetails(org.id);
    return { organizationId: org.id, userId: "owner-user", role: "OWNER" };
}

/** The fake's customer of the billing profile the business is billed to. */
async function customerOf(organizationId: string): Promise<string> {
    return `fake_cus_${await giveBillingProfile(organizationId)}`;
}

async function sub(organizationId: string) {
    return prisma.subscription.findUniqueOrThrow({
        where: { organizationId },
        include: { plan: true },
    });
}

let evt = 0;
async function deliver(
    ref: string,
    phase: BillingEventPhase,
    over: {
        currentPeriodEnd?: Date;
        paymentId?: string;
        customerId?: string;
        type?: string;
    } = {},
) {
    evt += 1;
    const status = (
        {
            authenticated: "IGNORED",
            activated: "ACTIVE",
            charged: "ACTIVE",
            pending: "PAST_DUE",
            halted: "PAST_DUE",
            cancelled: "CANCELLED",
            completed: "CANCELLED",
            other: "IGNORED",
        } as const
    )[phase];
    const raw = Buffer.from(
        JSON.stringify({
            providerEventId: `evt_${evt}_${tag}`,
            type: over.type ?? `subscription.${phase}`,
            providerSubscriptionId: ref,
            status,
            phase,
            eventAt: new Date(Date.now() + evt).toISOString(),
            ...(over.currentPeriodEnd
                ? { currentPeriodEnd: over.currentPeriodEnd.toISOString() }
                : {}),
            ...(over.paymentId ? { providerPaymentId: over.paymentId } : {}),
            ...(over.customerId ? { providerCustomerId: over.customerId } : {}),
        }),
    );
    const signature = createHmac("sha256", SECRET).update(raw).digest("hex");
    return webhooks.handle("razorpay", raw, {
        "x-fake-signature": signature,
    });
}

async function start(ctx: OrganizationContext, plan: string, cycle = "month") {
    const r = await checkout.changePlan(ctx, {
        plan,
        cycle: cycle as "month" | "year",
    });
    if (r.kind === "TO_FREE") throw new Error("expected a checkout");
    return {
        id: r.checkout.id,
        ref:
            cycle === "year"
                ? `fake_order_${r.checkout.id}`
                : `fake_sub_${r.checkout.id}`,
    };
}

const notesJobs = () =>
    prisma.job.findMany({ where: { type: BILLING_PAYMENT_NOTES_TYPE } });

describe("the business's provider customer on its subscription", () => {
    it("the return from paying: kept on the subscription and the invoice; the charge's webhook fills in the payment", async () => {
        const ctx = await business();
        const customer = await customerOf(ctx.organizationId);
        const c = await start(ctx, "c");
        const end = new Date(Date.now() + 30 * DAY);
        // A subscription's lookup names no payment.
        fake.statuses.set(c.ref, {
            phase: "charged",
            status: "ACTIVE",
            currentPeriodEnd: end,
        });
        expect(await confirmer.confirm(ctx)).toMatchObject({
            state: "completed",
        });
        expect(await sub(ctx.organizationId)).toMatchObject({
            providerCustomerId: customer,
        });
        const written = await prisma.sarohInvoice.findFirstOrThrow({
            where: { organizationId: ctx.organizationId },
        });
        expect(written).toMatchObject({
            providerCustomerId: customer,
            providerPaymentId: null,
        });
        expect(await notesJobs()).toHaveLength(0);

        // The charge's webhook for the same period: the same invoice, its
        // payment filled in, and the payment's notes queued once.
        await deliver(c.ref, "charged", {
            currentPeriodEnd: end,
            paymentId: "pay_late",
        });
        await deliver(c.ref, "charged", {
            currentPeriodEnd: end,
            paymentId: "pay_late",
        });
        const invoices = await prisma.sarohInvoice.findMany({
            where: { organizationId: ctx.organizationId },
        });
        expect(invoices).toHaveLength(1);
        expect(invoices[0]).toMatchObject({
            id: written.id,
            providerPaymentId: "pay_late",
            providerCustomerId: customer,
        });
        const jobs = await notesJobs();
        expect(jobs).toHaveLength(1);
        await new PaymentNotesHandler(factory).handle(jobs[0]!);
        expect(fake.paymentNotes.set).toEqual([
            {
                providerPaymentId: "pay_late",
                notes: {
                    saroh_invoice: written.number,
                    organizationId: ctx.organizationId,
                    saroh_checkout: c.id,
                },
            },
        ]);
    });

    it("the return from paying with the payment named: on the invoice, its notes queued", async () => {
        const ctx = await business();
        const c = await start(ctx, "c");
        fake.statuses.set(c.ref, {
            phase: "charged",
            status: "ACTIVE",
            currentPeriodEnd: new Date(Date.now() + 30 * DAY),
            providerPaymentId: "pay_now",
        });
        await confirmer.confirm(ctx);
        expect(
            await prisma.sarohInvoice.findFirstOrThrow({
                where: { organizationId: ctx.organizationId },
            }),
        ).toMatchObject({ providerPaymentId: "pay_now" });
        expect(await notesJobs()).toHaveLength(1);
    });

    it("the webhook: the provider's customer when Saroh's checkout has none, and the checkout keeps it too", async () => {
        const ctx = await business();
        const c = await start(ctx, "b");
        // A customer Saroh couldn't make at checkout.
        await prisma.billingCheckout.update({
            where: { id: c.id },
            data: { providerCustomerId: null },
        });
        await deliver(c.ref, "activated", {
            currentPeriodEnd: new Date(Date.now() + 30 * DAY),
            paymentId: "pay_web",
            customerId: "cust_from_event",
        });
        expect(await sub(ctx.organizationId)).toMatchObject({
            plan: { key: "catalog.b" },
            providerCustomerId: "cust_from_event",
        });
        expect(
            await prisma.billingCheckout.findUniqueOrThrow({
                where: { id: c.id },
            }),
        ).toMatchObject({ providerCustomerId: "cust_from_event" });
        expect(
            await prisma.sarohInvoice.findFirstOrThrow({
                where: { organizationId: ctx.organizationId },
            }),
        ).toMatchObject({
            providerPaymentId: "pay_web",
            providerCustomerId: "cust_from_event",
        });
    });

    it("a dropped checkout honoured: on its customer", async () => {
        const ctx = await business();
        const first = await start(ctx, "b");
        await start(ctx, "c"); // replaces it, never paid
        await deliver(first.ref, "activated", {
            currentPeriodEnd: new Date(Date.now() + 30 * DAY),
        });
        expect(await sub(ctx.organizationId)).toMatchObject({
            providerSubscriptionId: first.ref,
            providerCustomerId: await customerOf(ctx.organizationId),
        });
    });

    it("a yearly order paid: the customer on the subscription and the invoice", async () => {
        const ctx = await business();
        const c = await start(ctx, "c", "year");
        await deliver(c.ref, "charged", {
            type: "order.paid",
            paymentId: "pay_year",
        });
        expect(await sub(ctx.organizationId)).toMatchObject({
            plan: { key: "catalog.c", interval: "year" },
            providerCustomerId: await customerOf(ctx.organizationId),
        });
        expect(
            await prisma.sarohInvoice.findFirstOrThrow({
                where: { organizationId: ctx.organizationId },
            }),
        ).toMatchObject({
            providerPaymentId: "pay_year",
            providerCustomerId: await customerOf(ctx.organizationId),
        });
    });

    it("a move to Free keeps the customer, for history and the next checkout", async () => {
        const ctx = await business();
        const c = await start(ctx, "b");
        await deliver(c.ref, "activated", {
            currentPeriodEnd: new Date(Date.now() + 30 * DAY),
        });
        // Nothing paid ahead: on Free at once.
        await prisma.subscription.update({
            where: { organizationId: ctx.organizationId },
            data: { currentPeriodEnd: new Date(Date.now() - DAY) },
        });
        await checkout.changePlan(ctx, { plan: "free", cycle: "month" });
        expect(await sub(ctx.organizationId)).toMatchObject({
            plan: { key: "catalog.free" },
            providerSubscriptionId: null,
            providerCustomerId: await customerOf(ctx.organizationId),
        });
    });
});

describe("the payment's notes job", () => {
    async function job(): Promise<Job> {
        const ctx = await business();
        const c = await start(ctx, "c");
        fake.statuses.set(c.ref, {
            phase: "charged",
            status: "ACTIVE",
            currentPeriodEnd: new Date(Date.now() + 30 * DAY),
            providerPaymentId: `pay_${seq}`,
        });
        await confirmer.confirm(ctx);
        const [j] = await notesJobs();
        return j!;
    }

    const opsNotes = (organizationId: string) =>
        prisma.adminOrganizationNote.findMany({
            where: { organizationId, authorUserId: BILLING_NOTE_AUTHOR },
        });

    it("a provider that can't answer is retried; a refusal is logged and left as an operator's note", async () => {
        const j = await job();
        expect(j.maxAttempts).toBe(PAYMENT_NOTES_MAX_ATTEMPTS);
        expect(PAYMENT_NOTES_MAX_ATTEMPTS).toBeGreaterThanOrEqual(10);
        const handler = new PaymentNotesHandler(factory);
        fake.paymentNotes.failNext = new BillingProviderError(
            "UNKNOWN",
            "network error",
        );
        await expect(handler.handle(j)).rejects.toThrow("network error");
        expect(await opsNotes(j.organizationId!)).toHaveLength(0);
        fake.paymentNotes.failNext = new BillingProviderError(
            "REFUSED",
            "HTTP 400",
        );
        await expect(handler.handle(j)).resolves.toBeUndefined();
        expect(fake.paymentNotes.set).toHaveLength(0);
        expect(await opsNotes(j.organizationId!)).toHaveLength(1);
        await handler.handle(j);
        expect(fake.paymentNotes.set).toHaveLength(1);
    });

    it("still unanswered on the queue's last try: an operator's note, never dropped in silence", async () => {
        const j = await job();
        fake.paymentNotes.failNext = new BillingProviderError(
            "UNKNOWN",
            "network error",
        );
        await expect(
            new PaymentNotesHandler(factory).handle({
                ...j,
                attempts: j.maxAttempts - 1,
            }),
        ).resolves.toBeUndefined();
        const told = await opsNotes(j.organizationId!);
        expect(told).toHaveLength(1);
        expect(told[0]!.body).toContain(`after ${j.maxAttempts} tries`);
    });
});
