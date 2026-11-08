/**
 * A Global business buys Saroh's plan in US dollars (stage 9, U5 and U11's
 * Global half) on the fake provider, against a real Postgres: behind
 * `SAROH_BILLING_GLOBAL` and a live Global catalogue; one month paid at a
 * time on a USD order (Razorpay can't renew USD on autopay, U1), card only;
 * the next month falls due with 7 days to pay, then Free. Every price here
 * is made up (`test/fixtures/pricing-catalog.ts`).
 */
import { createHmac } from "node:crypto";

import { prisma, writeCatalogueVersion } from "@saroh/database";
import type { Catalog } from "@saroh/pricing-catalog";
import { planRows } from "@saroh/pricing-catalog";

import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import type { OrganizationContext } from "../../common/types/organization-context";
import { BillingWebhookService } from "./billing-webhook.service";
import { CheckoutService } from "./checkout.service";
import { MovesApplyHandler } from "./moves-apply.handler";
import { closeOverduePayments, PAYMENT_DUE_DAYS } from "./payment-due";
import { PlansService } from "./plans.service";
import {
    FakeBillingProvider,
    FakeBillingProviderFactory,
} from "./providers/fake.provider";
import { SAROH_BILLS_ONLY_IN_INDIA } from "./saroh-bills";

const SECRET = "whsec_fake_platform_secret";
const DAY = 24 * 60 * 60 * 1000;
const tag = `${process.pid}-${Date.now()}`;
const quiet = { error: () => undefined, log: () => undefined };

let fake: FakeBillingProvider;
let checkout: CheckoutService;
let webhooks: BillingWebhookService;
const sweep = new MovesApplyHandler();

/** A made-up catalogue in dollars with no tax, monthly only. */
const usd = (): Catalog =>
    fakeCatalog((c) => {
        c.currency = "USD";
        c.tax = "none";
        c.yearly.on = false;
        for (const p of c.plans) delete p.trial;
    });

async function wipe() {
    await prisma.job.deleteMany({});
    await prisma.billingWebhookEvent.deleteMany({});
    await prisma.sarohInvoice.deleteMany({});
    await prisma.billingCheckout.deleteMany({});
    await prisma.subscription.deleteMany({});
    await prisma.pricingProviderPlan.deleteMany({});
    await prisma.pricingCatalogVersion.deleteMany({});
    await prisma.plan.deleteMany({});
    await prisma.featureFlag.deleteMany({
        where: { key: "SAROH_BILLING_GLOBAL" },
    });
}

beforeEach(async () => {
    fake = new FakeBillingProvider("RAZORPAY", SECRET);
    fake.publicKeyValue = "rzp_test_fake";
    const factory = new FakeBillingProviderFactory(fake);
    checkout = new CheckoutService(new PlansService(), factory);
    webhooks = new BillingWebhookService(factory);
    await wipe();
});

async function flag(on: boolean) {
    await prisma.featureFlag.upsert({
        where: { key: "SAROH_BILLING_GLOBAL" },
        update: { enabledByDefault: on },
        create: { key: "SAROH_BILLING_GLOBAL", enabledByDefault: on },
    });
}

async function install(
    version: number,
    edition: "INDIA" | "GLOBAL",
    c: Catalog,
) {
    const rows = planRows(c, version);
    const { planIds } = await writeCatalogueVersion(prisma, {
        version,
        edition,
        catalog: c,
        goLiveAt: new Date(Date.now() - DAY),
        policy: "keep",
        planRows: rows,
    });
    const paid = planIds.filter((_, i) => rows[i]!.priceCents > 0);
    await prisma.pricingProviderPlan.createMany({
        data: paid.map((planId) => ({
            planId,
            provider: "RAZORPAY",
            status: "SYNCED",
            providerPlanId: `plan_${planId}`,
        })),
    });
}

let seq = 0;
/** A Global business on Global's Free row, billed to a UK profile. */
async function globalBusiness(): Promise<OrganizationContext> {
    seq += 1;
    const owner = await prisma.user.create({
        data: { email: `cg-${seq}-${tag}@example.com`, name: "Owner" },
    });
    const profile = await prisma.billingProfile.create({
        data: {
            ownerUserId: owner.id,
            legalName: "Rye Bakes Ltd",
            billingEmail: `billing-${seq}@example.com`,
            country: "GB",
            addressLine1: "10 Downing Street",
            city: "London",
            postalCode: "SW1A 1AA",
            phone: "+442071234567",
            provider: "RAZORPAY",
        },
    });
    const org = await prisma.organization.create({
        data: {
            name: `Global ${seq}`,
            slug: `cg-${seq}-${tag}`,
            edition: "GLOBAL",
            currency: "GBP",
            billingProfileId: profile.id,
        },
    });
    const free = await prisma.plan.findFirst({
        where: { key: "catalog.free", currency: "USD", interval: "month" },
    });
    if (free) {
        await prisma.subscription.create({
            data: {
                organizationId: org.id,
                planId: free.id,
                status: "ACTIVE",
                billingCycle: "month",
            },
        });
    }
    return {
        organizationId: org.id,
        userId: owner.id,
        role: "OWNER",
        edition: "GLOBAL",
    } as OrganizationContext;
}

let evt = 0;
async function paid(order: string, amount: number, over: object = {}) {
    evt += 1;
    const raw = Buffer.from(
        JSON.stringify({
            providerEventId: `evt_${evt}_${tag}`,
            type: "order.paid",
            providerSubscriptionId: order,
            status: "ACTIVE",
            phase: "charged",
            eventAt: new Date().toISOString(),
            providerPaymentId: `pay_${evt}_${tag}`,
            paymentAmountPaise: amount,
            paymentCurrency: "USD",
            paymentInternational: true,
            paymentBaseAmount: amount * 84,
            paymentBaseCurrency: "INR",
            ...over,
        }),
    );
    const signature = createHmac("sha256", SECRET).update(raw).digest("hex");
    return webhooks.handle("razorpay", raw, {
        "x-fake-signature": signature,
    });
}

const conflict = {
    status: 409,
    response: { message: SAROH_BILLS_ONLY_IN_INDIA },
};

describe("a Global business buys a plan in US dollars (DB, stage 9 U5)", () => {
    it("is refused with the switch off, as before", async () => {
        await install(1, "GLOBAL", usd());
        await flag(false);
        const ctx = await globalBusiness();
        await expect(
            checkout.quote(ctx, { plan: "b", cycle: "month" }),
        ).rejects.toMatchObject(conflict);
        await expect(
            checkout.changePlan(ctx, { plan: "b", cycle: "month" }),
        ).rejects.toMatchObject(conflict);
    });

    it("is refused with the switch on but no paid Global catalogue live", async () => {
        await install(
            1,
            "GLOBAL",
            fakeCatalog((c) => {
                c.currency = "USD";
                c.tax = "none";
                c.yearly.on = false;
                c.plans = c.plans.filter((p) => p.pricePaise === 0);
                for (const m of c.modules) {
                    m.cells = { free: m.cells.free! };
                }
                c.addons = [];
            }),
        );
        await flag(true);
        const ctx = await globalBusiness();
        await expect(
            checkout.changePlan(ctx, { plan: "b", cycle: "month" }),
        ).rejects.toMatchObject(conflict);
    });

    it("quotes in dollars with no tax, paid one month at a time, and charges a USD order by card", async () => {
        const catalog = usd();
        await install(1, "GLOBAL", catalog);
        await flag(true);
        const ctx = await globalBusiness();
        const price = catalog.plans.find((p) => p.id === "b")!.pricePaise;

        const quote = await checkout.quote(ctx, { plan: "b", cycle: "month" });
        expect(quote).toMatchObject({
            kind: "NEW",
            payment: "ONE_TIME",
            gstPaise: 0,
            totalPaise: price,
        });

        const r = await checkout.changePlan(ctx, { plan: "b", cycle: "month" });
        if (r.kind === "TO_FREE") throw new Error("expected a checkout");
        expect(r.handoff).toMatchObject({
            currency: "USD",
            cardOnly: true,
            amountPaise: price,
        });
        const order = fake.orders.created.at(-1);
        expect(order).toMatchObject({ currency: "USD", amountPaise: price });

        await paid(r.handoff!.orderId!, price);
        const sub = await prisma.subscription.findUniqueOrThrow({
            where: { organizationId: ctx.organizationId },
            include: { plan: true },
        });
        expect(sub.status).toBe("ACTIVE");
        expect(sub.plan.currency).toBe("USD");
        expect(sub.currentPeriodEnd!.getTime()).toBeGreaterThan(
            Date.now() + 27 * DAY,
        );
    });

    it("makes the next month due at the month's end, then Free after 7 days unpaid", async () => {
        const catalog = usd();
        await install(1, "GLOBAL", catalog);
        await flag(true);
        const ctx = await globalBusiness();
        const price = catalog.plans.find((p) => p.id === "b")!.pricePaise;
        const r = await checkout.changePlan(ctx, { plan: "b", cycle: "month" });
        if (r.kind === "TO_FREE") throw new Error("expected a checkout");
        await paid(r.handoff!.orderId!, price);

        const end = new Date(Date.now() - DAY);
        await prisma.subscription.update({
            where: { organizationId: ctx.organizationId },
            data: { currentPeriodEnd: end },
        });
        expect(await sweep.endPaidYears(new Date())).toBe(1);
        const due = await prisma.subscription.findUniqueOrThrow({
            where: { organizationId: ctx.organizationId },
            include: { plan: true },
        });
        expect(due.status).toBe("PAST_DUE");
        expect(due.plan.key).toBe("catalog.b");
        expect(due.paymentDueUntil!.getTime()).toBe(
            end.getTime() + PAYMENT_DUE_DAYS * DAY,
        );
        const email = await prisma.job.findFirst({
            where: { type: "billing.email" },
            orderBy: { createdAt: "desc" },
        });
        expect(email?.payload).toMatchObject({
            kind: "PAYMENT_FAILED",
            monthDue: true,
        });

        // Pay now: another USD order for the month, which puts it back.
        const pay = await checkout.changePlan(ctx, {
            plan: "b",
            cycle: "month",
        });
        if (pay.kind === "TO_FREE") throw new Error("expected a checkout");
        expect(pay.handoff).toMatchObject({ currency: "USD", cardOnly: true });
        await paid(pay.handoff!.orderId!, price);
        const back = await prisma.subscription.findUniqueOrThrow({
            where: { organizationId: ctx.organizationId },
        });
        expect(back).toMatchObject({ status: "ACTIVE", paymentDueUntil: null });

        // Unpaid next time: Free once the 7 days pass.
        await prisma.subscription.update({
            where: { organizationId: ctx.organizationId },
            data: {
                status: "PAST_DUE",
                paymentDueUntil: new Date(Date.now() - 1000),
            },
        });
        expect(await closeOverduePayments(new Date(), quiet)).toBe(1);
        const gone = await prisma.subscription.findUniqueOrThrow({
            where: { organizationId: ctx.organizationId },
        });
        expect(gone.status).toBe("CANCELLED");
    });

    it("lets a payer move to Free with the switch turned off", async () => {
        const catalog = usd();
        await install(1, "GLOBAL", catalog);
        await flag(true);
        const ctx = await globalBusiness();
        const price = catalog.plans.find((p) => p.id === "b")!.pricePaise;
        const r = await checkout.changePlan(ctx, { plan: "b", cycle: "month" });
        if (r.kind === "TO_FREE") throw new Error("expected a checkout");
        await paid(r.handoff!.orderId!, price);
        await flag(false);
        const moved = await checkout.changePlan(ctx, {
            plan: "free",
            cycle: "month",
        });
        expect(moved.kind).toBe("TO_FREE");
        await expect(
            checkout.changePlan(ctx, { plan: "c", cycle: "month" }),
        ).rejects.toMatchObject(conflict);
    });

    it("never sells India's plan to a Global business", async () => {
        await install(1, "INDIA", fakeCatalog());
        await install(2, "GLOBAL", usd());
        await flag(true);
        const ctx = await globalBusiness();
        const quote = await checkout.quote(ctx, { plan: "b", cycle: "month" });
        const plan = await prisma.plan.findFirstOrThrow({
            where: { key: "catalog.b", version: 2 },
        });
        expect(quote.totalPaise).toBe(plan.priceCents);
        expect(plan.currency).toBe("USD");
    });
});
