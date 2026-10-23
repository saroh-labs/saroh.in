/**
 * Edges of who Saroh bills (DEC-167), found in review (18 Oct 2026),
 * against a real Postgres through the fake billing provider:
 *
 * - A profile deleted with its owner's account before the renewal that
 *   moves the business to it, or bills it: the renewal still takes over
 *   the new subscription, never points the business at a profile that is
 *   gone (no foreign-key failure), and raises one notice. Deleting the
 *   account raises one notice per business billed to, or with a payment
 *   on, one of their profiles, and isn't refused.
 * - A switch is refused while a coupon still comes off charges to come
 *   (409 `discount-running`, naming the date); once used, it goes ahead.
 * - A business with no profile on a renewing plan: choosing one applies at
 *   once (there is nothing to move from), and an upgrade then goes ahead.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { createHmac } from "node:crypto";

import { Logger } from "@nestjs/common";
import {
    prisma,
    startOnFreePlan,
    writeCatalogueVersion,
} from "@saroh/database";
import { planRows } from "@saroh/pricing-catalog";

import { giveBillingDetails } from "../../../test/business-details";
import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import type { OrganizationContext } from "../../common/types/organization-context";
import { AuditService } from "../audit/audit.service";
import { resolveCapabilities } from "../organizations/organization-policy";
import {
    BILLING_PROFILE_OWNER_LEFT,
    noticeProfilesOfDeletedOwnerInTx,
} from "./billing-profile-owner";
import { BillingProfilesService } from "./billing-profiles.service";
import { BillingWebhookService } from "./billing-webhook.service";
import { BusinessBillingProfileService } from "./business-billing-profile.service";
import { periodEnd } from "./checkout-quote";
import { CheckoutService } from "./checkout.service";
import { BILLING_PROFILE_GONE } from "./plan-moves";
import { PlansService } from "./plans.service";
import { DISCOUNT_RUNNING, discountRunningMessage } from "./profile-switch";
import type { BillingEventPhase } from "./providers/billing-provider.port";
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
let checkout: CheckoutService;
let webhooks: BillingWebhookService;
let profiles: BusinessBillingProfileService;

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
    await prisma.billingAction.deleteMany({});
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
});

let seq = 0;

const ownerCtx = (
    organizationId: string,
    userId: string,
): OrganizationContext => ({
    organizationId,
    userId,
    role: "OWNER",
    roleKey: "OWNER",
    actions: resolveCapabilities("OWNER", null, []),
});

/** A whole profile Saroh can bill, owned by `ownerUserId`. */
async function profileOf(ownerUserId: string, legalName: string) {
    seq += 1;
    const p = await prisma.billingProfile.create({
        data: {
            ownerUserId,
            legalName,
            gstin: "27ABCDE1234F1Z5",
            gstState: "27",
            addressLine1: "12 MG Road",
            city: "Pune",
            postalCode: "411001",
            billingEmail: `profile-${seq}-${tag}@example.com`,
            provider: "RAZORPAY",
        },
    });
    return p.id;
}

/**
 * A business on Free billed to profile A, whose owner is `ctx`; B is the
 * same owner's other profile. With `coOwner`, a second owner (Yash) with a
 * profile of his own, P.
 */
async function business() {
    seq += 1;
    const org = await prisma.organization.create({
        data: { name: `Edge ${seq}`, slug: `edge-${seq}-${tag}` },
    });
    await startOnFreePlan(prisma, org.id, { planId: "free" });
    const a = await giveBillingDetails(org.id);
    const { ownerUserId } = await prisma.billingProfile.findUniqueOrThrow({
        where: { id: a },
    });
    const b = await profileOf(ownerUserId, "Asha Fitness Pvt Ltd");
    return { ctx: ownerCtx(org.id, ownerUserId), a, b };
}

async function coOwner(organizationId: string) {
    seq += 1;
    const yash = await prisma.user.create({
        data: { email: `yash-${seq}-${tag}@example.com`, name: "Yash" },
    });
    await prisma.membership.create({
        data: { organizationId, userId: yash.id, role: "OWNER" },
    });
    const p = await profileOf(yash.id, "Yash Ventures LLP");
    return { yash: yash.id, p, ctx: ownerCtx(organizationId, yash.id) };
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
            providerEventId: `evt_edge_${evt}_${tag}`,
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
    prisma.subscription.findUniqueOrThrow({ where: { organizationId } });

const billedTo = async (organizationId: string) =>
    (
        await prisma.organization.findUniqueOrThrow({
            where: { id: organizationId },
        })
    ).billingProfileId;

const actions = (organizationId: string) =>
    prisma.billingAction.findMany({ where: { organizationId } });

const silent = { error: () => undefined } as unknown as Logger;

describe("a profile deleted with its owner's account before the renewal", () => {
    it("a switch to it: the renewal takes the new subscription over, leaves the business on its profile, and raises one notice", async () => {
        const { ctx, a } = await business();
        const y = await coOwner(ctx.organizationId);
        const renewsAt = new Date(Date.now() + 16 * DAY);
        await onPaidPlan(ctx, renewsAt);

        // Yash moves the business to his profile at the renewal, and
        // authorises it.
        const chosen = await profiles.choose(y.ctx, y.p);
        expect(chosen.outcome).toBe("scheduled");
        const switchRow = await prisma.billingCheckout.findFirstOrThrow({
            where: { organizationId: ctx.organizationId, status: "OPEN" },
        });
        const newRef = switchRow.providerSubscriptionId;
        await deliver(newRef, "authenticated");

        // Then he deletes his account; his profile goes with it.
        await prisma.user.delete({ where: { id: y.yash } });
        expect(
            await prisma.billingProfile.findUnique({ where: { id: y.p } }),
        ).toBeNull();

        await expect(
            deliver(newRef, "charged", {
                currentPeriodEnd: new Date(renewsAt.getTime() + 30 * DAY),
                now: new Date(renewsAt.getTime() + 60_000),
            }),
        ).resolves.toBeDefined();
        expect(await sub(ctx.organizationId)).toMatchObject({
            providerSubscriptionId: newRef,
            pendingPlanId: null,
        });
        expect(
            (
                await prisma.billingCheckout.findUniqueOrThrow({
                    where: { id: switchRow.id },
                })
            ).status,
        ).toBe("COMPLETED");
        expect(await billedTo(ctx.organizationId)).toBe(a);
        const raised = await actions(ctx.organizationId);
        expect(raised).toHaveLength(1);
        expect(raised[0]).toMatchObject({
            code: BILLING_PROFILE_GONE,
            refs: { billingProfileId: y.p, checkoutId: switchRow.id },
        });
    });

    it("a change made on the profile billing it: applied with the business on no profile, and one notice", async () => {
        const { ctx } = await business();
        const y = await coOwner(ctx.organizationId);
        // Free, so Yash's profile bills it at once.
        expect((await profiles.choose(y.ctx, y.p)).outcome).toBe("applied");
        const renewsAt = new Date(Date.now() + 16 * DAY);
        await onPaidPlan(y.ctx, renewsAt, "c");
        const change = await checkout.changePlan(y.ctx, {
            plan: "b",
            cycle: "month",
        });
        if (change.kind === "TO_FREE") throw new Error("expected a checkout");
        expect(change.kind).toBe("SCHEDULED");
        const ref = `fake_sub_${change.checkout.id}`;
        await deliver(ref, "authenticated");
        expect(
            (
                await prisma.billingCheckout.findUniqueOrThrow({
                    where: { id: change.checkout.id },
                })
            ).billingProfileId,
        ).toBe(y.p);

        await prisma.user.delete({ where: { id: y.yash } });
        expect(await billedTo(ctx.organizationId)).toBeNull();

        await deliver(ref, "charged", {
            currentPeriodEnd: new Date(renewsAt.getTime() + 30 * DAY),
            now: new Date(renewsAt.getTime() + 60_000),
        });
        const after = await sub(ctx.organizationId);
        expect(after.providerSubscriptionId).toBe(ref);
        expect(after.pendingPlanId).toBeNull();
        expect(await billedTo(ctx.organizationId)).toBeNull();
        const raised = await actions(ctx.organizationId);
        expect(raised.map((r) => r.code)).toEqual([BILLING_PROFILE_GONE]);
    });

    it("deleting the account raises one notice per business billed to, or with a payment on, one of the profiles, and isn't refused", async () => {
        // Business 1 is billed to Yash's profile; business 2 has a switch
        // to it waiting; business 3 has nothing on it.
        const one = await business();
        const y = await coOwner(one.ctx.organizationId);
        expect((await profiles.choose(y.ctx, y.p)).outcome).toBe("applied");

        const two = await business();
        await prisma.membership.create({
            data: {
                organizationId: two.ctx.organizationId,
                userId: y.yash,
                role: "OWNER",
            },
        });
        await onPaidPlan(two.ctx, new Date(Date.now() + 16 * DAY));
        expect(
            (
                await profiles.choose(
                    ownerCtx(two.ctx.organizationId, y.yash),
                    y.p,
                )
            ).outcome,
        ).toBe("scheduled");

        const three = await business();
        await prisma.membership.create({
            data: {
                organizationId: three.ctx.organizationId,
                userId: y.yash,
                role: "OWNER",
            },
        });

        const raised = await prisma.$transaction((tx) =>
            noticeProfilesOfDeletedOwnerInTx(tx, silent, y.yash),
        );
        expect(raised.sort()).toEqual(
            [one.ctx.organizationId, two.ctx.organizationId].sort(),
        );
        await prisma.user.delete({ where: { id: y.yash } });

        expect(await actions(one.ctx.organizationId)).toEqual([
            expect.objectContaining({
                code: BILLING_PROFILE_OWNER_LEFT,
                refs: expect.objectContaining({
                    billingProfileId: y.p,
                    userId: y.yash,
                }),
            }),
        ]);
        expect(await actions(two.ctx.organizationId)).toEqual([
            expect.objectContaining({ code: BILLING_PROFILE_OWNER_LEFT }),
        ]);
        expect(await actions(three.ctx.organizationId)).toEqual([]);
        expect(await billedTo(one.ctx.organizationId)).toBeNull();
        expect(await billedTo(two.ctx.organizationId)).toBe(two.a);

        // Raised again (a retried deletion): still one each.
        await prisma.$transaction((tx) =>
            noticeProfilesOfDeletedOwnerInTx(tx, silent, y.yash),
        );
        expect(await actions(one.ctx.organizationId)).toHaveLength(1);
    });
});

describe("a switch while a coupon still comes off charges to come", () => {
    /**
     * The live subscription's checkout given a coupon with `left`
     * discounted charges still to come, past the charges already
     * invoiced.
     */
    async function discounted(organizationId: string, left: number) {
        const s = await sub(organizationId);
        const taken = await prisma.sarohInvoice.count({
            where: {
                organizationId,
                providerSubscriptionId: s.providerSubscriptionId!,
            },
        });
        const charges = taken + left;
        seq += 1;
        const coupon =
            charges > 0
                ? await prisma.pricingCoupon.create({
                      data: {
                          code: `EDGE-${seq}-${process.pid}`,
                          discountPaise: 111,
                          months: charges,
                          planIds: ["b", "c"],
                          maxRedemptions: 5,
                          razorpayOfferId: "offer_ABCDEFGHIJKLMN",
                      },
                  })
                : null;
        await prisma.billingCheckout.update({
            where: {
                provider_providerSubscriptionId: {
                    provider: s.provider!,
                    providerSubscriptionId: s.providerSubscriptionId!,
                },
            },
            data: {
                couponId: coupon?.id ?? null,
                discountPaise: coupon ? 111 : 0,
                discountCharges: charges,
            },
        });
        return charges;
    }

    it("is refused with discount-running, naming when the discount ends, and starts nothing", async () => {
        const { ctx, a, b } = await business();
        const renewsAt = new Date(Date.now() + 16 * DAY);
        await onPaidPlan(ctx, renewsAt);
        await discounted(ctx.organizationId, 2);
        // Two discounted charges left, from the renewal: the discount
        // pays for the periods to the renewal after next.
        const until = periodEnd(periodEnd(renewsAt, "month"), "month");
        const calls = fake.createCalls.length;

        await expect(profiles.choose(ctx, b)).rejects.toMatchObject({
            status: 409,
            response: {
                message: discountRunningMessage(until),
                details: { field: "billingProfile", code: DISCOUNT_RUNNING },
            },
        });
        expect(discountRunningMessage(until)).toMatch(
            /^Your discount runs until \d{1,2} \w+ \d{4}\. You can move to another billing profile after that\.$/,
        );
        expect(fake.createCalls).toHaveLength(calls);
        expect(await billedTo(ctx.organizationId)).toBe(a);
        expect(
            await prisma.billingCheckout.count({
                where: { organizationId: ctx.organizationId, status: "OPEN" },
            }),
        ).toBe(0);
    });

    it("goes ahead once the discounted charges are used", async () => {
        const { ctx, b } = await business();
        await onPaidPlan(ctx, new Date(Date.now() + 16 * DAY));
        // The first charge, already taken, was the only discounted one.
        expect(await discounted(ctx.organizationId, 0)).toBeGreaterThan(0);

        expect((await profiles.choose(ctx, b)).outcome).toBe("scheduled");
    });
});

describe("a business with no profile on a renewing plan", () => {
    it("is billed to the profile chosen at once, and an upgrade then goes ahead", async () => {
        const { ctx, b } = await business();
        await onPaidPlan(ctx, new Date(Date.now() + 16 * DAY));
        // The data move left it none (another GST identity).
        await prisma.organization.update({
            where: { id: ctx.organizationId },
            data: { billingProfileId: null },
        });
        const upgrade = await checkout.quote(ctx, {
            plan: "c",
            cycle: "month",
        });
        expect(upgrade.billingDetails.profile).toBeNull();
        const calls = fake.createCalls.length;

        const chosen = await profiles.choose(ctx, b);
        expect(chosen.outcome).toBe("applied");
        expect(await billedTo(ctx.organizationId)).toBe(b);
        expect(fake.createCalls).toHaveLength(calls);
        expect(
            await prisma.billingCheckout.count({
                where: {
                    organizationId: ctx.organizationId,
                    status: { in: ["OPEN", "SCHEDULED"] },
                },
            }),
        ).toBe(0);

        const quoted = await checkout.quote(ctx, { plan: "c", cycle: "month" });
        expect(quoted.billingDetails.profile).toEqual({
            id: b,
            legalName: "Asha Fitness Pvt Ltd",
        });
        const made = await checkout.changePlan(ctx, {
            plan: "c",
            cycle: "month",
        });
        if (made.kind === "TO_FREE") throw new Error("expected a checkout");
        expect(made.kind).toBe("UPGRADE");
        expect(
            await prisma.billingCheckout.findUniqueOrThrow({
                where: { id: made.checkout.id },
            }),
        ).toMatchObject({ billingProfileId: b });
    });
});
