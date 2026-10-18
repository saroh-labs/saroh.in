/**
 * Who Saroh bills, before it charges or sets up autopay (owner, 17 Oct
 * 2026; `billing-details.ts`): the business's billing profile (DEC-167),
 * against a real Postgres through the fake billing provider. The quote
 * says what is missing; a paid checkout of any kind (a first month, a new
 * plan, a year paid once) is refused by field before anything is made at
 * the provider — first of all when the business has no profile; what was
 * missing and given is kept on the profile, never on Settings › Business,
 * and billed with.
 *
 * Made-up catalogue (`fakeCatalog`), businesses and addresses. Runs in the
 * integration project (TEST_DATABASE_URL).
 */
import {
    prisma,
    startOnFreePlan,
    writeCatalogueVersion,
} from "@saroh/database";
import type { Catalog } from "@saroh/pricing-catalog";
import { planRows } from "@saroh/pricing-catalog";

import {
    giveBillingDetails,
    giveBusinessDetails,
} from "../../../test/business-details";
import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import type { OrganizationContext } from "../../common/types/organization-context";
import { CheckoutService } from "./checkout.service";
import { PlansService } from "./plans.service";
import {
    FakeBillingProvider,
    FakeBillingProviderFactory,
} from "./providers/fake.provider";

const DAY = 24 * 60 * 60 * 1000;
const tag = `${process.pid}-${Date.now()}`;

/** Made up: Plan B has a 30-day first month at 7; yearly is offered. */
const TERMS = (): Catalog =>
    fakeCatalog((c) => {
        c.plans[1]!.trial = { on: true, days: 30, firstPaise: 700 };
        c.yearly = { on: true, paid: 10 };
    });

let fake: FakeBillingProvider;
let checkout: CheckoutService;

beforeEach(async () => {
    fake = new FakeBillingProvider("RAZORPAY", "whsec_fake");
    checkout = new CheckoutService(
        new PlansService(),
        new FakeBillingProviderFactory(fake),
    );
    await prisma.job.deleteMany({});
    await prisma.organization.updateMany({
        where: { slug: { startsWith: "bdet-" } },
        data: { billingProfileId: null },
    });
    await prisma.billingProfile.deleteMany({
        where: { owner: { email: { startsWith: "bdet-owner-" } } },
    });
    await prisma.billingCheckout.deleteMany({});
    await prisma.subscription.deleteMany({});
    await prisma.pricingProviderPlan.deleteMany({});
    await prisma.pricingCatalogVersion.deleteMany({});
    await prisma.plan.deleteMany({});
    const catalog = TERMS();
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
/** A business on Free with nothing on its profile; its owner has no account. */
async function bare(name = "Bare Shop"): Promise<OrganizationContext> {
    seq += 1;
    const org = await prisma.organization.create({
        data: { name, slug: `bdet-${seq}-${tag}` },
    });
    await startOnFreePlan(prisma, org.id, { planId: "free" });
    return { organizationId: org.id, userId: "no-such-user", role: "OWNER" };
}

/**
 * A business billed to a profile of its owner's with only a legal name
 * and an email (`over` changes them): no address, state or phone.
 */
async function onProfile(
    name = "Bare Shop",
    over: { legalName?: string; billingEmail?: string } = {},
): Promise<OrganizationContext & { profileId: string }> {
    const ctx = await bare(name);
    const owner = await prisma.user.create({
        data: { email: `bdet-owner-${seq}-${tag}@example.com`, name: "Asha" },
    });
    const profile = await prisma.billingProfile.create({
        data: {
            ownerUserId: owner.id,
            legalName: over.legalName ?? "Mill Road Traders LLP",
            billingEmail: over.billingEmail ?? "accounts@example.com",
            provider: "RAZORPAY",
        },
    });
    await prisma.organization.update({
        where: { id: ctx.organizationId },
        data: { billingProfileId: profile.id },
    });
    return { ...ctx, userId: owner.id, profileId: profile.id };
}

const fieldOf = (e: unknown) =>
    (
        e as { getResponse?: () => { details?: { field?: string } } }
    ).getResponse?.()?.details?.field;

async function refusedField(
    ctx: OrganizationContext,
    input: Parameters<CheckoutService["changePlan"]>[1],
): Promise<string | undefined> {
    const error: unknown = await checkout.changePlan(ctx, input).then(
        () => null,
        (e: unknown) => e,
    );
    expect(error).toMatchObject({ status: 400 });
    return fieldOf(error);
}

const ADDRESS = {
    line1: "4 Mill Road",
    city: "Pune",
    postalCode: "411 001",
};

describe("the quote", () => {
    it("says a business with no billing profile must be given one", async () => {
        const ctx = await bare();
        const q = await checkout.quote(ctx, { plan: "c", cycle: "month" });
        expect(q.registeredAddress).toBe(false);
        expect(q.billingDetails).toEqual({
            profile: null,
            missing: ["profile"],
            phone: false,
        });
    });

    it("says what the profile is missing, and names it", async () => {
        const ctx = await onProfile();
        const q = await checkout.quote(ctx, { plan: "c", cycle: "month" });
        expect(q.billingDetails).toEqual({
            profile: { id: ctx.profileId, legalName: "Mill Road Traders LLP" },
            missing: ["address", "state"],
            phone: false,
        });

        const whole = await bare();
        await giveBillingDetails(whole.organizationId);
        const w = await checkout.quote(whole, { plan: "c", cycle: "month" });
        expect(w.registeredAddress).toBe(true);
        expect(w.billingDetails).toMatchObject({ missing: [], phone: false });
    });
});

describe("a paid checkout is refused until who Saroh bills is whole", () => {
    it("a business with no billing profile is refused with `billing-profile`, even with every detail given", async () => {
        const ctx = await bare();
        // Its own seller details whole: they are not Saroh's bill-to.
        await giveBusinessDetails(ctx.organizationId);
        const error: unknown = await checkout
            .changePlan(ctx, {
                plan: "c",
                cycle: "month",
                billingName: "Bare Shop",
                billingEmail: "accounts@example.com",
                billingState: "Maharashtra",
                registeredAddress: ADDRESS,
            })
            .then(
                () => null,
                (e: unknown) => e,
            );
        expect(error).toMatchObject({
            status: 400,
            response: {
                message: "Choose who Saroh bills for this business first.",
                details: { field: "billing-profile", missing: ["profile"] },
            },
        });
        expect(fake.createCalls).toHaveLength(0);
        expect(
            await prisma.billingProfile.count({
                where: { organizations: { some: { id: ctx.organizationId } } },
            }),
        ).toBe(0);
    });

    it("names each missing field in turn, and nothing is made at the provider or kept", async () => {
        const nameless = await onProfile(" ", { legalName: " " });
        expect(
            await refusedField(nameless, { plan: "c", cycle: "month" }),
        ).toBe("billingName");

        // A profile always has its billing email (a CHECK holds it), so
        // the first thing a bare profile lacks is its address.
        const ctx = await onProfile("Bare Shop");
        const withEmail = { plan: "c", cycle: "month" as const };
        expect(await refusedField(ctx, withEmail)).toBe("addressLine1");
        expect(
            await refusedField(ctx, {
                ...withEmail,
                registeredAddress: { line1: "4 Mill Road", city: "Pune" },
            }),
        ).toBe("postalCode");
        const withAddress = { ...withEmail, registeredAddress: ADDRESS };
        expect(await refusedField(ctx, withAddress)).toBe("billingState");
        expect(
            await refusedField(ctx, {
                ...withAddress,
                billingState: "Maharashtra",
                phone: "98450",
            }),
        ).toBe("phone");

        expect(fake.createCalls).toHaveLength(0);
        expect(fake.orders.created).toHaveLength(0);
        expect(
            await prisma.billingCheckout.count({
                where: { organizationId: ctx.organizationId },
            }),
        ).toBe(0);
        expect(
            await prisma.billingProfile.findUniqueOrThrow({
                where: { id: ctx.profileId },
            }),
        ).toMatchObject({
            billingEmail: "accounts@example.com",
            addressLine1: null,
            gstState: null,
        });
    });

    it("the first month (TRIAL) and a year paid once (an order) are refused the same way", async () => {
        const ctx = await onProfile();
        const first = await checkout.quote(ctx, { plan: "b", cycle: "month" });
        expect(first.kind).toBe("TRIAL");
        expect(await refusedField(ctx, { plan: "b", cycle: "month" })).toBe(
            "addressLine1",
        );
        expect(await refusedField(ctx, { plan: "c", cycle: "year" })).toBe(
            "addressLine1",
        );
        expect(fake.createCalls).toHaveLength(0);
        expect(fake.orders.created).toHaveLength(0);
    });

    it("a business with it all is asked nothing, and nothing of its own is written over", async () => {
        const ctx = await bare();
        const profileId = await giveBillingDetails(ctx.organizationId);
        const before = await prisma.billingProfile.findUniqueOrThrow({
            where: { id: profileId },
        });
        const r = await checkout.changePlan(ctx, {
            plan: "c",
            cycle: "month",
            billingName: "Someone Else",
            billingEmail: "someone@example.com",
            registeredAddress: {
                line1: "9 Other Road",
                city: "Delhi",
                postalCode: "110001",
            },
        });
        if (r.kind === "TO_FREE") throw new Error("unreachable");
        expect(fake.createCalls).toHaveLength(1);
        expect(
            await prisma.billingProfile.findUniqueOrThrow({
                where: { id: profileId },
            }),
        ).toMatchObject({
            legalName: before.legalName,
            billingEmail: before.billingEmail,
            addressLine1: "3 Hill Road",
            city: "Bengaluru",
            postalCode: "560038",
            gstState: "29",
        });
        expect(
            await prisma.billingCheckout.findUniqueOrThrow({
                where: { id: r.checkout.id },
            }),
        ).toMatchObject({
            billingProfileId: profileId,
            billToEmail: null,
            billToPhone: null,
        });
    });
});

describe("what a checkout was given", () => {
    it("is saved on the billing profile, never on Settings › Business, and billed with", async () => {
        const ctx = await onProfile();
        // The business's own seller details, which Saroh doesn't bill.
        await prisma.businessProfile.create({
            data: {
                organizationId: ctx.organizationId,
                legalName: "Bare Shop Retail",
                phone: "+919800000000",
            },
        });
        const r = await checkout.changePlan(ctx, {
            plan: "c",
            cycle: "month",
            billingState: "Maharashtra",
            phone: "+91 98450 12345",
            registeredAddress: ADDRESS,
        });
        if (r.kind === "TO_FREE") throw new Error("unreachable");
        expect(r.quote.registeredAddress).toBe(true);
        expect(r.quote.billingDetails).toMatchObject({
            missing: [],
            phone: true,
        });

        expect(
            await prisma.billingProfile.findUniqueOrThrow({
                where: { id: ctx.profileId },
            }),
        ).toMatchObject({
            addressLine1: "4 Mill Road",
            city: "Pune",
            postalCode: "411001",
            gstState: "27",
            phone: "+919845012345",
        });
        expect(
            await prisma.businessProfile.findUniqueOrThrow({
                where: { organizationId: ctx.organizationId },
            }),
        ).toMatchObject({
            legalName: "Bare Shop Retail",
            addressLine1: null,
            gstState: null,
            phone: "+919800000000",
        });
        expect(
            await prisma.billingCheckout.findUniqueOrThrow({
                where: { id: r.checkout.id },
            }),
        ).toMatchObject({
            billingProfileId: ctx.profileId,
            billToEmail: null,
            billToPhone: null,
            billToState: "27",
        });
        // The profile's customer is brought up to date.
        expect(
            await prisma.job.count({
                where: {
                    type: "billing.profile.sync",
                    payload: {
                        path: ["billingProfileId"],
                        equals: ctx.profileId,
                    },
                },
            }),
        ).toBe(1);
        expect(fake.createCalls[0]?.customer).toMatchObject({
            name: "Mill Road Traders LLP",
            email: "accounts@example.com",
            contact: "+919845012345",
            address: { line1: "4 Mill Road", state: "Maharashtra" },
            billingProfileId: ctx.profileId,
        });
        // Whole now: the next checkout asks nothing.
        const again = await checkout.quote(ctx, { plan: "c", cycle: "month" });
        expect(again.billingDetails.missing).toEqual([]);
    });

    it("a legal name given when the profile and the business have none is kept on the profile", async () => {
        const ctx = await onProfile(" ", { legalName: " " });
        await prisma.billingProfile.update({
            where: { id: ctx.profileId },
            data: {
                addressLine1: "3 Hill Road",
                city: "Bengaluru",
                postalCode: "560038",
                gstState: "29",
            },
        });
        await checkout.changePlan(ctx, {
            plan: "c",
            cycle: "month",
            billingName: "Mill Road Traders LLP",
        });
        expect(
            await prisma.billingProfile.findUniqueOrThrow({
                where: { id: ctx.profileId },
            }),
        ).toMatchObject({ legalName: "Mill Road Traders LLP" });
        expect(
            await prisma.businessProfile.findUnique({
                where: { organizationId: ctx.organizationId },
            }),
        ).toBeNull();
        expect(fake.createCalls[0]?.customer).toMatchObject({
            name: "Mill Road Traders LLP",
        });
    });
});
