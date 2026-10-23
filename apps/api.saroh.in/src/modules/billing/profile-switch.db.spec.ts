/**
 * Moving a paid business to another billing profile at its next renewal
 * (DEC-167, R13, U6), against a real Postgres through the fake billing
 * provider (no Razorpay call is ever made):
 *
 * - AE4: paid monthly, renewing in 16 days (5 Nov), moved today (20 Oct):
 *   it stays on its profile, a scheduled checkout for the same plan is
 *   made on the new profile's customer, and when the renewal applies it
 *   the business is billed to the new profile and its invoice addressed
 *   to it. The old subscription is told to end with its period.
 * - AE5: never authorised: the checkout lapses, the old subscription is
 *   left to renew as it would, and an unpaid renewal is the usual one.
 * - Choosing its profile again before authorisation gives the switch up;
 *   after it, staying is a switch back, authorised again.
 * - A plan change and a switch before the same renewal: one checkout
 *   carries both, whichever came first.
 * - A payment for a plan waiting: 409 `checkout-waiting`.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { createHmac } from "node:crypto";

import {
    prisma,
    startOnFreePlan,
    writeCatalogueVersion,
} from "@saroh/database";
import { planRows } from "@saroh/pricing-catalog";

import { giveBillingDetails } from "../../../test/business-details";
import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import type { OrganizationContext } from "../../common/types/organization-context";
import { AuditAction, AuditService } from "../audit/audit.service";
import { resolveCapabilities } from "../organizations/organization-policy";
import { BillingProfilesService } from "./billing-profiles.service";
import { BillingWebhookService } from "./billing-webhook.service";
import {
    BusinessBillingProfileService,
    CHECKOUT_WAITING,
} from "./business-billing-profile.service";
import { CheckoutService } from "./checkout.service";
import { MovesApplyHandler } from "./moves-apply.handler";
import { PlansService } from "./plans.service";
import { BILLING_PROVIDER_CANCEL_TYPE } from "./provider-cancel.job";
import type { BillingEventPhase } from "./providers/billing-provider.port";
import {
    FakeBillingProvider,
    FakeBillingProviderFactory,
} from "./providers/fake.provider";
import { renewalReminderOf } from "./renewal-reminder";
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
let checkout: CheckoutService;
let webhooks: BillingWebhookService;
let profiles: BusinessBillingProfileService;
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
    profiles = new BusinessBillingProfileService(
        new BillingProfilesService(),
        checkout,
        new AuditService(),
    );
    await prisma.job.deleteMany({});
    await prisma.subscriptionAddonCharge.deleteMany({});
    await prisma.subscriptionAddon.deleteMany({});
    await prisma.sarohInvoice.deleteMany({});
    await prisma.sarohInvoiceSequence.deleteMany({});
    await prisma.billingWebhookEvent.deleteMany({});
    await prisma.billingCheckout.deleteMany({});
    await prisma.subscription.deleteMany({});
    await prisma.pricingProviderPlan.deleteMany({});
    await prisma.pricingCatalogVersion.deleteMany({});
    await prisma.plan.deleteMany({});
    await install();
});

async function install() {
    const catalog = fakeCatalog();
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

async function row(planId: string) {
    return prisma.plan.findUniqueOrThrow({
        where: {
            key_version_interval: {
                key: `catalog.${planId}`,
                version: 1,
                interval: "month",
            },
        },
    });
}

let seq = 0;

/**
 * A business on Free billed to profile A, whose owner is the caller;
 * profile B is the same owner's other one ("Asha Fitness").
 */
async function business() {
    seq += 1;
    const org = await prisma.organization.create({
        data: { name: `Switch ${seq}`, slug: `switch-${seq}-${tag}` },
    });
    await startOnFreePlan(prisma, org.id, { planId: "free" });
    const a = await giveBillingDetails(org.id);
    const { ownerUserId } = await prisma.billingProfile.findUniqueOrThrow({
        where: { id: a },
    });
    const b = await prisma.billingProfile.create({
        data: {
            ownerUserId,
            legalName: "Asha Fitness Pvt Ltd",
            gstin: "27ABCDE1234F1Z5",
            gstState: "27",
            addressLine1: "12 MG Road",
            city: "Pune",
            postalCode: "411001",
            billingEmail: `fitness-${seq}-${tag}@example.com`,
            provider: "RAZORPAY",
        },
    });
    const ctx: OrganizationContext = {
        organizationId: org.id,
        userId: ownerUserId,
        role: "OWNER",
        roleKey: "OWNER",
        actions: resolveCapabilities("OWNER", null, []),
    };
    return { ctx, a, b: b.id };
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

/** On `plan` monthly, renewing `renewsAt`: answers its provider subscription. */
async function onPaidPlan(
    ctx: OrganizationContext,
    renewsAt: Date,
    plan = "b",
): Promise<string> {
    const r = await checkout.changePlan(ctx, { plan, cycle: "month" });
    if (r.kind === "TO_FREE") throw new Error("expected a checkout");
    const ref = `fake_sub_${r.checkout.id}`;
    await deliver(ref, "activated", { currentPeriodEnd: renewsAt });
    return ref;
}

const sub = (organizationId: string) =>
    prisma.subscription.findUniqueOrThrow({
        where: { organizationId },
        include: { plan: true },
    });

const billedTo = async (organizationId: string) =>
    (
        await prisma.organization.findUniqueOrThrow({
            where: { id: organizationId },
        })
    ).billingProfileId;

async function cancelJobs() {
    const jobs = await prisma.job.findMany({
        where: { type: BILLING_PROVIDER_CANCEL_TYPE },
        orderBy: { createdAt: "asc" },
    });
    return jobs.map((j) => j.payload);
}

const checkoutOf = (id: string) =>
    prisma.billingCheckout.findUniqueOrThrow({ where: { id } });

/** The checkout behind a fake provider subscription. */
const idOf = (ref: string) => ref.replace(/^fake_sub_/, "");

describe("a paid business moved to another profile (AE4)", () => {
    it("stays on its profile until the renewal, which bills the new one and addresses its invoice to it", async () => {
        const { ctx, a, b } = await business();
        // Today is 20 Oct; the plan renews on 5 Nov.
        const switchedAt = new Date();
        const renewsAt = new Date(switchedAt.getTime() + 16 * DAY);
        const oldRef = await onPaidPlan(ctx, renewsAt);
        const plan = await row("b");

        const chosen = await profiles.choose(ctx, b, switchedAt);
        expect(chosen).toMatchObject({
            outcome: "scheduled",
            current: { id: a },
            authorise: {
                at: renewsAt.toISOString(),
                legalName: "Asha Fitness Pvt Ltd",
            },
            pendingSwitch: {
                legalName: "Asha Fitness Pvt Ltd",
                at: renewsAt.toISOString(),
                authorised: false,
            },
        });
        expect(chosen.authorise?.authorisationUrl).toMatch(/^https:\/\//);
        expect(await billedTo(ctx.organizationId)).toBe(a);

        // The same plan, from the renewal, on the new profile's customer.
        const made = fake.createCalls.at(-1)!;
        expect(made).toMatchObject({
            planId: plan.id,
            startAt: renewsAt,
            upfront: null,
            providerCustomerId: `fake_cus_${b}`,
            customer: { billingProfileId: b, name: "Asha Fitness Pvt Ltd" },
        });
        const switchRow = await prisma.billingCheckout.findFirstOrThrow({
            where: { organizationId: ctx.organizationId, status: "OPEN" },
        });
        expect(switchRow).toMatchObject({
            kind: "SCHEDULED",
            planId: plan.id,
            billingProfileId: b,
            providerCustomerId: `fake_cus_${b}`,
            startAt: renewsAt,
        });
        const newRef = switchRow.providerSubscriptionId;

        // Authorised: the old autopay is told to end with its period.
        await deliver(newRef, "authenticated");
        expect(await checkoutOf(switchRow.id)).toMatchObject({
            status: "SCHEDULED",
        });
        expect(await sub(ctx.organizationId)).toMatchObject({
            planId: plan.id,
            providerSubscriptionId: oldRef,
            pendingPlanId: plan.id,
            pendingFrom: renewsAt,
            cancelAtPeriodEnd: true,
        });
        expect(await cancelJobs()).toEqual([
            {
                provider: "RAZORPAY",
                providerSubscriptionId: oldRef,
                atCycleEnd: true,
            },
        ]);
        expect(await billedTo(ctx.organizationId)).toBe(a);
        expect((await profiles.view(ctx)).pendingSwitch).toEqual({
            legalName: "Asha Fitness Pvt Ltd",
            at: renewsAt.toISOString(),
            authorised: true,
        });
        // No reminder of a renewal on the old profile: it ends then.
        const subId = (await sub(ctx.organizationId)).id;
        expect(
            await renewalReminderOf(
                prisma,
                subId,
                new Date(renewsAt.getTime() - 2 * DAY),
            ),
        ).toBeNull();

        // 5 Nov: the new subscription's first charge applies the move.
        const at = new Date(renewsAt.getTime() + 60_000);
        await deliver(newRef, "charged", {
            currentPeriodEnd: new Date(renewsAt.getTime() + 30 * DAY),
            now: at,
        });
        expect(await sub(ctx.organizationId)).toMatchObject({
            planId: plan.id,
            providerSubscriptionId: newRef,
            providerCustomerId: `fake_cus_${b}`,
            pendingPlanId: null,
            cancelAtPeriodEnd: false,
        });
        expect(await billedTo(ctx.organizationId)).toBe(b);
        expect((await checkoutOf(switchRow.id)).status).toBe("COMPLETED");
        const invoice = await prisma.sarohInvoice.findFirstOrThrow({
            where: {
                organizationId: ctx.organizationId,
                providerSubscriptionId: newRef,
            },
        });
        expect(invoice).toMatchObject({
            billingProfileId: b,
            billToName: "Asha Fitness Pvt Ltd",
            billToGstin: "27ABCDE1234F1Z5",
            billToState: "27",
        });
        // The old one is never charged again: it was told to end with the
        // period, and the move made sure of it.
        const cancels = await cancelJobs();
        expect(
            cancels.every(
                (c) =>
                    (c as { providerSubscriptionId: string })
                        .providerSubscriptionId === oldRef,
            ),
        ).toBe(true);
        expect(cancels).toContainEqual({
            provider: "RAZORPAY",
            providerSubscriptionId: oldRef,
            atCycleEnd: true,
        });
        // The move is on the business's record, by ids.
        const events = await prisma.auditEvent.findMany({
            where: {
                organizationId: ctx.organizationId,
                action: AuditAction.BillingProfileChoose,
            },
            orderBy: { createdAt: "asc" },
        });
        expect(events.map((e) => e.metadata)).toEqual([
            {
                from: a,
                to: b,
                via: "chosen-at-renewal",
                at: renewsAt.toISOString(),
            },
            { from: a, to: b, via: "renewal", checkoutId: switchRow.id },
        ]);
    });

    it("applied by the sweep when no charge event comes first", async () => {
        const { ctx, b } = await business();
        const renewsAt = new Date(Date.now() + 16 * DAY);
        await onPaidPlan(ctx, renewsAt);
        await profiles.choose(ctx, b);
        const switchRow = await prisma.billingCheckout.findFirstOrThrow({
            where: { organizationId: ctx.organizationId, status: "OPEN" },
        });
        await deliver(switchRow.providerSubscriptionId, "authenticated");

        expect((await sweep.sweep(new Date())).applied).toBe(0);
        await sweep.sweep(new Date(renewsAt.getTime() + 1000));
        expect(await billedTo(ctx.organizationId)).toBe(b);
        expect((await sub(ctx.organizationId)).providerSubscriptionId).toBe(
            switchRow.providerSubscriptionId,
        );
    });

    it("a profile made in place for a paid business is chosen the same way, its customer made by the checkout", async () => {
        const { ctx, a } = await business();
        const renewsAt = new Date(Date.now() + 16 * DAY);
        await onPaidPlan(ctx, renewsAt);
        const made = await profiles.create(
            ctx,
            {
                legalName: "Asha Studio LLP",
                billingEmail: `studio-${tag}@example.com`,
                addressLine1: "4 Lake View",
                city: "Pune",
                postalCode: "411001",
                gstState: "27",
            },
            true,
        );
        expect(made).toMatchObject({
            outcome: "scheduled",
            notMoved: null,
            current: { id: a },
            authorise: { legalName: "Asha Studio LLP" },
        });
        expect(fake.createCalls.at(-1)).toMatchObject({
            providerCustomerId: `fake_cus_${made.created}`,
            startAt: renewsAt,
        });
    });
});

describe("never authorised (AE5)", () => {
    it("lapses, and the renewal is the business's usual one on its profile", async () => {
        const { ctx, a, b } = await business();
        const renewsAt = new Date(Date.now() + 16 * DAY);
        const oldRef = await onPaidPlan(ctx, renewsAt);
        await profiles.choose(ctx, b);
        const switchRow = await prisma.billingCheckout.findFirstOrThrow({
            where: { organizationId: ctx.organizationId, status: "OPEN" },
        });

        expect(
            await sweep.lapseCheckouts(new Date(Date.now() + DAY + 1000)),
        ).toBe(1);
        expect(await checkoutOf(switchRow.id)).toMatchObject({
            status: "CANCELLED",
            endedReason: "expired",
        });
        // Only the switch's own subscription is stopped; the old one runs.
        expect(await cancelJobs()).toEqual([
            {
                provider: "RAZORPAY",
                providerSubscriptionId: switchRow.providerSubscriptionId,
                atCycleEnd: false,
            },
        ]);
        expect(await sub(ctx.organizationId)).toMatchObject({
            providerSubscriptionId: oldRef,
            pendingPlanId: null,
            cancelAtPeriodEnd: false,
        });
        expect((await profiles.view(ctx)).pendingSwitch).toBeNull();

        // 5 Nov: the renewal's charge fails, as any unpaid renewal does.
        await sweep.sweep(new Date(renewsAt.getTime() + 1000));
        await deliver(oldRef, "pending", {
            now: new Date(renewsAt.getTime() + 60_000),
        });
        expect((await sub(ctx.organizationId)).status).toBe("PAST_DUE");
        expect(await billedTo(ctx.organizationId)).toBe(a);
    });
});

describe("choosing the profile it is on again", () => {
    it("before authorisation gives the switch up and leaves the plan as it was", async () => {
        const { ctx, a, b } = await business();
        const renewsAt = new Date(Date.now() + 16 * DAY);
        const oldRef = await onPaidPlan(ctx, renewsAt);
        await profiles.choose(ctx, b);
        const switchRow = await prisma.billingCheckout.findFirstOrThrow({
            where: { organizationId: ctx.organizationId, status: "OPEN" },
        });

        const kept = await profiles.choose(ctx, a);
        expect(kept).toMatchObject({
            outcome: "kept",
            authorise: null,
            pendingSwitch: null,
            current: { id: a },
        });
        expect(await checkoutOf(switchRow.id)).toMatchObject({
            status: "CANCELLED",
            endedReason: "profile-kept",
        });
        expect(await cancelJobs()).toEqual([
            {
                provider: "RAZORPAY",
                providerSubscriptionId: switchRow.providerSubscriptionId,
                atCycleEnd: false,
            },
        ]);
        expect(await sub(ctx.organizationId)).toMatchObject({
            providerSubscriptionId: oldRef,
            pendingPlanId: null,
            pendingFrom: null,
            cancelAtPeriodEnd: false,
        });
        // Nothing left to give up: choosing it again does nothing.
        await expect(profiles.choose(ctx, a)).resolves.toMatchObject({
            outcome: "none",
        });
    });

    it("after authorisation is a switch back, authorised again, which replaces the switch", async () => {
        const { ctx, a, b } = await business();
        const renewsAt = new Date(Date.now() + 16 * DAY);
        await onPaidPlan(ctx, renewsAt);
        await profiles.choose(ctx, b);
        const toB = await prisma.billingCheckout.findFirstOrThrow({
            where: { organizationId: ctx.organizationId, status: "OPEN" },
        });
        await deliver(toB.providerSubscriptionId, "authenticated");

        const back = await profiles.choose(ctx, a);
        expect(back).toMatchObject({
            outcome: "scheduled",
            authorise: { at: renewsAt.toISOString() },
        });
        const toA = await prisma.billingCheckout.findFirstOrThrow({
            where: { organizationId: ctx.organizationId, status: "OPEN" },
        });
        expect(toA).toMatchObject({ billingProfileId: a, startAt: renewsAt });
        await deliver(toA.providerSubscriptionId, "authenticated");
        expect(await checkoutOf(toB.id)).toMatchObject({
            status: "CANCELLED",
            endedReason: "replaced",
        });
        expect((await profiles.view(ctx)).pendingSwitch).toBeNull();

        await sweep.sweep(new Date(renewsAt.getTime() + 1000));
        expect(await billedTo(ctx.organizationId)).toBe(a);
        expect((await sub(ctx.organizationId)).providerSubscriptionId).toBe(
            toA.providerSubscriptionId,
        );
    });
});

describe("a plan change and a switch before the same renewal", () => {
    it("a switch after a plan change is authorised: one checkout carries both", async () => {
        const { ctx, b } = await business();
        const renewsAt = new Date(Date.now() + 16 * DAY);
        await onPaidPlan(ctx, renewsAt, "c");
        const cheaper = await row("b");
        const change = await checkout.changePlan(ctx, {
            plan: "b",
            cycle: "month",
        });
        if (change.kind === "TO_FREE") throw new Error("expected a checkout");
        expect(change.kind).toBe("SCHEDULED");
        await deliver(`fake_sub_${change.checkout.id}`, "authenticated");

        const chosen = await profiles.choose(ctx, b);
        expect(chosen.outcome).toBe("scheduled");
        const both = await prisma.billingCheckout.findFirstOrThrow({
            where: { organizationId: ctx.organizationId, status: "OPEN" },
        });
        expect(both).toMatchObject({
            planId: cheaper.id,
            billingProfileId: b,
            startAt: renewsAt,
        });
        // Until it's authorised, the plan change stands as it was.
        expect((await checkoutOf(change.checkout.id)).status).toBe("SCHEDULED");

        await deliver(both.providerSubscriptionId, "authenticated");
        expect((await checkoutOf(change.checkout.id)).status).toBe("CANCELLED");
        expect(
            await prisma.billingCheckout.count({
                where: {
                    organizationId: ctx.organizationId,
                    status: { in: ["OPEN", "SCHEDULED"] },
                },
            }),
        ).toBe(1);

        await sweep.sweep(new Date(renewsAt.getTime() + 1000));
        expect((await sub(ctx.organizationId)).planId).toBe(cheaper.id);
        expect(await billedTo(ctx.organizationId)).toBe(b);
    });

    it("a plan change while a switch waits is made on the profile it moves to", async () => {
        const { ctx, b } = await business();
        const renewsAt = new Date(Date.now() + 16 * DAY);
        await onPaidPlan(ctx, renewsAt, "c");
        await profiles.choose(ctx, b);
        const cheaper = await row("b");

        const change = await checkout.changePlan(ctx, {
            plan: "b",
            cycle: "month",
        });
        if (change.kind === "TO_FREE") throw new Error("expected a checkout");
        expect(change.quote.billingDetails.profile).toEqual({
            id: b,
            legalName: "Asha Fitness Pvt Ltd",
        });
        const open = await prisma.billingCheckout.findMany({
            where: {
                organizationId: ctx.organizationId,
                status: { in: ["OPEN", "SCHEDULED"] },
            },
        });
        expect(open).toHaveLength(1);
        expect(open[0]).toMatchObject({
            id: change.checkout.id,
            planId: cheaper.id,
            billingProfileId: b,
        });
        expect(fake.createCalls.at(-1)).toMatchObject({
            providerCustomerId: `fake_cus_${b}`,
        });

        await deliver(`fake_sub_${change.checkout.id}`, "authenticated");
        await sweep.sweep(new Date(renewsAt.getTime() + 1000));
        expect((await sub(ctx.organizationId)).planId).toBe(cheaper.id);
        expect(await billedTo(ctx.organizationId)).toBe(b);
    });
});

describe("a payment for a plan waiting", () => {
    it("refuses a switch with checkout-waiting, and starts nothing", async () => {
        const { ctx, a, b } = await business();
        const renewsAt = new Date(Date.now() + 16 * DAY);
        await onPaidPlan(ctx, renewsAt, "c");
        await checkout.changePlan(ctx, { plan: "b", cycle: "month" });
        const calls = fake.createCalls.length;

        await expect(profiles.choose(ctx, b)).rejects.toMatchObject({
            status: 409,
            response: {
                details: { field: "billingProfile", code: CHECKOUT_WAITING },
            },
        });
        expect(fake.createCalls).toHaveLength(calls);
        expect(await billedTo(ctx.organizationId)).toBe(a);
    });
});

describe("a profile the caller may not choose, on a paid business", () => {
    let customers = 0;
    let cancels = 0;

    /** What a refused choice must leave alone. */
    async function untouched(
        ctx: OrganizationContext,
        a: string,
        calls: number,
    ) {
        expect(fake.createCalls).toHaveLength(calls);
        expect(fake.customers.created).toHaveLength(customers);
        expect(fake.cancelCalls).toHaveLength(cancels);
        expect(
            await prisma.billingCheckout.count({
                where: {
                    organizationId: ctx.organizationId,
                    OR: [{ status: "OPEN" }, { kind: "SCHEDULED" }],
                },
            }),
        ).toBe(0);
        expect(await billedTo(ctx.organizationId)).toBe(a);
    }

    it("refuses another user's profile as not found, and starts nothing", async () => {
        const { ctx, a } = await business();
        await onPaidPlan(ctx, new Date(Date.now() + 16 * DAY));
        const stranger = await prisma.user.create({
            data: { email: `stranger-${seq}-${tag}@example.com` },
        });
        const theirs = await prisma.billingProfile.create({
            data: {
                ownerUserId: stranger.id,
                legalName: "Someone Else Pvt Ltd",
                billingEmail: `stranger-billing-${seq}-${tag}@example.com`,
                provider: "RAZORPAY",
            },
        });
        const calls = fake.createCalls.length;
        customers = fake.customers.created.length;
        cancels = fake.cancelCalls.length;

        await expect(profiles.choose(ctx, theirs.id)).rejects.toMatchObject({
            status: 404,
            response: { details: { field: "billingProfile" } },
        });
        await untouched(ctx, a, calls);
    });

    it("refuses an Admin (billing:read only) before any provider call", async () => {
        const { ctx, a, b } = await business();
        await onPaidPlan(ctx, new Date(Date.now() + 16 * DAY));
        const admin = await prisma.user.create({
            data: { email: `admin-${seq}-${tag}@example.com` },
        });
        await prisma.membership.create({
            data: {
                organizationId: ctx.organizationId,
                userId: admin.id,
                role: "ADMIN",
            },
        });
        const asAdmin: OrganizationContext = {
            organizationId: ctx.organizationId,
            userId: admin.id,
            role: "ADMIN",
            roleKey: "ADMIN",
            actions: resolveCapabilities("ADMIN", null, []),
        };
        expect([...asAdmin.actions!]).toContain("billing:read");
        expect([...asAdmin.actions!]).not.toContain("billing:manage");
        const calls = fake.createCalls.length;
        customers = fake.customers.created.length;
        cancels = fake.cancelCalls.length;

        await expect(profiles.choose(asAdmin, b)).rejects.toMatchObject({
            status: 403,
        });
        await untouched(ctx, a, calls);
    });
});
