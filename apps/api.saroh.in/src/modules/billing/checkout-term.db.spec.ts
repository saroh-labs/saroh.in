/**
 * DEC-093 against a real Postgres (#803, UX-003, UX-011): how a paid plan
 * is bought and how its term runs, through the fake billing provider (no
 * Razorpay call is ever made).
 *
 * - Monthly is autopay for 12 charges; the catalogue's nominal first month
 *   is taken with the mandate and invoiced on its own.
 * - Yearly is one order for the year — no subscription, no mandate — and a
 *   year that ends with nothing renewed lands on Free (the sweep).
 * - Back from paying, the checkout is confirmed with the provider directly,
 *   and that is idempotent with the webhook whichever lands first.
 * - A finished term keeps the plan to the end of what was paid; the same
 *   plan in its last days is a one-tap renewal from the term's end.
 *
 * Every catalogue here is made up (`fakeCatalog`: Plan A/B/C, 222, 333; a
 * first month of 7). Runs in the integration project (TEST_DATABASE_URL).
 */
import { createHmac } from "node:crypto";

import {
    prisma,
    startOnFreePlan,
    writeCatalogueVersion,
} from "@saroh/database";
import type { Catalog } from "@saroh/pricing-catalog";
import { addMonthsUtc, planRows, withGstPaise } from "@saroh/pricing-catalog";

import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ONE_TIME_PAYMENT } from "./billing-term";
import { BillingWebhookService } from "./billing-webhook.service";
import { CheckoutConfirmService } from "./checkout-confirm.service";
import { CheckoutService } from "./checkout.service";
import { MovesApplyHandler } from "./moves-apply.handler";
import { PlansService } from "./plans.service";
import { BILLING_PROVIDER_CANCEL_TYPE } from "./provider-cancel.job";
import type { BillingEventPhase } from "./providers/billing-provider.port";
import {
    FakeBillingProvider,
    FakeBillingProviderFactory,
} from "./providers/fake.provider";
import { SarohInvoicesService } from "./saroh-invoices.service";
import type { SarohSeller } from "./saroh-seller";

const SECRET = "whsec_fake_platform_secret";
const DAY = 24 * 60 * 60 * 1000;
const FIRST = 700;
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

/** Made up: Plan B has a 30-day first month at 7, yearly pays for 10. */
const TERMS = (edit?: (c: Catalog) => void) =>
    fakeCatalog((c) => {
        c.plans[1]!.trial = { on: true, days: 30, firstPaise: FIRST };
        c.yearly = { on: true, paid: 10 };
        edit?.(c);
    });

let fake: FakeBillingProvider;
let checkout: CheckoutService;
let webhooks: BillingWebhookService;
let confirmer: CheckoutConfirmService;
const sweep = new MovesApplyHandler();

beforeEach(async () => {
    fake = new FakeBillingProvider("RAZORPAY", SECRET);
    const factory = new FakeBillingProviderFactory(fake);
    checkout = new CheckoutService(new PlansService(), factory);
    webhooks = new BillingWebhookService(
        factory,
        undefined,
        new SarohInvoicesService(SELLER),
    );
    confirmer = new CheckoutConfirmService(factory, webhooks);
    await wipe();
});

async function wipe() {
    await prisma.job.deleteMany({});
    await prisma.subscriptionAddonCharge.deleteMany({});
    await prisma.subscriptionAddon.deleteMany({});
    await prisma.pricingCouponRedemption.deleteMany({});
    await prisma.sarohInvoice.deleteMany({});
    await prisma.sarohInvoiceSequence.deleteMany({});
    await prisma.billingWebhookEvent.deleteMany({});
    await prisma.billingCheckout.deleteMany({});
    await prisma.pricingCoupon.deleteMany({});
    await prisma.subscription.deleteMany({});
    await prisma.pricingProviderPlan.deleteMany({});
    await prisma.pricingCatalogVersion.deleteMany({});
    await prisma.plan.deleteMany({});
}

async function install(catalog: Catalog = TERMS()) {
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
}

async function row(planId: string, interval = "month") {
    return prisma.plan.findUniqueOrThrow({
        where: {
            key_version_interval: {
                key: `catalog.${planId}`,
                version: 1,
                interval,
            },
        },
    });
}

let seq = 0;
async function business(): Promise<OrganizationContext> {
    seq += 1;
    const org = await prisma.organization.create({
        data: { name: `Terms ${seq}`, slug: `terms-${seq}-${tag}` },
    });
    await startOnFreePlan(prisma, org.id, { planId: "free" });
    return { organizationId: org.id, userId: "owner-user", role: "OWNER" };
}

async function sub(organizationId: string) {
    return prisma.subscription.findUniqueOrThrow({
        where: { organizationId },
        include: { plan: true },
    });
}

let evt = 0;
async function deliver(
    providerSubscriptionId: string,
    phase: BillingEventPhase,
    over: { currentPeriodEnd?: Date | null; now?: Date; type?: string } = {},
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
            providerSubscriptionId,
            status,
            phase,
            eventAt: new Date(Date.now() + evt).toISOString(),
            ...(over.currentPeriodEnd !== undefined
                ? {
                      currentPeriodEnd:
                          over.currentPeriodEnd?.toISOString() ?? null,
                  }
                : {}),
        }),
    );
    const signature = createHmac("sha256", SECRET).update(raw).digest("hex");
    return webhooks.handle(
        "razorpay",
        raw,
        { "x-fake-signature": signature },
        over.now ?? new Date(),
    );
}

describe("monthly: autopay for a 12-charge term", () => {
    it("is made for 12 charges, never open-ended", async () => {
        await install();
        const ctx = await business();
        const r = await checkout.changePlan(ctx, { plan: "c", cycle: "month" });
        expect(r).toMatchObject({
            kind: "NEW",
            quote: {
                payment: "AUTOPAY",
                termCharges: 12,
                mandateCheck: "PAID",
            },
        });
        expect(fake.createCalls[0]).toMatchObject({ totalCount: 12 });
    });

    it("takes the catalogue's first month with the mandate and invoices it on its own", async () => {
        await install();
        const ctx = await business();
        const q = await checkout.quote(ctx, { plan: "b", cycle: "month" });
        expect(q).toMatchObject({
            kind: "TRIAL",
            chargeNowPaise: FIRST,
            chargeNowTotalPaise: withGstPaise(FIRST),
            payNowTotalPaise: withGstPaise(FIRST),
            mandateCheck: "PAID",
        });
        const r = await checkout.changePlan(ctx, { plan: "b", cycle: "month" });
        if (r.kind !== "TRIAL") throw new Error("expected the first month");
        expect(fake.createCalls[0]).toMatchObject({
            totalCount: 12,
            upfront: {
                name: "Plan B: first month",
                amountPaise: withGstPaise(FIRST),
            },
        });

        await deliver(`fake_sub_${r.checkout.id}`, "authenticated");
        expect(await sub(ctx.organizationId)).toMatchObject({
            status: "TRIALING",
            plan: { key: "catalog.b" },
        });
        const invoice = await prisma.sarohInvoice.findFirstOrThrow({
            include: { lines: true },
        });
        expect(invoice).toMatchObject({
            source: "NEW",
            taxablePaise: FIRST,
            chargeKey: `first-month:${r.checkout.id}`,
        });
        expect(invoice.lines[0]?.description).toBe("Plan B: first month");

        // The first full charge, at the month's end, is still the plan's first.
        const ends = (await sub(ctx.organizationId)).currentPeriodEnd!;
        const b = await row("b");
        await deliver(`fake_sub_${r.checkout.id}`, "charged", {
            currentPeriodEnd: new Date(ends.getTime() + 30 * DAY),
            now: ends,
        });
        const both = await prisma.sarohInvoice.findMany({
            orderBy: { issuedAt: "asc" },
        });
        expect(both.map((i) => [i.source, i.taxablePaise])).toEqual([
            ["NEW", FIRST],
            ["NEW", b.priceCents],
        ]);
    });

    it("a free first month names the refundable check: nothing is due now", async () => {
        await install(
            TERMS((c) => {
                c.plans[1]!.trial = { on: true, days: 30 };
            }),
        );
        const ctx = await business();
        const q = await checkout.quote(ctx, { plan: "b", cycle: "month" });
        expect(q).toMatchObject({
            kind: "TRIAL",
            payNowTotalPaise: 0,
            mandateCheck: "REFUNDED",
        });
    });
});

describe("yearly: one payment for the year", () => {
    it("is a one-time order for exactly the year's price, never a subscription", async () => {
        await install();
        const ctx = await business();
        const cYear = await row("c", "year");
        const r = await checkout.changePlan(ctx, { plan: "c", cycle: "year" });
        expect(r).toMatchObject({
            kind: "NEW",
            authorisationUrl: null,
            quote: {
                payment: "ONE_TIME",
                termCharges: 1,
                mandateCheck: "NONE",
                payNowTotalPaise: withGstPaise(cYear.priceCents),
            },
            checkout: { payment: "ONE_TIME" },
        });
        expect(fake.createCalls).toHaveLength(0);
        expect(fake.orders.created[0]).toMatchObject({
            amountPaise: withGstPaise(cYear.priceCents),
            reference: r.kind === "TO_FREE" ? "" : r.checkout.id,
        });
        const saved = await prisma.billingCheckout.findFirstOrThrow();
        expect(saved).toMatchObject({
            providerPlanId: ONE_TIME_PAYMENT,
            providerSubscriptionId: `fake_order_${saved.id}`,
        });
    });

    it("a plan with a first month has no trial yearly: the year starts when it's paid", async () => {
        await install();
        const ctx = await business();
        const q = await checkout.quote(ctx, { plan: "b", cycle: "year" });
        expect(q).toMatchObject({ kind: "NEW", payment: "ONE_TIME" });
    });

    it("paid: on the plan for 12 months, invoiced once; the year's end lands it on Free", async () => {
        await install();
        const ctx = await business();
        const r = await checkout.changePlan(ctx, { plan: "c", cycle: "year" });
        if (r.kind === "TO_FREE") throw new Error("expected a checkout");
        const order = `fake_order_${r.checkout.id}`;
        const now = new Date();
        await deliver(order, "charged", { type: "order.paid", now });
        const on = await sub(ctx.organizationId);
        expect(on).toMatchObject({
            status: "ACTIVE",
            billingCycle: "year",
            plan: { key: "catalog.c", interval: "year" },
            providerSubscriptionId: order,
        });
        expect(on.currentPeriodEnd?.getTime()).toBe(
            addMonthsUtc(now, 12).getTime(),
        );
        expect(await prisma.sarohInvoice.count()).toBe(1);

        // Nothing marks the end of a year paid once: the sweep does.
        const after = new Date(on.currentPeriodEnd!.getTime() + DAY);
        await sweep.sweep(after);
        expect(await sub(ctx.organizationId)).toMatchObject({
            plan: { key: "catalog.free" },
            provider: null,
            providerSubscriptionId: null,
        });
    });
});

describe("back from paying: confirmed with the provider", () => {
    it("moves the plan without the webhook, and the webhook after it changes nothing", async () => {
        await install();
        const ctx = await business();
        const r = await checkout.changePlan(ctx, { plan: "c", cycle: "month" });
        if (r.kind === "TO_FREE") throw new Error("expected a checkout");
        const ref = `fake_sub_${r.checkout.id}`;
        const end = new Date(Date.now() + 30 * DAY);

        // Not paid yet: still waiting, nothing moves.
        expect(await confirmer.confirm(ctx)).toMatchObject({
            state: "waiting",
            plan: { id: "c", name: "Plan C" },
        });
        expect((await sub(ctx.organizationId)).plan.key).toBe("catalog.free");

        fake.statuses.set(ref, {
            phase: "charged",
            status: "ACTIVE",
            currentPeriodEnd: end,
        });
        expect(await confirmer.confirm(ctx)).toMatchObject({
            state: "completed",
        });
        expect(fake.statuses.asked.at(-1)).toEqual({ ref, oneTime: false });
        const on = await sub(ctx.organizationId);
        expect(on).toMatchObject({
            status: "ACTIVE",
            plan: { key: "catalog.c" },
            providerSubscriptionId: ref,
            currentPeriodEnd: end,
        });
        expect(await prisma.sarohInvoice.count()).toBe(1);

        // The webhook lands later, for the same charge.
        await deliver(ref, "activated", { currentPeriodEnd: end });
        await deliver(ref, "charged", { currentPeriodEnd: end });
        expect(await sub(ctx.organizationId)).toMatchObject({
            plan: { key: "catalog.c" },
            currentPeriodEnd: end,
        });
        expect(await prisma.sarohInvoice.count()).toBe(1);
        // Asked again: nothing waits.
        expect(await confirmer.confirm(ctx)).toMatchObject({ state: "none" });
    });

    it("after the webhook, a confirm changes nothing", async () => {
        await install();
        const ctx = await business();
        const r = await checkout.changePlan(ctx, { plan: "c", cycle: "month" });
        if (r.kind === "TO_FREE") throw new Error("expected a checkout");
        const ref = `fake_sub_${r.checkout.id}`;
        const end = new Date(Date.now() + 30 * DAY);
        await deliver(ref, "activated", { currentPeriodEnd: end });
        fake.statuses.set(ref, {
            phase: "charged",
            status: "ACTIVE",
            currentPeriodEnd: end,
        });
        expect(await confirmer.confirm(ctx)).toMatchObject({ state: "none" });
        expect(await prisma.sarohInvoice.count()).toBe(1);
    });

    it("a yearly order asked by its order, paid once however often it's confirmed", async () => {
        await install();
        const ctx = await business();
        const r = await checkout.changePlan(ctx, { plan: "c", cycle: "year" });
        if (r.kind === "TO_FREE") throw new Error("expected a checkout");
        const ref = `fake_order_${r.checkout.id}`;
        fake.statuses.set(ref, {
            phase: "charged",
            status: "ACTIVE",
            providerPaymentId: "pay_fake_1",
        });
        const [a, b] = await Promise.all([
            confirmer.confirm(ctx),
            confirmer.confirm(ctx),
        ]);
        expect([a.state, b.state].sort()).toEqual(
            expect.arrayContaining(["completed"]),
        );
        expect(fake.statuses.asked[0]).toEqual({ ref, oneTime: true });
        await deliver(ref, "charged", { type: "order.paid" });
        expect(await prisma.sarohInvoice.count()).toBe(1);
        expect(
            (await prisma.sarohInvoice.findFirstOrThrow()).providerPaymentId,
        ).toBe("pay_fake_1");
        expect(await sub(ctx.organizationId)).toMatchObject({
            plan: { key: "catalog.c", interval: "year" },
        });
    });

    it("declined at the provider: failed, and the checkout is closed", async () => {
        await install();
        const ctx = await business();
        const r = await checkout.changePlan(ctx, { plan: "c", cycle: "month" });
        if (r.kind === "TO_FREE") throw new Error("expected a checkout");
        fake.statuses.set(`fake_sub_${r.checkout.id}`, {
            phase: "cancelled",
            status: "CANCELLED",
        });
        expect(await confirmer.confirm(ctx)).toMatchObject({
            state: "failed",
        });
        expect((await prisma.billingCheckout.findFirstOrThrow()).status).toBe(
            "CANCELLED",
        );
        expect((await sub(ctx.organizationId)).plan.key).toBe("catalog.free");
    });

    it("hands the browser the provider's window, never a secret", async () => {
        await install();
        const ctx = await business();
        fake.publicKeyValue = "rzp_test_public";
        const r = await checkout.changePlan(ctx, { plan: "c", cycle: "month" });
        if (r.kind === "TO_FREE") throw new Error("expected a checkout");
        expect(r.handoff).toMatchObject({
            keyId: "rzp_test_public",
            subscriptionId: `fake_sub_${r.checkout.id}`,
            orderId: null,
            prefill: { name: expect.stringMatching(/^Terms /) },
        });
        // Coming back to the page reopens the same one, never a new mandate.
        const open = await checkout.current(ctx);
        expect(open.open?.handoff?.subscriptionId).toBe(
            `fake_sub_${r.checkout.id}`,
        );
        expect(fake.createCalls).toHaveLength(1);
    });
});

describe("the end of a term", () => {
    it("12 charges done: the plan stays to the end of the last one, then Free", async () => {
        await install();
        const ctx = await business();
        const r = await checkout.changePlan(ctx, { plan: "c", cycle: "month" });
        if (r.kind === "TO_FREE") throw new Error("expected a checkout");
        const ref = `fake_sub_${r.checkout.id}`;
        const end = new Date(Date.now() + 20 * DAY);
        await deliver(ref, "activated", { currentPeriodEnd: end });
        await deliver(ref, "completed", { currentPeriodEnd: end });
        const still = await sub(ctx.organizationId);
        expect(still).toMatchObject({
            status: "ACTIVE",
            plan: { key: "catalog.c" },
            cancelAtPeriodEnd: true,
            pendingFrom: end,
        });
        await sweep.sweep(new Date(end.getTime() + DAY));
        expect((await sub(ctx.organizationId)).plan.key).toBe("catalog.free");
    });

    it("in its last days the same plan is a renewal from the term's end, and nothing is cancelled", async () => {
        await install();
        const ctx = await business();
        const r = await checkout.changePlan(ctx, { plan: "c", cycle: "month" });
        if (r.kind === "TO_FREE") throw new Error("expected a checkout");
        const ref = `fake_sub_${r.checkout.id}`;
        const now = new Date();
        // A term that started almost 12 months ago.
        const started = addMonthsUtc(new Date(now.getTime() + 10 * DAY), -12);
        const termEnds = addMonthsUtc(started, 12);
        await deliver(ref, "activated", { currentPeriodEnd: termEnds });
        await prisma.billingCheckout.update({
            where: { id: r.checkout.id },
            data: { completedAt: started },
        });
        expect((await checkout.current(ctx, now)).term).toEqual({
            endsAt: termEnds.toISOString(),
            payment: "AUTOPAY",
            renewOpen: true,
        });

        const q = await checkout.quote(ctx, { plan: "c", cycle: "month" }, now);
        expect(q).toMatchObject({
            kind: "RENEW",
            startAt: termEnds.toISOString(),
            mandateCheck: "REFUNDED",
            termCharges: 12,
        });
        const renew = await checkout.changePlan(
            ctx,
            { plan: "c", cycle: "month" },
            now,
        );
        if (renew.kind === "TO_FREE") throw new Error("expected a checkout");
        expect(renew.kind).toBe("RENEW");
        expect(fake.createCalls.at(-1)).toMatchObject({
            startAt: termEnds,
            totalCount: 12,
            upfront: null,
        });
        await deliver(`fake_sub_${renew.checkout.id}`, "authenticated");
        const waiting = await sub(ctx.organizationId);
        expect(waiting).toMatchObject({
            plan: { key: "catalog.c" },
            providerSubscriptionId: ref,
            pendingFrom: termEnds,
            cancelAtPeriodEnd: false,
        });
        expect(
            await prisma.job.count({
                where: { type: BILLING_PROVIDER_CANCEL_TYPE },
            }),
        ).toBe(0);
        expect(
            (
                await prisma.billingCheckout.findUniqueOrThrow({
                    where: { id: renew.checkout.id },
                })
            ).status,
        ).toBe("SCHEDULED");
    });

    it("with time left on the term, the same plan is nothing to do", async () => {
        await install();
        const ctx = await business();
        const r = await checkout.changePlan(ctx, { plan: "c", cycle: "month" });
        if (r.kind === "TO_FREE") throw new Error("expected a checkout");
        await deliver(`fake_sub_${r.checkout.id}`, "activated", {
            currentPeriodEnd: new Date(Date.now() + 30 * DAY),
        });
        const q = await checkout.quote(ctx, { plan: "c", cycle: "month" });
        expect(q.kind).toBe("NONE");
        expect((await checkout.current(ctx)).term?.renewOpen).toBe(false);
    });
});
