/**
 * Saroh billing against a real Postgres (pricing catalogue U15): checkout,
 * plan changes, renewals and the webhook path that completes them, through
 * the fake billing provider (no Razorpay call is ever made).
 *
 * - Free → a paid plan: a checkout, completed by the provider's webhook.
 * - An upgrade mid-period: on the plan once authorised, the difference now.
 * - A cheaper plan and Free: at the period's end, applied by the sweep or
 *   the subscription's own ending.
 * - During the first month (DEC-159): a dearer plan today at its full
 *   price; a cheaper plan and Free at the month's end, never before.
 * - Failed renewals: PAST_DUE, then halted → Free.
 * - Webhooks: deduplicated by event id, and an older one never undoes a
 *   newer one (activated replayed after cancelled).
 * - Moves: never applied while held at the provider, nor at an amount the
 *   business hasn't authorised (OQ-6).
 *
 * Every catalogue here is made up (`fakeCatalog`: Plan A/B/C, 222, 333).
 * Rows satisfy the migration's CHECKs (a pending move has both columns, a
 * checkout's kind and start agree), so it holds in RLS mode. Runs in the
 * integration project (TEST_DATABASE_URL).
 */
import { createHmac } from "node:crypto";

import { ValidationPipe } from "@nestjs/common";
import {
    prisma,
    startOnFreePlan,
    writeCatalogueVersion,
} from "@saroh/database";
import type { Catalog } from "@saroh/pricing-catalog";
import { gstPaise, planRows, withGstPaise } from "@saroh/pricing-catalog";

import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import type { OrganizationContext } from "../../common/types/organization-context";
import { validationPipeOptions } from "../../common/validation";
import { BillingWebhookService } from "./billing-webhook.service";
import { CatalogueAccessService } from "./catalogue-access.service";
import { CheckoutService } from "./checkout.service";
import { ChangePlanDto } from "./dto";
import { MovesApplyHandler } from "./moves-apply.handler";
import { PlansService } from "./plans.service";
import { BILLING_PROVIDER_CANCEL_TYPE } from "./provider-cancel.job";
import type { BillingEventPhase } from "./providers/billing-provider.port";
import {
    FakeBillingProvider,
    FakeBillingProviderFactory,
} from "./providers/fake.provider";

const SECRET = "whsec_fake_platform_secret";
const DAY = 24 * 60 * 60 * 1000;
const tag = `${process.pid}-${Date.now()}`;

let fake: FakeBillingProvider;
let checkout: CheckoutService;
let webhooks: BillingWebhookService;
const sweep = new MovesApplyHandler();
const access = new CatalogueAccessService();

beforeEach(async () => {
    fake = new FakeBillingProvider("RAZORPAY", SECRET);
    const factory = new FakeBillingProviderFactory(fake);
    checkout = new CheckoutService(new PlansService(), factory);
    webhooks = new BillingWebhookService(factory);
    await wipe();
});

async function wipe() {
    await prisma.job.deleteMany({});
    await prisma.billingWebhookEvent.deleteMany({});
    await prisma.billingCheckout.deleteMany({});
    await prisma.subscription.deleteMany({});
    await prisma.pricingProviderPlan.deleteMany({});
    await prisma.pricingCatalogVersion.deleteMany({});
    await prisma.plan.deleteMany({});
}

/** A version with its paid rows at the provider (SYNCED) unless `held`. */
async function install(
    version: number,
    catalog: Catalog = fakeCatalog(),
    opts: { goLiveAt?: Date; held?: boolean } = {},
) {
    const rows = planRows(catalog, version);
    const { planIds } = await writeCatalogueVersion(prisma, {
        version,
        catalog,
        goLiveAt: opts.goLiveAt ?? new Date(Date.now() - DAY),
        policy: "keep",
        planRows: rows,
    });
    const paid = planIds.filter((_, i) => rows[i]!.priceCents > 0);
    await prisma.pricingProviderPlan.createMany({
        data: paid.map((planId) => ({
            planId,
            provider: "RAZORPAY",
            status: opts.held ? "PENDING" : "SYNCED",
            providerPlanId: opts.held ? null : `plan_${planId}`,
        })),
    });
}

async function row(planId: string, version = 1, interval = "month") {
    return prisma.plan.findUniqueOrThrow({
        where: {
            key_version_interval: {
                key: `catalog.${planId}`,
                version,
                interval,
            },
        },
    });
}

let seq = 0;
async function business(): Promise<OrganizationContext> {
    seq += 1;
    const org = await prisma.organization.create({
        data: { name: `Billing ${seq}`, slug: `bill-${seq}-${tag}` },
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
/** A signed provider event, as the fake provider reads it. */
async function deliver(
    providerSubscriptionId: string,
    phase: BillingEventPhase,
    over: {
        status?: string;
        eventAt?: Date;
        currentPeriodEnd?: Date | null;
        id?: string;
        now?: Date;
    } = {},
) {
    evt += 1;
    const status =
        over.status ??
        (
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
            providerEventId: over.id ?? `evt_${evt}_${tag}`,
            type: `subscription.${phase}`,
            providerSubscriptionId,
            status,
            phase,
            eventAt: (over.eventAt ?? new Date()).toISOString(),
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

/** Free → `plan` monthly through a completed checkout. */
async function onPaidPlan(ctx: OrganizationContext, plan = "b") {
    const r = await checkout.changePlan(ctx, { plan, cycle: "month" });
    if (r.kind === "TO_FREE") throw new Error("expected a checkout");
    const end = new Date(Date.now() + 20 * DAY);
    await deliver(
        (
            await prisma.billingCheckout.findUniqueOrThrow({
                where: { id: r.checkout.id },
            })
        ).providerSubscriptionId,
        "activated",
        { currentPeriodEnd: end },
    );
    return { result: r, periodEnd: end };
}

async function cancelJobs() {
    const jobs = await prisma.job.findMany({
        where: { type: BILLING_PROVIDER_CANCEL_TYPE },
        orderBy: { createdAt: "asc" },
    });
    return jobs.map((j) => j.payload);
}

describe("checkout from Free", () => {
    it("Free → a paid plan monthly: a checkout on its provider plan, completed by the webhook; access follows", async () => {
        await install(1);
        const ctx = await business();
        const b = await row("b");

        const r = await checkout.changePlan(ctx, { plan: "b", cycle: "month" });
        expect(r.kind).toBe("NEW");
        if (r.kind === "TO_FREE") throw new Error("unreachable");
        expect(r.authorisationUrl).toMatch(/^https:\/\/pay\.fake\.test\//);
        expect(r.quote).toMatchObject({
            plan: { id: "b", version: 1 },
            pricePaise: b.priceCents,
            gstPaise: gstPaise(b.priceCents),
            totalPaise: withGstPaise(b.priceCents),
            chargeNowPaise: 0,
        });
        expect(fake.createCalls).toHaveLength(1);
        expect(fake.createCalls[0]).toMatchObject({
            providerPlanId: `plan_${b.id}`,
            priceCents: b.priceCents,
            startAt: null,
            upfront: null,
            reference: r.checkout.id,
        });
        // Still on Free until it's paid.
        expect((await sub(ctx.organizationId)).plan.key).toBe("catalog.free");
        expect((await checkout.current(ctx)).open?.id).toBe(r.checkout.id);

        const providerSub = `fake_sub_${r.checkout.id}`;
        // Authorised but not yet paid: a new plan waits for its charge.
        await deliver(providerSub, "authenticated");
        expect((await sub(ctx.organizationId)).plan.key).toBe("catalog.free");

        const end = new Date(Date.now() + 30 * DAY);
        await expect(
            deliver(providerSub, "activated", { currentPeriodEnd: end }),
        ).resolves.toEqual({ status: "processed", changed: true });

        const after = await sub(ctx.organizationId);
        expect(after).toMatchObject({
            planId: b.id,
            status: "ACTIVE",
            billingCycle: "month",
            provider: "RAZORPAY",
            providerSubscriptionId: providerSub,
            currentPeriodEnd: end,
            pendingPlanId: null,
            pendingFrom: null,
        });
        const done = await prisma.billingCheckout.findUniqueOrThrow({
            where: { id: r.checkout.id },
        });
        expect(done.status).toBe("COMPLETED");
        const a = await access.resolve(ctx.organizationId);
        expect(a).toMatchObject({
            source: "catalogue",
            planId: "b",
            version: 1,
        });
    });

    it("never takes an amount from the client: the pipe refuses one, and the charge is the server's", async () => {
        const pipe = new ValidationPipe(validationPipeOptions);
        await expect(
            pipe.transform(
                { plan: "b", cycle: "month", amountPaise: 1 },
                { type: "body", metatype: ChangePlanDto },
            ),
        ).rejects.toThrow();

        await install(1);
        const ctx = await business();
        const c = await row("c");
        await checkout.changePlan(ctx, {
            plan: "c",
            cycle: "month",
            pricePaise: 1,
        } as never);
        expect(fake.createCalls[0]).toMatchObject({
            priceCents: c.priceCents,
            providerPlanId: `plan_${c.id}`,
            upfront: null,
        });
    });

    it("refuses a plan whose provider plan isn't synced yet, and a plan it's already on", async () => {
        await install(1);
        // Plan C has no plan at the provider (as if not yet written).
        await prisma.pricingProviderPlan.deleteMany({
            where: { plan: { key: "catalog.c" } },
        });
        const ctx = await business();
        await expect(
            checkout.changePlan(ctx, { plan: "c", cycle: "month" }),
        ).rejects.toMatchObject({ status: 409 });
        await expect(
            checkout.changePlan(ctx, { plan: "free", cycle: "month" }),
        ).rejects.toMatchObject({ status: 409 });
        // Yearly rows have no provider plan while yearly isn't offered.
        await prisma.pricingProviderPlan.deleteMany({
            where: { plan: { interval: "year" } },
        });
        await expect(
            checkout.changePlan(ctx, { plan: "b", cycle: "year" }),
        ).rejects.toMatchObject({
            status: 409,
            message: "Plan B isn't offered yearly.",
        });
        expect(fake.createCalls).toHaveLength(0);
    });

    it("a second checkout replaces the open one and cancels its provider subscription; an abandoned one lapses", async () => {
        await install(1);
        const ctx = await business();
        const first = await checkout.changePlan(ctx, {
            plan: "b",
            cycle: "month",
        });
        const second = await checkout.changePlan(ctx, {
            plan: "c",
            cycle: "month",
        });
        if (first.kind === "TO_FREE" || second.kind === "TO_FREE") {
            throw new Error("unreachable");
        }
        const rows = await prisma.billingCheckout.findMany({
            where: { organizationId: ctx.organizationId },
            orderBy: { createdAt: "asc" },
        });
        expect(rows.map((r) => [r.id, r.status])).toEqual([
            [first.checkout.id, "CANCELLED"],
            [second.checkout.id, "OPEN"],
        ]);
        expect(await cancelJobs()).toEqual([
            {
                provider: "RAZORPAY",
                providerSubscriptionId: `fake_sub_${first.checkout.id}`,
                atCycleEnd: false,
            },
        ]);
        // A late activation of the replaced one changes nothing.
        await deliver(`fake_sub_${first.checkout.id}`, "activated");
        expect((await sub(ctx.organizationId)).plan.key).toBe("catalog.free");

        const out = await sweep.sweep(new Date(Date.now() + 2 * DAY));
        expect(out.lapsed).toBe(1);
        expect(
            (
                await prisma.billingCheckout.findUniqueOrThrow({
                    where: { id: second.checkout.id },
                })
            ).status,
        ).toBe("CANCELLED");
    });
});

describe("changing a paid plan", () => {
    it("an upgrade mid-period: the difference for what's left now, on the plan once authorised, the old subscription cancelled", async () => {
        await install(1);
        const ctx = await business();
        const { periodEnd } = await onPaidPlan(ctx, "b");
        const oldProviderSub = (await sub(ctx.organizationId))
            .providerSubscriptionId;
        const b = await row("b");
        const c = await row("c");

        const r = await checkout.changePlan(ctx, { plan: "c", cycle: "month" });
        expect(r.kind).toBe("UPGRADE");
        if (r.kind === "TO_FREE") throw new Error("unreachable");
        expect(r.quote.chargeNowPaise).toBeGreaterThan(0);
        expect(r.quote.chargeNowPaise).toBeLessThan(
            c.priceCents - b.priceCents,
        );
        expect(fake.createCalls[1]).toMatchObject({
            providerPlanId: `plan_${c.id}`,
            startAt: periodEnd,
            upfront: { amountPaise: r.quote.chargeNowTotalPaise },
        });

        await deliver(`fake_sub_${r.checkout.id}`, "authenticated");
        const after = await sub(ctx.organizationId);
        expect(after).toMatchObject({
            planId: c.id,
            providerSubscriptionId: `fake_sub_${r.checkout.id}`,
            // The period already paid is kept; its own charges start then.
            currentPeriodEnd: periodEnd,
        });
        expect(await cancelJobs()).toContainEqual({
            provider: "RAZORPAY",
            providerSubscriptionId: oldProviderSub,
            atCycleEnd: false,
        });
        expect(
            (await access.resolve(ctx.organizationId)).entitlements,
        ).toBeDefined();
        expect(await access.resolve(ctx.organizationId)).toMatchObject({
            planId: "c",
        });
    });

    it("a cheaper plan waits for the period's end: authorised now, applied by the sweep then", async () => {
        await install(1);
        const ctx = await business();
        const { periodEnd } = await onPaidPlan(ctx, "c");
        const oldProviderSub = (await sub(ctx.organizationId))
            .providerSubscriptionId;
        const b = await row("b");

        const r = await checkout.changePlan(ctx, { plan: "b", cycle: "month" });
        expect(r.kind).toBe("SCHEDULED");
        if (r.kind === "TO_FREE") throw new Error("unreachable");
        expect(r.quote).toMatchObject({
            effectiveAt: periodEnd.toISOString(),
            chargeNowPaise: 0,
        });

        await deliver(`fake_sub_${r.checkout.id}`, "authenticated");
        const waiting = await sub(ctx.organizationId);
        expect(waiting).toMatchObject({
            plan: { key: "catalog.c" },
            pendingPlanId: b.id,
            pendingFrom: periodEnd,
            cancelAtPeriodEnd: true,
        });
        expect((await checkout.current(ctx)).scheduled?.id).toBe(r.checkout.id);
        expect(await cancelJobs()).toContainEqual({
            provider: "RAZORPAY",
            providerSubscriptionId: oldProviderSub,
            atCycleEnd: true,
        });
        // Before the date the sweep changes nothing; access stays on C.
        expect((await sweep.sweep(new Date())).applied).toBe(0);
        expect(await access.resolve(ctx.organizationId)).toMatchObject({
            planId: "c",
        });

        const later = new Date(periodEnd.getTime() + 1000);
        expect((await sweep.sweep(later)).applied).toBe(1);
        expect(await sub(ctx.organizationId)).toMatchObject({
            planId: b.id,
            providerSubscriptionId: `fake_sub_${r.checkout.id}`,
            pendingPlanId: null,
            pendingFrom: null,
            cancelAtPeriodEnd: false,
        });
        expect(
            (
                await prisma.billingCheckout.findUniqueOrThrow({
                    where: { id: r.checkout.id },
                })
            ).status,
        ).toBe("COMPLETED");
    });

    it("a paid plan → Free mid-period: at the renewal, the provider told to stop then", async () => {
        await install(1);
        const ctx = await business();
        const { periodEnd } = await onPaidPlan(ctx, "b");
        const providerSub = (await sub(ctx.organizationId))
            .providerSubscriptionId;
        const free = await row("free");

        const r = await checkout.changePlan(ctx, {
            plan: "free",
            cycle: "month",
        });
        expect(r).toMatchObject({
            kind: "TO_FREE",
            effectiveAt: periodEnd.toISOString(),
        });
        expect(await sub(ctx.organizationId)).toMatchObject({
            plan: { key: "catalog.b" },
            pendingPlanId: free.id,
            pendingFrom: periodEnd,
            cancelAtPeriodEnd: true,
        });
        expect(await cancelJobs()).toEqual([
            {
                provider: "RAZORPAY",
                providerSubscriptionId: providerSub,
                atCycleEnd: true,
            },
        ]);
        expect(await access.resolve(ctx.organizationId)).toMatchObject({
            planId: "b",
        });

        // The provider ends it with the period: the move applies.
        await deliver(providerSub ?? "", "cancelled", {
            now: new Date(periodEnd.getTime() + 1000),
        });
        expect(await sub(ctx.organizationId)).toMatchObject({
            planId: free.id,
            status: "ACTIVE",
            provider: null,
            providerSubscriptionId: null,
            pendingPlanId: null,
            cancelAtPeriodEnd: false,
        });
        expect(await access.resolve(ctx.organizationId)).toMatchObject({
            planId: "free",
        });
    });

    it("autopay stopped at the provider mid-period: the plan runs to the period's end, then Free", async () => {
        await install(1);
        const ctx = await business();
        const { periodEnd } = await onPaidPlan(ctx, "b");
        const providerSub = (await sub(ctx.organizationId))
            .providerSubscriptionId;
        const free = await row("free");

        await expect(deliver(providerSub ?? "", "cancelled")).resolves.toEqual({
            status: "processed",
            changed: true,
        });
        expect(await sub(ctx.organizationId)).toMatchObject({
            plan: { key: "catalog.b" },
            status: "ACTIVE",
            pendingPlanId: free.id,
            pendingFrom: periodEnd,
            cancelAtPeriodEnd: true,
        });
        expect(await access.resolve(ctx.organizationId)).toMatchObject({
            planId: "b",
        });

        const later = new Date(periodEnd.getTime() + 1000);
        expect((await sweep.sweep(later)).applied).toBe(1);
        expect(await sub(ctx.organizationId)).toMatchObject({
            planId: free.id,
            status: "ACTIVE",
            provider: null,
        });
    });
});

describe("renewals and failed payments", () => {
    it("a renewal moves the period on; a failed charge is PAST_DUE; halted is Free, cancelled at the provider", async () => {
        await install(1);
        const ctx = await business();
        await onPaidPlan(ctx, "b");
        const providerSub = (await sub(ctx.organizationId))
            .providerSubscriptionId as string;

        const next = new Date(Date.now() + 50 * DAY);
        await deliver(providerSub, "charged", { currentPeriodEnd: next });
        expect(await sub(ctx.organizationId)).toMatchObject({
            status: "ACTIVE",
            currentPeriodEnd: next,
        });

        await deliver(providerSub, "pending");
        expect((await sub(ctx.organizationId)).status).toBe("PAST_DUE");
        // Still on its plan while the provider retries.
        expect(await access.resolve(ctx.organizationId)).toMatchObject({
            planId: "b",
        });

        await deliver(providerSub, "halted");
        expect((await sub(ctx.organizationId)).status).toBe("CANCELLED");
        expect(await access.resolve(ctx.organizationId)).toMatchObject({
            source: "catalogue",
            planId: "free",
        });
        expect(await cancelJobs()).toContainEqual({
            provider: "RAZORPAY",
            providerSubscriptionId: providerSub,
            atCycleEnd: false,
        });
    });

    it("is idempotent by event id, and an older event never undoes a newer one", async () => {
        await install(1);
        const ctx = await business();
        const { periodEnd } = await onPaidPlan(ctx, "b");
        const providerSub = (await sub(ctx.organizationId))
            .providerSubscriptionId as string;
        // Ended once the period is over: nothing paid is left to run to.
        const over = new Date(periodEnd.getTime() + 1000);

        const t1 = new Date(Date.now() + 1000);
        const t2 = new Date(Date.now() + 2000);
        await expect(
            deliver(providerSub, "cancelled", {
                eventAt: t2,
                id: "evt_cancel",
                now: over,
            }),
        ).resolves.toEqual({ status: "processed", changed: true });
        await expect(
            deliver(providerSub, "cancelled", {
                eventAt: t2,
                id: "evt_cancel",
                now: over,
            }),
        ).resolves.toEqual({ status: "duplicate", changed: false });
        // `activated` from before the cancel, delivered late.
        await expect(
            deliver(providerSub, "activated", { eventAt: t1 }),
        ).resolves.toEqual({ status: "ignored", changed: false });
        // And replayed with a newer stamp: CANCELLED is terminal.
        await expect(
            deliver(providerSub, "activated", {
                eventAt: new Date(Date.now() + 3000),
            }),
        ).resolves.toEqual({ status: "failed", changed: false });
        expect((await sub(ctx.organizationId)).status).toBe("CANCELLED");
        expect(
            await prisma.billingWebhookEvent.count({
                where: { providerEventId: "evt_cancel" },
            }),
        ).toBe(1);
    });
});

describe("moves and the provider", () => {
    it("a published price change kept ('keep their terms') leaves a subscription on its plan row", async () => {
        await install(1);
        const ctx = await business();
        await onPaidPlan(ctx, "b");
        const b1 = await row("b");
        await install(
            2,
            fakeCatalog((c) => {
                c.plans[1]!.pricePaise = 23_400;
            }),
        );
        const providerSub = (await sub(ctx.organizationId))
            .providerSubscriptionId as string;
        await deliver(providerSub, "charged", {
            currentPeriodEnd: new Date(Date.now() + 60 * DAY),
        });
        expect((await sub(ctx.organizationId)).planId).toBe(b1.id);
        expect(await access.resolve(ctx.organizationId)).toMatchObject({
            version: 1,
            planId: "b",
        });
    });

    it("never applies a move held at the provider, and applies it once synced", async () => {
        await install(1);
        const ctx = await business();
        await install(
            2,
            fakeCatalog((c) => {
                c.modules[0]!.cells.free = {
                    inc: true,
                    text: "12",
                    limit: 12,
                    card: "",
                    per: "",
                    soft: false,
                };
            }),
            { held: true },
        );
        // Free has no provider rows; hold version 2 with one of its paid rows.
        const free2 = await row("free", 2);
        const past = new Date(Date.now() - 1000);
        await prisma.subscription.update({
            where: { organizationId: ctx.organizationId },
            data: { pendingPlanId: free2.id, pendingFrom: past },
        });

        expect((await sweep.sweep(new Date())).applied).toBe(0);
        const held = await access.resolve(ctx.organizationId);
        expect(held).toMatchObject({
            version: 1,
            pendingMove: { version: 2, waiting: "held" },
        });

        await prisma.pricingProviderPlan.updateMany({
            data: { status: "SYNCED" },
        });
        await prisma.pricingProviderPlan.findMany().then((rows) =>
            Promise.all(
                rows.map((r) =>
                    prisma.pricingProviderPlan.update({
                        where: { id: r.id },
                        data: { providerPlanId: `plan_${r.planId}` },
                    }),
                ),
            ),
        );
        expect((await sweep.sweep(new Date())).applied).toBe(1);
        expect(await sub(ctx.organizationId)).toMatchObject({
            planId: free2.id,
            pendingPlanId: null,
            pendingFrom: null,
        });
        expect(await access.resolve(ctx.organizationId)).toMatchObject({
            version: 2,
            pendingMove: null,
        });
    });

    it("never charges a new amount silently: a paid move at another price waits for the business to authorise it", async () => {
        await install(1);
        const ctx = await business();
        await onPaidPlan(ctx, "b");
        await install(
            2,
            fakeCatalog((c) => {
                c.plans[1]!.pricePaise = 23_400;
            }),
        );
        const b2 = await row("b", 2);
        const from = new Date(Date.now() + 5 * DAY);
        await prisma.subscription.update({
            where: { organizationId: ctx.organizationId },
            data: { pendingPlanId: b2.id, pendingFrom: from },
        });
        const later = new Date(from.getTime() + 1000);
        expect((await sweep.sweep(later)).applied).toBe(0);
        expect(await access.resolve(ctx.organizationId, later)).toMatchObject({
            version: 1,
            pendingMove: { waiting: "authorise" },
        });

        // The business authorises the new amount, for the move's date.
        const r = await checkout.changePlan(ctx, { plan: "b", cycle: "month" });
        expect(r.kind).toBe("SCHEDULED");
        if (r.kind === "TO_FREE") throw new Error("unreachable");
        expect(fake.createCalls.at(-1)).toMatchObject({
            providerPlanId: `plan_${b2.id}`,
            startAt: from,
        });
        await deliver(`fake_sub_${r.checkout.id}`, "authenticated");
        expect((await sweep.sweep(later)).applied).toBe(1);
        expect(await sub(ctx.organizationId)).toMatchObject({
            planId: b2.id,
            providerSubscriptionId: `fake_sub_${r.checkout.id}`,
        });
    });
});

describe("during the first month (DEC-159)", () => {
    /** The first-month offer on both paid plans, as when the rule was made. */
    const BOTH = () =>
        fakeCatalog((c) => {
            c.plans[1]!.trial = { on: true, days: 30, firstPaise: 700 };
            c.plans[2]!.trial = { on: true, days: 30, firstPaise: 700 };
        });
    /** The offer on Plan B alone: Plan C starts at its full price. */
    const B_ONLY = () =>
        fakeCatalog((c) => {
            c.plans[1]!.trial = { on: true, days: 30, firstPaise: 700 };
        });

    /** Free → `plan` with its first-month offer, authorised. */
    async function inFirstMonth(ctx: OrganizationContext, plan: string) {
        const r = await checkout.changePlan(ctx, { plan, cycle: "month" });
        if (r.kind !== "TRIAL") throw new Error("expected a first month");
        expect(r.quote.chargeNowPaise).toBe(700);
        const providerSub = `fake_sub_${r.checkout.id}`;
        await deliver(providerSub, "authenticated");
        return { providerSub, ends: new Date(r.quote.trialEndsAt!) };
    }

    it("a dearer plan starts today at its full price and ends the month; its own offer never applies", async () => {
        await install(1, BOTH());
        const ctx = await business();
        const c = await row("c");
        const first = await inFirstMonth(ctx, "b");

        const q = await checkout.quote(ctx, { plan: "c", cycle: "month" });
        expect(q).toMatchObject({
            kind: "NEW",
            firstMonth: "NOW",
            startAt: null,
            effectiveAt: null,
            trialEndsAt: null,
            chargeNowPaise: 0,
            payNowTotalPaise: withGstPaise(c.priceCents),
            mandateCheck: "PAID",
            termCharges: 12,
        });
        const r = await checkout.changePlan(ctx, { plan: "c", cycle: "month" });
        if (r.kind !== "NEW") throw new Error("expected a plan started now");
        expect(fake.createCalls[1]).toMatchObject({
            providerPlanId: `plan_${c.id}`,
            startAt: null,
            upfront: null,
            totalCount: 12,
        });

        // Authorised alone moves nothing: the full first charge is the way on.
        const providerSub = `fake_sub_${r.checkout.id}`;
        await deliver(providerSub, "authenticated");
        expect(await sub(ctx.organizationId)).toMatchObject({
            plan: { key: "catalog.b" },
            status: "TRIALING",
            currentPeriodEnd: first.ends,
        });

        const end = new Date(Date.now() + 30 * DAY);
        await deliver(providerSub, "activated", { currentPeriodEnd: end });
        expect(await sub(ctx.organizationId)).toMatchObject({
            planId: c.id,
            status: "ACTIVE",
            providerSubscriptionId: providerSub,
            currentPeriodEnd: end,
            pendingPlanId: null,
            cancelAtPeriodEnd: false,
        });
        // The first month's subscription is ended at once, never at E.
        expect(await cancelJobs()).toContainEqual({
            provider: "RAZORPAY",
            providerSubscriptionId: first.providerSub,
            atCycleEnd: false,
        });
        await deliver(first.providerSub, "cancelled");
        expect(await sub(ctx.organizationId)).toMatchObject({
            planId: c.id,
            status: "ACTIVE",
        });
        // One offer per business: only the first checkout was a first month.
        expect(
            await prisma.billingCheckout.count({
                where: { organizationId: ctx.organizationId, kind: "TRIAL" },
            }),
        ).toBe(1);
    });

    it("a cheaper plan waits for the month's end: nothing owed now, the plan kept, and no hop back for the first month's amount", async () => {
        await install(1, BOTH());
        const ctx = await business();
        const b = await row("b");
        const first = await inFirstMonth(ctx, "c");

        const r = await checkout.changePlan(ctx, { plan: "b", cycle: "month" });
        expect(r).toMatchObject({
            kind: "SCHEDULED",
            quote: {
                firstMonth: "AT_END",
                startAt: first.ends.toISOString(),
                effectiveAt: first.ends.toISOString(),
                trialEndsAt: null,
                payNowTotalPaise: 0,
                mandateCheck: "REFUNDED",
                firstChargePaise: b.priceCents,
            },
        });
        if (r.kind === "TO_FREE") throw new Error("unreachable");
        expect(fake.createCalls[1]).toMatchObject({
            providerPlanId: `plan_${b.id}`,
            startAt: first.ends,
            upfront: null,
        });

        const next = `fake_sub_${r.checkout.id}`;
        await deliver(next, "authenticated");
        expect(await sub(ctx.organizationId)).toMatchObject({
            plan: { key: "catalog.c" },
            status: "TRIALING",
            providerSubscriptionId: first.providerSub,
            pendingPlanId: b.id,
            pendingFrom: first.ends,
            cancelAtPeriodEnd: true,
        });
        // Plan C's full charge must never be taken at the month's end.
        expect(await cancelJobs()).toContainEqual({
            provider: "RAZORPAY",
            providerSubscriptionId: first.providerSub,
            atCycleEnd: false,
        });
        // The provider says so at once; the plan is paid to the month's end.
        await expect(deliver(first.providerSub, "cancelled")).resolves.toEqual({
            status: "processed",
            changed: false,
        });
        expect(await sub(ctx.organizationId)).toMatchObject({
            plan: { key: "catalog.c" },
            status: "TRIALING",
            pendingPlanId: b.id,
        });
        expect(await access.resolve(ctx.organizationId)).toMatchObject({
            planId: "c",
        });
        expect((await sweep.sweep(new Date())).applied).toBe(0);
        // Plan C again is the plan it's on: nothing to buy, nothing to hop to.
        await expect(
            checkout.changePlan(ctx, { plan: "c", cycle: "month" }),
        ).rejects.toThrow(/already on/);

        // The month's end: Plan B's first full charge applies the move.
        const end = new Date(first.ends.getTime() + 30 * DAY);
        await deliver(next, "charged", {
            currentPeriodEnd: end,
            now: new Date(first.ends.getTime() + 1000),
        });
        expect(await sub(ctx.organizationId)).toMatchObject({
            planId: b.id,
            status: "ACTIVE",
            providerSubscriptionId: next,
            currentPeriodEnd: end,
            pendingPlanId: null,
            pendingFrom: null,
            cancelAtPeriodEnd: false,
        });
    });

    it("Free, or cancelling: the plan runs to the month's end, nothing more is charged, and the offer is used", async () => {
        await install(1, BOTH());
        const ctx = await business();
        const b = await row("b");
        const free = await row("free");
        const first = await inFirstMonth(ctx, "b");

        const r = await checkout.changePlan(ctx, {
            plan: "free",
            cycle: "month",
        });
        expect(r).toMatchObject({
            kind: "TO_FREE",
            effectiveAt: first.ends.toISOString(),
            quote: { firstMonth: "AT_END", payNowTotalPaise: 0 },
        });
        expect(await sub(ctx.organizationId)).toMatchObject({
            plan: { key: "catalog.b" },
            status: "TRIALING",
            pendingPlanId: free.id,
            pendingFrom: first.ends,
            cancelAtPeriodEnd: true,
        });
        expect(await cancelJobs()).toEqual([
            {
                provider: "RAZORPAY",
                providerSubscriptionId: first.providerSub,
                atCycleEnd: false,
            },
        ]);
        await expect(deliver(first.providerSub, "cancelled")).resolves.toEqual({
            status: "processed",
            changed: false,
        });
        expect(await access.resolve(ctx.organizationId)).toMatchObject({
            planId: "b",
        });
        expect((await sweep.sweep(new Date())).applied).toBe(0);

        const later = new Date(first.ends.getTime() + 1000);
        expect((await sweep.sweep(later)).applied).toBe(1);
        expect(await sub(ctx.organizationId)).toMatchObject({
            planId: free.id,
            status: "ACTIVE",
            provider: null,
            providerSubscriptionId: null,
            pendingPlanId: null,
            cancelAtPeriodEnd: false,
        });
        // Its one offer is used: the same plan again is its full price.
        expect(
            await checkout.quote(ctx, { plan: "b", cycle: "month" }, later),
        ).toMatchObject({
            kind: "NEW",
            firstMonth: null,
            payNowTotalPaise: withGstPaise(b.priceCents),
        });
    });

    it("autopay stopped at the provider in the first month: the month runs to its end, then Free", async () => {
        await install(1, BOTH());
        const ctx = await business();
        const free = await row("free");
        const first = await inFirstMonth(ctx, "b");

        await expect(deliver(first.providerSub, "cancelled")).resolves.toEqual({
            status: "processed",
            changed: true,
        });
        expect(await sub(ctx.organizationId)).toMatchObject({
            plan: { key: "catalog.b" },
            status: "TRIALING",
            pendingPlanId: free.id,
            pendingFrom: first.ends,
            cancelAtPeriodEnd: true,
        });
        expect(await access.resolve(ctx.organizationId)).toMatchObject({
            planId: "b",
        });
        expect((await sweep.sweep(new Date())).applied).toBe(0);

        const later = new Date(first.ends.getTime() + 1000);
        expect((await sweep.sweep(later)).applied).toBe(1);
        expect(await sub(ctx.organizationId)).toMatchObject({
            planId: free.id,
            status: "ACTIVE",
            provider: null,
        });
    });

    it("a change that waits is replaced by the next one: Free instead, or the dearer plan today", async () => {
        await install(1, BOTH());
        const ctx = await business();
        const c = await row("c");
        const free = await row("free");
        const first = await inFirstMonth(ctx, "c");

        const down = await checkout.changePlan(ctx, {
            plan: "b",
            cycle: "month",
        });
        if (down.kind === "TO_FREE") throw new Error("unreachable");
        await deliver(`fake_sub_${down.checkout.id}`, "authenticated");

        // Free instead: the plan it authorised is given up, the date kept.
        await checkout.changePlan(ctx, { plan: "free", cycle: "month" });
        expect(
            await prisma.billingCheckout.findUniqueOrThrow({
                where: { id: down.checkout.id },
            }),
        ).toMatchObject({ status: "CANCELLED", endedReason: "changed-plan" });
        expect(await cancelJobs()).toContainEqual({
            provider: "RAZORPAY",
            providerSubscriptionId: `fake_sub_${down.checkout.id}`,
            atCycleEnd: false,
        });
        expect(await sub(ctx.organizationId)).toMatchObject({
            plan: { key: "catalog.c" },
            pendingPlanId: free.id,
            pendingFrom: first.ends,
            cancelAtPeriodEnd: true,
        });

        // A second business, on Plan B with Free waiting, moves up instead.
        const other = await business();
        await inFirstMonth(other, "b");
        await checkout.changePlan(other, { plan: "free", cycle: "month" });
        const up = await checkout.changePlan(other, {
            plan: "c",
            cycle: "month",
        });
        if (up.kind !== "NEW") throw new Error("expected a plan started now");
        const end = new Date(Date.now() + 30 * DAY);
        await deliver(`fake_sub_${up.checkout.id}`, "activated", {
            currentPeriodEnd: end,
        });
        expect(await sub(other.organizationId)).toMatchObject({
            planId: c.id,
            status: "ACTIVE",
            currentPeriodEnd: end,
            pendingPlanId: null,
            pendingFrom: null,
            cancelAtPeriodEnd: false,
            freeChosenAt: null,
        });
    });

    it("a plan that waits and is ended at the provider lands on Free at the same date, never on a plan nobody pays for", async () => {
        await install(1, BOTH());
        const ctx = await business();
        const free = await row("free");
        const first = await inFirstMonth(ctx, "c");
        const down = await checkout.changePlan(ctx, {
            plan: "b",
            cycle: "month",
        });
        if (down.kind === "TO_FREE") throw new Error("unreachable");
        const next = `fake_sub_${down.checkout.id}`;
        await deliver(next, "authenticated");
        await deliver(first.providerSub, "cancelled");

        // The mandate for Plan B is withdrawn before it ever charged.
        await deliver(next, "cancelled");
        expect(
            await prisma.billingCheckout.findUniqueOrThrow({
                where: { id: down.checkout.id },
            }),
        ).toMatchObject({ status: "CANCELLED" });
        expect(await sub(ctx.organizationId)).toMatchObject({
            plan: { key: "catalog.c" },
            status: "TRIALING",
            pendingPlanId: free.id,
            pendingFrom: first.ends,
            cancelAtPeriodEnd: true,
        });
        const later = new Date(first.ends.getTime() + 1000);
        expect((await sweep.sweep(later)).applied).toBe(1);
        expect((await sub(ctx.organizationId)).planId).toBe(free.id);
    });

    it("a plan with no offer starts at its full price from Free; the offer stays its own plan's", async () => {
        await install(1, B_ONLY());
        const ctx = await business();
        const b = await row("b");
        const c = await row("c");

        expect(
            await checkout.quote(ctx, { plan: "b", cycle: "month" }),
        ).toMatchObject({ kind: "TRIAL", chargeNowPaise: 700 });
        const q = await checkout.quote(ctx, { plan: "c", cycle: "month" });
        expect(q).toMatchObject({
            kind: "NEW",
            firstMonth: null,
            startAt: null,
            trialEndsAt: null,
            chargeNowPaise: 0,
            payNowTotalPaise: withGstPaise(c.priceCents),
            mandateCheck: "PAID",
        });
        const { periodEnd } = await onPaidPlan(ctx, "c");
        expect(fake.createCalls[0]).toMatchObject({
            providerPlanId: `plan_${c.id}`,
            startAt: null,
            upfront: null,
        });
        expect(await sub(ctx.organizationId)).toMatchObject({
            planId: c.id,
            status: "ACTIVE",
        });
        // Down to the plan with the offer, in a paid period: at the period's
        // end and at its full price. The offer is for starting a paid plan.
        expect(
            await checkout.quote(ctx, { plan: "b", cycle: "month" }),
        ).toMatchObject({
            kind: "SCHEDULED",
            firstMonth: null,
            effectiveAt: periodEnd.toISOString(),
            chargeNowPaise: 0,
            payNowTotalPaise: 0,
            firstChargePaise: b.priceCents,
        });
    });
});

describe("what was paid for runs out first (DEC-159)", () => {
    it("a paid period ended early at the provider still runs to its end before the move to Free", async () => {
        await install(1);
        const ctx = await business();
        const { periodEnd } = await onPaidPlan(ctx, "b");
        const providerSub = (await sub(ctx.organizationId))
            .providerSubscriptionId;
        const free = await row("free");
        await checkout.changePlan(ctx, { plan: "free", cycle: "month" });

        // Days before the period's end, not with it.
        await expect(deliver(providerSub ?? "", "cancelled")).resolves.toEqual({
            status: "processed",
            changed: false,
        });
        expect(await sub(ctx.organizationId)).toMatchObject({
            plan: { key: "catalog.b" },
            status: "ACTIVE",
            pendingPlanId: free.id,
            pendingFrom: periodEnd,
        });
        expect(await access.resolve(ctx.organizationId)).toMatchObject({
            planId: "b",
        });

        const later = new Date(periodEnd.getTime() + 1000);
        expect((await sweep.sweep(later)).applied).toBe(1);
        expect(await sub(ctx.organizationId)).toMatchObject({
            planId: free.id,
            status: "ACTIVE",
            provider: null,
        });
    });
});
