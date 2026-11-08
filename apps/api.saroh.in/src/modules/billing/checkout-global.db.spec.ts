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
import { AddonsService } from "./addons.service";
import { BillingWebhookService } from "./billing-webhook.service";
import { CheckoutService } from "./checkout.service";
import { BILLING_REFUND_TYPE } from "./double-charge";
import { MovesApplyHandler } from "./moves-apply.handler";
import { closeOverduePayments, PAYMENT_DUE_DAYS } from "./payment-due";
import { PlansService } from "./plans.service";
import {
    FakeBillingProvider,
    FakeBillingProviderFactory,
} from "./providers/fake.provider";
import { SAROH_BILLS_ONLY_IN_INDIA } from "./saroh-bills";
import { SarohInvoicesService } from "./saroh-invoices.service";
import type { SarohSeller } from "./saroh-seller";

const SECRET = "whsec_fake_platform_secret";
const DAY = 24 * 60 * 60 * 1000;
const tag = `${process.pid}-${Date.now()}`;
const quiet = { error: () => undefined, log: () => undefined };

let fake: FakeBillingProvider;
let checkout: CheckoutService;
let webhooks: BillingWebhookService;
let seller: SarohSeller;

/** Made up, like every value here. */
const SELLER: SarohSeller = {
    name: "Saroh",
    legalName: "Example Labs Pvt Ltd",
    gstin: "29AAAAA0000A1ZY",
    state: "29",
    address: "1 Test Road, Testville",
    email: "billing@example.test",
    sac: "999999",
    prefix: "TST",
    exportPrefix: "TX",
    exportNote: "Made-up LUT note for a test",
};
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
    await prisma.billingAction.deleteMany({});
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
    seller = { ...SELLER };
    webhooks = new BillingWebhookService(
        factory,
        undefined,
        new SarohInvoicesService(seller),
    );
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

        // An export invoice (U6): dollars, no tax, its own series, the LUT
        // note, the buyer's country and the rupee base kept, not printed.
        const invoice = await prisma.sarohInvoice.findFirstOrThrow({
            where: { organizationId: ctx.organizationId },
        });
        expect(invoice).toMatchObject({
            currency: "USD",
            taxType: "EXPORT",
            taxPaise: 0,
            totalPaise: price,
            billToGstin: null,
            billToState: null,
            billToCountry: "GB",
            exportNote: "Made-up LUT note for a test",
            providerBaseAmount: price * 84,
            providerBaseCurrency: "INR",
        });
        expect(invoice.number).toMatch(/^TX\/\d{2}-\d{2}\/0001$/);
    });

    it("writes no invoice for a payment in another currency, or by an Indian card, and says so", async () => {
        const catalog = usd();
        await install(1, "GLOBAL", catalog);
        await flag(true);
        const price = catalog.plans.find((p) => p.id === "b")!.pricePaise;
        for (const [over, code] of [
            [{ paymentCurrency: "INR" }, "billing_payment_currency_mismatch"],
            [{ paymentInternational: false }, "billing_export_domestic_card"],
        ] as const) {
            const ctx = await globalBusiness();
            const r = await checkout.changePlan(ctx, {
                plan: "b",
                cycle: "month",
            });
            if (r.kind === "TO_FREE") throw new Error("expected a checkout");
            await paid(r.handoff!.orderId!, price, over);
            expect(
                await prisma.sarohInvoice.count({
                    where: { organizationId: ctx.organizationId },
                }),
            ).toBe(0);
            expect(
                await prisma.billingAction.count({
                    where: { organizationId: ctx.organizationId, code },
                }),
            ).toBe(1);
        }
    });

    it.each([
        ["prefix", { exportPrefix: null }],
        ["LUT note", { exportNote: null }],
    ] as const)(
        "issues no export invoice without its %s, and says so",
        async (_, unset) => {
            const catalog = usd();
            await install(1, "GLOBAL", catalog);
            await flag(true);
            Object.assign(seller, unset);
            const ctx = await globalBusiness();
            const price = catalog.plans.find((p) => p.id === "b")!.pricePaise;
            const r = await checkout.changePlan(ctx, {
                plan: "b",
                cycle: "month",
            });
            if (r.kind === "TO_FREE") throw new Error("expected a checkout");
            await paid(r.handoff!.orderId!, price);
            expect(
                await prisma.billingAction.count({
                    where: {
                        organizationId: ctx.organizationId,
                        code: "saroh_export_invoice_unset",
                    },
                }),
            ).toBe(1);
            expect(
                await prisma.sarohInvoice.count({
                    where: { organizationId: ctx.organizationId },
                }),
            ).toBe(0);
        },
    );

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

    it("charges a whole month for an add-on at purchase, then carries it on each month's order (owner, 8 Nov 2026)", async () => {
        const catalog = usd();
        await install(1, "GLOBAL", catalog);
        await flag(true);
        const ctx = await globalBusiness();
        const price = catalog.plans.find((p) => p.id === "b")!.pricePaise;
        const pack = catalog.addons.find((a) => a.id === "things-pack")!;
        const r = await checkout.changePlan(ctx, { plan: "b", cycle: "month" });
        if (r.kind === "TO_FREE") throw new Error("expected a checkout");
        await paid(r.handoff!.orderId!, price);

        // Bought mid-month: a whole month of both packs, paid now on a USD
        // order of its own, and held only once it's paid.
        const addons = new AddonsService(undefined, checkout);
        const month = 2 * pack.pricePaise;
        const view = await addons.set(ctx, pack.id, 2);
        expect(view.canBuy).toBe(true);
        expect(view.addons.find((a) => a.id === pack.id)).toMatchObject({
            quantity: 0,
            gstPaise: 0,
            totalPaise: pack.pricePaise,
        });
        expect(view.payment?.handoff).toMatchObject({
            currency: "USD",
            cardOnly: true,
            amountPaise: month,
        });
        expect(fake.orders.created.at(-1)).toMatchObject({
            currency: "USD",
            amountPaise: month,
        });
        const addonOrder = view.payment!.providerOrderId;
        await paid(addonOrder, month);
        await paid(addonOrder, month); // a second event adds nothing more
        const held = await prisma.subscriptionAddon.findMany({
            where: { organizationId: ctx.organizationId },
        });
        expect(held).toEqual([
            expect.objectContaining({ addonId: pack.id, quantity: 2 }),
        ]);
        const bought = await prisma.sarohInvoice.findFirstOrThrow({
            where: { providerSubscriptionId: addonOrder },
            include: { lines: true },
        });
        expect(bought).toMatchObject({
            source: "ADDON",
            taxType: "EXPORT",
            currency: "USD",
            totalPaise: month,
            taxPaise: 0,
        });
        expect(bought.lines).toHaveLength(1);

        // The month ends: Pay now is the plan and both packs, a whole month.
        await prisma.subscription.update({
            where: { organizationId: ctx.organizationId },
            data: { currentPeriodEnd: new Date(Date.now() - DAY) },
        });
        expect(await sweep.endPaidYears(new Date())).toBe(1);
        const total = price + 2 * pack.pricePaise;
        const quote = await checkout.quote(ctx, { plan: "b", cycle: "month" });
        expect(quote).toMatchObject({
            payNowTotalPaise: total,
            addonsNowPaise: 2 * pack.pricePaise,
            addonsEnding: [],
        });
        const pay = await checkout.changePlan(ctx, {
            plan: "b",
            cycle: "month",
        });
        if (pay.kind === "TO_FREE") throw new Error("expected a checkout");
        expect(pay.handoff).toMatchObject({ amountPaise: total });
        expect(fake.orders.created.at(-1)).toMatchObject({
            currency: "USD",
            amountPaise: total,
        });
        // Read again while open, the window asks the same.
        const open = await checkout.current(ctx);
        expect(open.open?.handoff).toMatchObject({ amountPaise: total });

        await paid(pay.handoff!.orderId!, total);
        const back = await prisma.subscription.findUniqueOrThrow({
            where: { organizationId: ctx.organizationId },
            include: { addons: true },
        });
        expect(back.status).toBe("ACTIVE");
        expect(back.addons).toEqual([
            expect.objectContaining({ addonId: pack.id, quantity: 2 }),
        ]);
        const invoice = await prisma.sarohInvoice.findFirstOrThrow({
            where: {
                organizationId: ctx.organizationId,
                providerSubscriptionId: pay.handoff!.orderId!,
            },
            include: { lines: true },
        });
        expect(invoice).toMatchObject({ totalPaise: total, taxPaise: 0 });
        expect(invoice.lines).toHaveLength(2);
        expect(
            await prisma.billingAction.count({
                where: {
                    organizationId: ctx.organizationId,
                    code: "saroh_invoice_amount_mismatch",
                },
            }),
        ).toBe(0);
        expect(
            await prisma.subscriptionAddonCharge.findMany({
                select: { status: true },
            }),
        ).toEqual([{ status: "INVOICED" }, { status: "INVOICED" }]);

        // Removed before the next payment: off the next order, no refund.
        await addons.set(ctx, pack.id, 0);
        await prisma.subscription.update({
            where: { organizationId: ctx.organizationId },
            data: { currentPeriodEnd: new Date(Date.now() - DAY) },
        });
        expect(await sweep.endPaidYears(new Date())).toBe(1);
        expect(
            await checkout.quote(ctx, { plan: "b", cycle: "month" }),
        ).toMatchObject({ payNowTotalPaise: price, addonsNowPaise: 0 });
    });

    it("drops an add-on's order that isn't paid, and gives back one paid after its plan ended", async () => {
        const catalog = usd();
        await install(1, "GLOBAL", catalog);
        await flag(true);
        const ctx = await globalBusiness();
        const price = catalog.plans.find((p) => p.id === "b")!.pricePaise;
        const pack = catalog.addons.find((a) => a.id === "things-pack")!;
        const r = await checkout.changePlan(ctx, { plan: "b", cycle: "month" });
        if (r.kind === "TO_FREE") throw new Error("expected a checkout");
        await paid(r.handoff!.orderId!, price);
        const addons = new AddonsService(undefined, checkout);

        const lapsed = (await addons.set(ctx, pack.id, 1)).payment!;
        await paid(lapsed.providerOrderId, pack.pricePaise, {
            status: "CANCELLED",
            phase: "cancelled",
        });
        expect(
            await prisma.subscriptionAddonCharge.findFirst({
                where: { providerSubscriptionId: lapsed.providerOrderId },
                select: { status: true },
            }),
        ).toEqual({ status: "DROPPED" });

        // Bought, then the business leaves for Free before paying it.
        const late = (await addons.set(ctx, pack.id, 1)).payment!;
        await prisma.subscription.update({
            where: { organizationId: ctx.organizationId },
            data: { currentPeriodEnd: new Date(Date.now() - DAY) },
        });
        await sweep.endPaidYears(new Date());
        await checkout.changePlan(ctx, { plan: "free", cycle: "month" });
        await paid(late.providerOrderId, pack.pricePaise);
        expect(
            await prisma.subscriptionAddon.count({
                where: { organizationId: ctx.organizationId },
            }),
        ).toBe(0);
        expect(
            await prisma.sarohInvoice.count({
                where: { providerSubscriptionId: late.providerOrderId },
            }),
        ).toBe(0);
        // Given back in full, as a second payment is (DEC-164).
        const refund = await prisma.job.findFirst({
            where: { type: BILLING_REFUND_TYPE },
            orderBy: { createdAt: "desc" },
        });
        expect(JSON.stringify(refund?.payload)).toContain(late.providerOrderId);
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
