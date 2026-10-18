/**
 * A billing profile's details stay its owner's (DEC-167, R2) on the reads
 * Plan & billing makes with `billing:read`, against a real Postgres
 * through the fake billing provider:
 *
 * - an Admin's `GET checkout` carries no handoff (the provider window's
 *   prefill and notes hold the profile's email, phone, GSTIN and address),
 *   and an Admin's quote names no profile;
 * - a co-owner paying for a business billed to another owner's profile
 *   gets a handoff with no email or phone, and notes naming only the
 *   profile and the business; the profile's owner gets all of it.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import {
    prisma,
    startOnFreePlan,
    writeCatalogueVersion,
} from "@saroh/database";
import { planRows } from "@saroh/pricing-catalog";

import { giveBillingDetails } from "../../../test/business-details";
import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import type { OrganizationContext } from "../../common/types/organization-context";
import { resolveCapabilities } from "../organizations/organization-policy";
import { CheckoutService } from "./checkout.service";
import { PlansService } from "./plans.service";
import {
    FakeBillingProvider,
    FakeBillingProviderFactory,
} from "./providers/fake.provider";

const DAY = 24 * 60 * 60 * 1000;
const tag = `${process.pid}-${Date.now()}`;

let checkout: CheckoutService;

beforeEach(async () => {
    const fake = new FakeBillingProvider("RAZORPAY");
    fake.publicKeyValue = "rzp_test_fake";
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

const ctxOf = (
    organizationId: string,
    userId: string,
    role: "OWNER" | "ADMIN",
): OrganizationContext => ({
    organizationId,
    userId,
    role,
    roleKey: role,
    actions: resolveCapabilities(role, null, []),
});

/**
 * A Free business billed to its owner Asha's profile, with a phone and a
 * GSTIN, a co-owner (Yash) and an Admin (Dev).
 */
async function business() {
    seq += 1;
    const org = await prisma.organization.create({
        data: { name: `Private ${seq}`, slug: `private-${seq}-${tag}` },
    });
    await startOnFreePlan(prisma, org.id, { planId: "free" });
    const profileId = await giveBillingDetails(org.id);
    const profile = await prisma.billingProfile.update({
        where: { id: profileId },
        data: { phone: "+919800000001", gstin: "29ABCDE1234F1Z5" },
    });
    const person = (label: string) =>
        prisma.user.create({
            data: { email: `${label}-${seq}-${tag}@example.com`, name: label },
        });
    const yash = await person("yash");
    const dev = await person("dev");
    await prisma.membership.createMany({
        data: [
            { organizationId: org.id, userId: yash.id, role: "OWNER" },
            { organizationId: org.id, userId: dev.id, role: "ADMIN" },
        ],
    });
    return {
        profile,
        asha: ctxOf(org.id, profile.ownerUserId, "OWNER"),
        yash: ctxOf(org.id, yash.id, "OWNER"),
        admin: ctxOf(org.id, dev.id, "ADMIN"),
    };
}

/** A checkout waiting for authorisation, made by `ctx`. */
async function waiting(ctx: OrganizationContext) {
    const r = await checkout.changePlan(ctx, { plan: "b", cycle: "month" });
    if (r.kind === "TO_FREE") throw new Error("expected a checkout");
    return r;
}

describe("an Admin reading Plan & billing", () => {
    it("gets the checkout waiting with no handoff, where its owner gets one", async () => {
        const { asha, admin, profile } = await business();
        await waiting(asha);

        const owners = await checkout.current(asha);
        expect(owners.open?.handoff).toMatchObject({
            prefill: { email: profile.billingEmail, contact: "+919800000001" },
            notes: expect.objectContaining({ gstin: "29ABCDE1234F1Z5" }),
        });

        const admins = await checkout.current(admin);
        expect(admins.open).not.toBeNull();
        expect(admins.open?.handoff).toBeNull();
        expect(JSON.stringify(admins)).not.toContain(profile.billingEmail);
    });

    it("gets a quote naming no billing profile, where an owner's names it", async () => {
        const { asha, admin, profile } = await business();

        const owners = await checkout.quote(asha, {
            plan: "b",
            cycle: "month",
        });
        expect(owners.billingDetails.profile).toEqual({
            id: profile.id,
            legalName: profile.legalName,
        });

        const admins = await checkout.quote(admin, {
            plan: "b",
            cycle: "month",
        });
        expect(admins.billingDetails.profile).toBeNull();
        expect(admins.billingDetails.missing).toEqual(
            owners.billingDetails.missing,
        );
    });
});

describe("a co-owner paying on another owner's profile", () => {
    it("gets a handoff with no email or phone, and notes naming only the profile and the business", async () => {
        const { yash, profile } = await business();
        const made = await waiting(yash);
        expect(made.handoff).toMatchObject({
            prefill: { email: null, contact: null },
        });

        const read = await checkout.current(yash);
        const handoff = read.open?.handoff;
        expect(handoff).toMatchObject({
            keyId: "rzp_test_fake",
            prefill: { email: null, contact: null },
        });
        expect(Object.keys(handoff?.notes ?? {}).sort()).toEqual([
            "billing_profile_id",
            "saroh_business",
        ]);
        expect(handoff?.notes).toMatchObject({
            billing_profile_id: profile.id,
        });
        expect(JSON.stringify(read)).not.toContain(profile.billingEmail);
        expect(JSON.stringify(read)).not.toContain("29ABCDE1234F1Z5");
    });
});
