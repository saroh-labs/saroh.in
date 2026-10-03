/**
 * Trials, yearly, coupons and add-ons against a real Postgres (pricing
 * catalogue U16), through the fake billing provider — no Razorpay call is
 * ever made.
 *
 * - A trial: on the plan once authorised, nothing charged, TRIALING to its
 *   end; the first charge makes it ACTIVE and is invoiced as a new plan's
 *   first; a failed one lands the business on Free. One trial per business.
 * - Coupons: one use per business, within `maxRedemptions`, before
 *   `expiresAt`; off each of its months on monthly and once on yearly; the
 *   redemption written with the first discounted charge, never at checkout;
 *   rate-limited per business.
 * - Add-ons: limits rise at once; what is owed goes on the provider
 *   subscription's next charge and onto that charge's invoice.
 *
 * Every catalogue and coupon here is made up (`fakeCatalog`: Plan A/B/C,
 * 111, 222, 333). Rows satisfy the migrations' CHECKs, so it holds in RLS
 * mode. Runs in the integration project (TEST_DATABASE_URL).
 */
import { createHmac } from "node:crypto";

import type { Job } from "@saroh/database";
import {
    prisma,
    startOnFreePlan,
    writeCatalogueVersion,
} from "@saroh/database";
import type { Catalog } from "@saroh/pricing-catalog";
import { gstPaise, planRows, withGstPaise } from "@saroh/pricing-catalog";

import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import type { OrganizationContext } from "../../common/types/organization-context";
import { AddonsSyncHandler, BILLING_ADDONS_SYNC_TYPE } from "./addon-charges";
import { AddonsService } from "./addons.service";
import { BILLING_EMAIL_TYPE } from "./billing-email.job";
import { BillingWebhookService } from "./billing-webhook.service";
import { CatalogueAccessService } from "./catalogue-access.service";
import { CheckoutService, COUPON_TRIES_PER_ORG } from "./checkout.service";
import { MovesApplyHandler } from "./moves-apply.handler";
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
const OFFER_ID = "offer_ABCDEFGHIJKLMN";
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

/** The made-up catalogue, with a trial on Plan B and Bills off it. */
const OFFERS = (edit?: (c: Catalog) => void) =>
    fakeCatalog((c) => {
        c.plans[1]!.trial = { on: true, days: 9 };
        c.modules[1]!.cells.b = { inc: false, off: "locked" };
        edit?.(c);
    });

let fake: FakeBillingProvider;
let checkout: CheckoutService;
let webhooks: BillingWebhookService;
let addons: AddonsService;
let sync: AddonsSyncHandler;
const sweep = new MovesApplyHandler();
const access = new CatalogueAccessService();

beforeEach(async () => {
    fake = new FakeBillingProvider("RAZORPAY", SECRET);
    const factory = new FakeBillingProviderFactory(fake);
    checkout = new CheckoutService(new PlansService(), factory);
    webhooks = new BillingWebhookService(
        factory,
        undefined,
        new SarohInvoicesService(SELLER),
    );
    addons = new AddonsService();
    sync = new AddonsSyncHandler(factory);
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

async function install(catalog: Catalog = OFFERS()) {
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
        data: { name: `Offers ${seq}`, slug: `offers-${seq}-${tag}` },
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
    over: { currentPeriodEnd?: Date | null; now?: Date } = {},
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
            type: `subscription.${phase}`,
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

async function coupon(
    code: string,
    over: Partial<{
        discountPaise: number;
        months: number;
        planIds: string[];
        active: boolean;
        maxRedemptions: number;
        expiresAt: Date | null;
        razorpayOfferId: string | null;
    }> = {},
) {
    return prisma.pricingCoupon.create({
        data: {
            code,
            discountPaise: 111,
            months: 2,
            planIds: ["b", "c"],
            maxRedemptions: 5,
            // A made-up Razorpay Offer: the fake, like Razorpay, refuses a
            // coupon without one.
            razorpayOfferId: OFFER_ID,
            ...over,
        },
    });
}

/** Run every waiting add-on send, as the worker would. */
async function runSync() {
    const jobs = await prisma.job.findMany({
        where: { type: BILLING_ADDONS_SYNC_TYPE, status: "PENDING" },
    });
    for (const j of jobs) {
        await sync.handle(j as Job);
        await prisma.job.update({
            where: { id: j.id },
            data: { status: "COMPLETED" },
        });
    }
}

/** Free → `plan` monthly through a paid NEW checkout (Plan C has no trial). */
async function onPaidPlan(ctx: OrganizationContext, plan = "c") {
    const r = await checkout.changePlan(ctx, { plan, cycle: "month" });
    if (r.kind === "TO_FREE") throw new Error("expected a checkout");
    const end = new Date(Date.now() + 20 * DAY);
    await deliver(`fake_sub_${r.checkout.id}`, "activated", {
        currentPeriodEnd: end,
    });
    return { providerSub: `fake_sub_${r.checkout.id}`, periodEnd: end };
}

describe("trials", () => {
    it("a plan with a trial: authorised, on the plan and TRIALING, nothing charged; the trial's end charges it and it is ACTIVE", async () => {
        await install();
        const ctx = await business();
        const b = await row("b");

        const q = await checkout.quote(ctx, { plan: "b", cycle: "month" });
        expect(q).toMatchObject({ kind: "TRIAL", chargeNowPaise: 0 });
        const r = await checkout.changePlan(ctx, { plan: "b", cycle: "month" });
        if (r.kind !== "TRIAL") throw new Error("expected a trial");
        const ends = new Date(r.quote.trialEndsAt!);
        expect(ends.getTime() - Date.now()).toBeGreaterThan(8 * DAY);
        expect(fake.createCalls[0]).toMatchObject({
            providerPlanId: `plan_${b.id}`,
            startAt: ends,
            upfront: null,
            discount: null,
        });

        const providerSub = `fake_sub_${r.checkout.id}`;
        await deliver(providerSub, "authenticated");
        expect(await sub(ctx.organizationId)).toMatchObject({
            planId: b.id,
            status: "TRIALING",
            currentPeriodEnd: ends,
            providerSubscriptionId: providerSub,
        });
        expect(await access.resolve(ctx.organizationId)).toMatchObject({
            planId: "b",
        });
        expect(await prisma.sarohInvoice.count()).toBe(0);
        // The trial-ending email waits for a few days before the end.
        const mail = await prisma.job.findFirstOrThrow({
            where: { type: BILLING_EMAIL_TYPE },
        });
        expect(mail.payload).toMatchObject({
            kind: "TRIAL_ENDING",
            endsAt: ends.toISOString(),
        });
        expect(mail.runAt.getTime()).toBeLessThan(ends.getTime());

        // The trial's end: the first charge.
        const next = new Date(ends.getTime() + 30 * DAY);
        await deliver(providerSub, "charged", {
            currentPeriodEnd: next,
            now: ends,
        });
        expect(await sub(ctx.organizationId)).toMatchObject({
            status: "ACTIVE",
            currentPeriodEnd: next,
        });
        const invoice = await prisma.sarohInvoice.findFirstOrThrow({
            include: { lines: true },
        });
        expect(invoice).toMatchObject({
            source: "NEW",
            taxablePaise: b.priceCents,
        });
    });

    it("a failed charge at the trial's end lands the business on Free", async () => {
        await install();
        const ctx = await business();
        const r = await checkout.changePlan(ctx, { plan: "b", cycle: "month" });
        if (r.kind !== "TRIAL") throw new Error("expected a trial");
        const providerSub = `fake_sub_${r.checkout.id}`;
        await deliver(providerSub, "authenticated");
        await deliver(providerSub, "pending");
        expect((await sub(ctx.organizationId)).status).toBe("PAST_DUE");
        await deliver(providerSub, "halted");
        expect((await sub(ctx.organizationId)).status).toBe("CANCELLED");
        expect(await access.resolve(ctx.organizationId)).toMatchObject({
            source: "catalogue",
            planId: "free",
        });
        expect(await prisma.sarohInvoice.count()).toBe(0);
    });

    it("one trial per business: after a trial, the same plan is paid from the start", async () => {
        await install();
        const ctx = await business();
        const r = await checkout.changePlan(ctx, { plan: "b", cycle: "month" });
        if (r.kind !== "TRIAL") throw new Error("expected a trial");
        await deliver(`fake_sub_${r.checkout.id}`, "authenticated");
        // Back to Free during the trial: at once, nothing was paid ahead.
        const free = await checkout.changePlan(ctx, {
            plan: "free",
            cycle: "month",
        });
        expect(free.kind).toBe("TO_FREE");
        expect((await sub(ctx.organizationId)).plan.key).toBe("catalog.free");

        const again = await checkout.quote(ctx, { plan: "b", cycle: "month" });
        expect(again.kind).toBe("NEW");
    });

    it("another plan during a trial keeps the trial's end", async () => {
        await install();
        const ctx = await business();
        const r = await checkout.changePlan(ctx, { plan: "b", cycle: "month" });
        if (r.kind !== "TRIAL") throw new Error("expected a trial");
        await deliver(`fake_sub_${r.checkout.id}`, "authenticated");
        const ends = (await sub(ctx.organizationId)).currentPeriodEnd!;

        const c = await checkout.changePlan(ctx, { plan: "c", cycle: "month" });
        expect(c).toMatchObject({
            kind: "TRIAL",
            quote: { chargeNowPaise: 0, trialEndsAt: ends.toISOString() },
        });
        if (c.kind === "TO_FREE") throw new Error("unreachable");
        await deliver(`fake_sub_${c.checkout.id}`, "authenticated");
        expect(await sub(ctx.organizationId)).toMatchObject({
            status: "TRIALING",
            plan: { key: "catalog.c" },
            currentPeriodEnd: ends,
        });
    });
});

describe("yearly", () => {
    it("a yearly checkout bills the plan's yearly row on its yearly provider plan", async () => {
        await install();
        const ctx = await business();
        const cYear = await row("c", "year");
        const r = await checkout.changePlan(ctx, { plan: "c", cycle: "year" });
        expect(r).toMatchObject({
            kind: "NEW",
            quote: {
                cycle: "year",
                pricePaise: cYear.priceCents,
                totalPaise: withGstPaise(cYear.priceCents),
            },
        });
        expect(fake.createCalls[0]).toMatchObject({
            providerPlanId: `plan_${cYear.id}`,
            interval: "year",
        });
    });
});

describe("coupons", () => {
    it("monthly: off each of its months, redeemed with the first paid charge, invoiced with the discount", async () => {
        await install();
        const ctx = await business();
        const made = await coupon("TEST-OFF", { months: 2 });
        const c = await row("c");

        const q = await checkout.quote(ctx, {
            plan: "c",
            cycle: "month",
            coupon: "test-off",
        });
        expect(q).toMatchObject({
            coupon: { code: "TEST-OFF", discountPaise: 111, charges: 2 },
            firstChargePaise: c.priceCents - 111,
            firstChargeTotalPaise: withGstPaise(c.priceCents - 111),
        });
        const r = await checkout.changePlan(ctx, {
            plan: "c",
            cycle: "month",
            coupon: "TEST-OFF",
        });
        if (r.kind === "TO_FREE") throw new Error("unreachable");
        expect(fake.createCalls[0]?.discount).toEqual({
            code: "TEST-OFF",
            amountPaise:
                withGstPaise(c.priceCents) - withGstPaise(c.priceCents - 111),
            charges: 2,
            razorpayOfferId: OFFER_ID,
        });
        // Not redeemed at checkout.
        expect(await prisma.pricingCouponRedemption.count()).toBe(0);

        const providerSub = `fake_sub_${r.checkout.id}`;
        const end1 = new Date(Date.now() + 30 * DAY);
        await deliver(providerSub, "activated", { currentPeriodEnd: end1 });
        expect(
            await prisma.pricingCouponRedemption.findFirstOrThrow(),
        ).toMatchObject({
            couponId: made.id,
            organizationId: ctx.organizationId,
            discountPaise: 222,
        });

        const end2 = new Date(end1.getTime() + 30 * DAY);
        const end3 = new Date(end2.getTime() + 30 * DAY);
        await deliver(providerSub, "charged", { currentPeriodEnd: end2 });
        await deliver(providerSub, "charged", { currentPeriodEnd: end3 });
        const invoices = await prisma.sarohInvoice.findMany({
            orderBy: { issuedAt: "asc" },
            include: { lines: true },
        });
        expect(invoices.map((i) => [i.source, i.discountPaise])).toEqual([
            ["NEW", 111],
            ["RENEWAL", 111],
            ["RENEWAL", 0],
        ]);
        expect(invoices[0]).toMatchObject({
            taxablePaise: c.priceCents - 111,
            taxPaise: gstPaise(c.priceCents - 111),
        });
        // Still one redemption.
        expect(await prisma.pricingCouponRedemption.count()).toBe(1);
    });

    it("yearly: the months' worth once, off the first yearly charge", async () => {
        await install();
        const ctx = await business();
        await coupon("YEAR-OFF", { months: 3 });
        const r = await checkout.changePlan(ctx, {
            plan: "c",
            cycle: "year",
            coupon: "YEAR-OFF",
        });
        expect(r.quote.coupon).toEqual({
            code: "YEAR-OFF",
            discountPaise: 333,
            charges: 1,
        });
        expect(fake.createCalls[0]?.discount?.charges).toBe(1);
    });

    it("a trial's coupon is redeemed with the trial's first charge, not before", async () => {
        await install();
        const ctx = await business();
        await coupon("TRIAL-OFF", { months: 1 });
        const r = await checkout.changePlan(ctx, {
            plan: "b",
            cycle: "month",
            coupon: "TRIAL-OFF",
        });
        if (r.kind !== "TRIAL") throw new Error("expected a trial");
        const providerSub = `fake_sub_${r.checkout.id}`;
        await deliver(providerSub, "authenticated");
        expect(await prisma.pricingCouponRedemption.count()).toBe(0);
        const ends = (await sub(ctx.organizationId)).currentPeriodEnd!;
        await deliver(providerSub, "charged", {
            currentPeriodEnd: new Date(ends.getTime() + 30 * DAY),
            now: ends,
        });
        expect(await prisma.pricingCouponRedemption.count()).toBe(1);
        expect(
            (await prisma.sarohInvoice.findFirstOrThrow()).discountPaise,
        ).toBe(111);
    });

    it("refuses a coupon used by this business, paused, expired, used up, unknown, for another plan, or on a change that doesn't start a plan", async () => {
        await install();
        const ctx = await business();
        const other = await business();
        await coupon("PAUSED", { active: false });
        await coupon("GONE-BY", { expiresAt: new Date(Date.now() - 1000) });
        await coupon("ONLY-B", { planIds: ["b"] });
        const once = await coupon("ONE-USE", { maxRedemptions: 1 });
        await coupon("MINE");

        const tryIt = (code: string, plan = "c", who = ctx) =>
            checkout.quote(who, { plan, cycle: "month", coupon: code });
        await expect(tryIt("NOPE")).rejects.toMatchObject({ status: 400 });
        await expect(tryIt("PAUSED")).rejects.toMatchObject({
            message: "Coupon PAUSED isn't available now.",
        });
        await expect(tryIt("GONE-BY")).rejects.toMatchObject({
            message: "Coupon GONE-BY has expired.",
        });
        await expect(tryIt("ONLY-B")).rejects.toMatchObject({
            message: "Coupon ONLY-B doesn't apply to Plan C.",
        });

        // Used up: another business's open checkout holds the last use.
        await checkout.changePlan(other, {
            plan: "c",
            cycle: "month",
            coupon: "ONE-USE",
        });
        await expect(tryIt("ONE-USE")).rejects.toMatchObject({
            message: "Coupon ONE-USE has been used up.",
        });
        // And once redeemed, by anyone.
        await prisma.pricingCouponRedemption.create({
            data: {
                couponId: once.id,
                organizationId: other.organizationId,
                discountPaise: 111,
            },
        });
        await expect(tryIt("ONE-USE")).rejects.toMatchObject({
            message: "Coupon ONE-USE has been used up.",
        });

        // Used by this business already.
        await onPaidPlan(ctx, "c");
        const mine = await prisma.pricingCoupon.findUniqueOrThrow({
            where: { code: "MINE" },
        });
        await prisma.pricingCouponRedemption.create({
            data: {
                couponId: mine.id,
                organizationId: ctx.organizationId,
                discountPaise: 111,
            },
        });
        await prisma.subscription.update({
            where: { organizationId: ctx.organizationId },
            data: { status: "CANCELLED" },
        });
        await expect(tryIt("MINE")).rejects.toMatchObject({
            message: "You've used coupon MINE already.",
        });

        // On a change that doesn't start a plan (a cheaper plan, scheduled).
        const third = await business();
        await onPaidPlan(third, "c");
        await coupon("LATER-OFF");
        await expect(tryIt("LATER-OFF", "b", third)).rejects.toMatchObject({
            status: 400,
            message:
                "A coupon can be used when you start a paid plan, not on this change.",
        });
    });

    it("an abandoned checkout with a coupon redeems nothing, and the use is free again", async () => {
        await install();
        const ctx = await business();
        const other = await business();
        await coupon("LAST-ONE", { maxRedemptions: 1 });
        await checkout.changePlan(ctx, {
            plan: "c",
            cycle: "month",
            coupon: "LAST-ONE",
        });
        expect((await sweep.sweep(new Date(Date.now() + 2 * DAY))).lapsed).toBe(
            1,
        );
        expect(await prisma.pricingCouponRedemption.count()).toBe(0);
        await expect(
            checkout.quote(other, {
                plan: "c",
                cycle: "month",
                coupon: "LAST-ONE",
            }),
        ).resolves.toMatchObject({ coupon: { code: "LAST-ONE" } });
    });

    it("a provider that can't take a coupon off refuses the checkout, never charging the full amount", async () => {
        await install();
        const ctx = await business();
        await coupon("NO-PROVIDER");
        fake.failNextCreate = new BillingProviderError("REFUSED", "no offers");
        await expect(
            checkout.changePlan(ctx, {
                plan: "c",
                cycle: "month",
                coupon: "NO-PROVIDER",
            }),
        ).rejects.toMatchObject({ status: 409 });
        expect(await prisma.billingCheckout.count()).toBe(0);
    });

    it("a coupon without a Razorpay offer is refused with a 409 on the coupon, recording nothing", async () => {
        await install();
        const ctx = await business();
        await coupon("NO-OFFER", { razorpayOfferId: null });
        await expect(
            checkout.changePlan(ctx, {
                plan: "c",
                cycle: "month",
                coupon: "NO-OFFER",
            }),
        ).rejects.toMatchObject({
            status: 409,
            response: { details: { field: "coupon" } },
        });
        expect(fake.createCalls).toHaveLength(0);
        expect(await prisma.billingCheckout.count()).toBe(0);
        expect(await prisma.pricingCouponRedemption.count()).toBe(0);
    });

    it("a coupon with a Razorpay offer reaches the provider as its offer, and Saroh's own accounting stands", async () => {
        await install();
        const ctx = await business();
        const made = await coupon("WITH-OFFER", { months: 1 });
        const r = await checkout.changePlan(ctx, {
            plan: "c",
            cycle: "month",
            coupon: "WITH-OFFER",
        });
        if (r.kind === "TO_FREE") throw new Error("unreachable");
        expect(fake.createCalls).toHaveLength(1);
        expect(fake.createCalls[0]?.discount?.razorpayOfferId).toBe(OFFER_ID);
        expect(
            await prisma.billingCheckout.findUniqueOrThrow({
                where: { id: r.checkout.id },
            }),
        ).toMatchObject({
            couponId: made.id,
            discountPaise: 111,
            discountCharges: 1,
        });
        await deliver(`fake_sub_${r.checkout.id}`, "activated", {
            currentPeriodEnd: new Date(Date.now() + 30 * DAY),
        });
        expect(
            await prisma.pricingCouponRedemption.findFirstOrThrow(),
        ).toMatchObject({ couponId: made.id, discountPaise: 111 });
        expect(
            (await prisma.sarohInvoice.findFirstOrThrow()).discountPaise,
        ).toBe(111);
    });

    it("rate-limits coupon checks per business", async () => {
        await install();
        const ctx = await business();
        await coupon("SPAM-ME", { active: false });
        const now = new Date();
        const statuses: number[] = [];
        for (let i = 0; i < COUPON_TRIES_PER_ORG + 10; i += 1) {
            const e = (await checkout
                .quote(
                    ctx,
                    { plan: "c", cycle: "month", coupon: "SPAM-ME" },
                    now,
                )
                .catch((x: unknown) => x)) as { status?: number };
            statuses.push(e.status ?? 200);
        }
        expect(statuses.slice(0, COUPON_TRIES_PER_ORG)).toEqual(
            Array(COUPON_TRIES_PER_ORG).fill(400),
        );
        expect(statuses.slice(COUPON_TRIES_PER_ORG)).toEqual(
            Array(10).fill(429),
        );
        // A quote without a coupon isn't counted.
        await expect(
            checkout.quote(ctx, { plan: "c", cycle: "month" }, now),
        ).resolves.toMatchObject({ kind: "NEW" });
    });
});

describe("add-ons", () => {
    it("buying raises the limit at once; what is owed goes on the next charge and onto its invoice", async () => {
        // Plan B without its trial, so it is paid from the start.
        await install(
            OFFERS((c) => {
                c.plans[1]!.trial = undefined;
            }),
        );
        const ctx = await business();
        const { providerSub, periodEnd } = await onPaidPlan(ctx, "b");
        const before = await access.resolve(ctx.organizationId);
        const cap = (a: typeof before) =>
            a.source === "catalogue"
                ? a.modules.find((m) => m.moduleId === "products")?.limit
                : null;
        expect(cap(before)).toBe(222);

        const view = await addons.set(ctx, "things-pack", 2);
        expect(view.addons.find((a) => a.id === "things-pack")).toMatchObject({
            quantity: 2,
            available: true,
        });
        expect(cap(await access.resolve(ctx.organizationId))).toBe(222 + 22);

        // What is left of this period, prorated, waiting for the provider.
        const owed = await prisma.subscriptionAddonCharge.findMany();
        expect(owed).toHaveLength(1);
        expect(owed[0]).toMatchObject({
            status: "QUEUED",
            chargeAt: periodEnd,
            providerSubscriptionId: providerSub,
        });
        expect(owed[0]!.unitPaise).toBeLessThanOrEqual(2 * 111);
        await runSync();
        expect(fake.charges.added).toEqual([
            expect.objectContaining({
                providerSubscriptionId: providerSub,
                reference: owed[0]!.id,
                amountPaise: withGstPaise(owed[0]!.unitPaise),
            }),
        ]);

        // The renewal takes it: one invoice, the plan and the add-on.
        const next = new Date(periodEnd.getTime() + 30 * DAY);
        await deliver(providerSub, "charged", { currentPeriodEnd: next });
        const invoice = await prisma.sarohInvoice.findFirstOrThrow({
            where: { source: "RENEWAL" },
            include: { lines: { orderBy: { position: "asc" } } },
        });
        expect(invoice.lines.map((l) => l.taxablePaise)).toEqual([
            (await row("b")).priceCents,
            owed[0]!.unitPaise,
        ]);
        const rows = await prisma.subscriptionAddonCharge.findMany({
            orderBy: { createdAt: "asc" },
        });
        expect(rows.map((r) => r.status)).toEqual(["INVOICED", "QUEUED"]);
        // The period just begun: two packs, the whole period, owed at its end.
        expect(rows[1]).toMatchObject({
            quantity: 2,
            unitPaise: 111,
            periodStart: periodEnd,
            periodEnd: next,
            chargeAt: next,
        });

        // Removing lowers the limit at once; the next period owes nothing.
        await addons.set(ctx, "things-pack", 0);
        expect(cap(await access.resolve(ctx.organizationId))).toBe(222);
        await runSync();
        const after = new Date(next.getTime() + 30 * DAY);
        await deliver(providerSub, "charged", { currentPeriodEnd: after });
        expect(
            await prisma.subscriptionAddonCharge.count({
                where: { periodStart: next },
            }),
        ).toBe(0);
    });

    it("a module add-on switches on a module the plan leaves out", async () => {
        await install();
        const ctx = await business();
        await onPaidPlan(ctx, "b");
        const bills = async () => {
            const a = await access.resolve(ctx.organizationId);
            return a.source === "catalogue"
                ? a.modules.find((m) => m.moduleId === "invoicing")?.state
                : null;
        };
        expect(await bills()).toBe("locked");
        await addons.set(ctx, "bills", 1);
        expect(await bills()).toBe("on");
        await expect(addons.set(ctx, "bills", 2)).rejects.toMatchObject({
            status: 400,
        });
    });

    it("refuses add-ons on Free and an add-on the plan can't take", async () => {
        await install();
        const ctx = await business();
        await expect(addons.set(ctx, "things-pack", 1)).rejects.toMatchObject({
            status: 409,
            message: "Add-ons come with a paid plan.",
        });
        const view = await addons.list(ctx);
        expect(view.canBuy).toBe(false);
        expect(view.addons.every((a) => !a.available)).toBe(true);

        await onPaidPlan(ctx, "c");
        await expect(addons.set(ctx, "things-pack", 1)).rejects.toMatchObject({
            status: 400,
            message: "Plan C has no cap on Things.",
        });
        await expect(addons.set(ctx, "nothing", 1)).rejects.toMatchObject({
            status: 404,
        });
    });

    it("a trial's add-ons owe nothing for the trial; a move to Free takes them away", async () => {
        await install();
        const ctx = await business();
        const r = await checkout.changePlan(ctx, { plan: "b", cycle: "month" });
        if (r.kind !== "TRIAL") throw new Error("expected a trial");
        const providerSub = `fake_sub_${r.checkout.id}`;
        await deliver(providerSub, "authenticated");
        await addons.set(ctx, "things-pack", 1);
        expect(await prisma.subscriptionAddonCharge.count()).toBe(0);

        const ends = (await sub(ctx.organizationId)).currentPeriodEnd!;
        const next = new Date(ends.getTime() + 30 * DAY);
        await deliver(providerSub, "charged", {
            currentPeriodEnd: next,
            now: ends,
        });
        // From the first paid period on, it is owed.
        expect(
            await prisma.subscriptionAddonCharge.findFirstOrThrow(),
        ).toMatchObject({ periodStart: ends, periodEnd: next, quantity: 1 });

        // Free at the period's end: the add-on goes with the move.
        await checkout.changePlan(ctx, { plan: "free", cycle: "month" });
        await deliver(providerSub, "cancelled", {
            now: new Date(next.getTime() + 1000),
        });
        expect(await sub(ctx.organizationId)).toMatchObject({
            plan: { key: "catalog.free" },
        });
        expect(await prisma.subscriptionAddon.count()).toBe(0);
        expect(
            (await prisma.subscriptionAddonCharge.findFirstOrThrow()).status,
        ).toBe("DROPPED");
    });
});
