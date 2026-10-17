/**
 * Who Saroh bills, before it charges or sets up autopay (owner, 17 Oct
 * 2026; `billing-details.ts`), against a real Postgres through the fake
 * billing provider: the quote says what is missing; a paid checkout of any
 * kind (a first month, a new plan, a year paid once) is refused by field
 * before anything is made at the provider; what was missing and given is
 * kept — the address and state on the profile, an email or phone on the
 * checkout — and billed with.
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

import { giveBillingDetails } from "../../../test/business-details";
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
    it("says what is missing, and that there's no phone", async () => {
        const ctx = await bare();
        const q = await checkout.quote(ctx, { plan: "c", cycle: "month" });
        expect(q.registeredAddress).toBe(false);
        expect(q.billingDetails).toEqual({
            missing: ["email", "address", "state"],
            phone: false,
        });

        const whole = await bare();
        await giveBillingDetails(whole.organizationId);
        const w = await checkout.quote(whole, { plan: "c", cycle: "month" });
        expect(w.registeredAddress).toBe(true);
        expect(w.billingDetails).toEqual({ missing: [], phone: false });
    });
});

describe("a paid checkout is refused until who Saroh bills is whole", () => {
    it("names each missing field in turn, and nothing is made at the provider or kept", async () => {
        const nameless = await bare(" ");
        expect(
            await refusedField(nameless, { plan: "c", cycle: "month" }),
        ).toBe("billingName");

        const ctx = await bare();
        const base = { plan: "c", cycle: "month" as const };
        expect(await refusedField(ctx, base)).toBe("billingEmail");
        const withEmail = { ...base, billingEmail: "accounts@example.com" };
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
            await prisma.businessProfile.findUnique({
                where: { organizationId: ctx.organizationId },
            }),
        ).toBeNull();
    });

    it("the first month (TRIAL) and a year paid once (an order) are refused the same way", async () => {
        const ctx = await bare();
        const first = await checkout.quote(ctx, { plan: "b", cycle: "month" });
        expect(first.kind).toBe("TRIAL");
        expect(await refusedField(ctx, { plan: "b", cycle: "month" })).toBe(
            "billingEmail",
        );
        expect(await refusedField(ctx, { plan: "c", cycle: "year" })).toBe(
            "billingEmail",
        );
        expect(fake.createCalls).toHaveLength(0);
        expect(fake.orders.created).toHaveLength(0);
    });

    it("a business with it all is asked nothing, and nothing of its own is written over", async () => {
        const ctx = await bare();
        await giveBillingDetails(ctx.organizationId);
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
            await prisma.businessProfile.findUniqueOrThrow({
                where: { organizationId: ctx.organizationId },
            }),
        ).toMatchObject({
            legalName: null,
            addressLine1: "3 Hill Road",
            city: "Bengaluru",
            postalCode: "560038",
            gstState: "29",
        });
        expect(
            await prisma.billingCheckout.findUniqueOrThrow({
                where: { id: r.checkout.id },
            }),
        ).toMatchObject({ billToEmail: null, billToPhone: null });
    });
});

describe("what a checkout was given", () => {
    it("keeps the address and state on the profile, the email and phone on the checkout, and bills with them", async () => {
        const ctx = await bare();
        const r = await checkout.changePlan(ctx, {
            plan: "c",
            cycle: "month",
            billingState: "Maharashtra",
            billingEmail: "Accounts@Example.com",
            phone: "+91 98450 12345",
            registeredAddress: ADDRESS,
        });
        if (r.kind === "TO_FREE") throw new Error("unreachable");
        expect(r.quote.registeredAddress).toBe(true);
        expect(r.quote.billingDetails).toEqual({ missing: [], phone: true });

        expect(
            await prisma.businessProfile.findUniqueOrThrow({
                where: { organizationId: ctx.organizationId },
            }),
        ).toMatchObject({
            addressLine1: "4 Mill Road",
            city: "Pune",
            postalCode: "411001",
            gstState: "27",
            // The website's phone and contact email stay the business's own.
            phone: null,
            contactEmail: null,
        });
        expect(
            await prisma.billingCheckout.findUniqueOrThrow({
                where: { id: r.checkout.id },
            }),
        ).toMatchObject({
            billToEmail: "accounts@example.com",
            billToPhone: "+919845012345",
            billToState: "27",
        });
        expect(fake.createCalls[0]?.customer).toMatchObject({
            name: "Bare Shop",
            email: "accounts@example.com",
            contact: "+919845012345",
            address: { line1: "4 Mill Road", state: "Maharashtra" },
        });
        // The address and state are the business's now; an email given at
        // checkout is that checkout's, so the next one asks again.
        const again = await checkout.quote(ctx, { plan: "c", cycle: "month" });
        expect(again.billingDetails.missing).toEqual(["email"]);
    });

    it("a legal name given when the business has no name is kept as its legal name", async () => {
        const ctx = await bare(" ");
        await giveBillingDetails(ctx.organizationId);
        await checkout.changePlan(ctx, {
            plan: "c",
            cycle: "month",
            billingName: "Mill Road Traders LLP",
        });
        expect(
            await prisma.businessProfile.findUniqueOrThrow({
                where: { organizationId: ctx.organizationId },
            }),
        ).toMatchObject({ legalName: "Mill Road Traders LLP" });
        expect(fake.createCalls[0]?.customer).toMatchObject({
            name: "Mill Road Traders LLP",
        });
    });
});
