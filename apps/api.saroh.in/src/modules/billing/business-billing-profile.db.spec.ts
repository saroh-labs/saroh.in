/**
 * A business's billing profile from its Plan & billing (DEC-167, U5),
 * through the service its controller calls, against a real Postgres:
 *
 * - the Owner sees the profile on the business in full and their own
 *   profiles; an Admin is refused before anything is read (AE6);
 * - another owner's profile on the business is its legal name only;
 * - choosing one of the caller's profiles applies at once on Free, is a
 *   409 `checkout-waiting` while a payment for a plan waits, and anyone
 *   else's is a 404 (a paid plan's switch at the renewal is
 *   `profile-switch.db.spec.ts`);
 * - a new profile made in place, used for the business or not, with the
 *   one-email-per-owner 409;
 * - an edit says how many businesses it changes (AE3), and is the
 *   caller's own profile only.
 *
 * Integration project (TEST_DATABASE_URL).
 */
import { ConflictException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { AuditAction, AuditService } from "../audit/audit.service";
import { resolveCapabilities } from "../organizations/organization-policy";
import { BILLING_PROFILE_SYNC_TYPE } from "./billing-profile-sync";
import {
    BILLING_EMAIL_TAKEN,
    BillingProfilesService,
} from "./billing-profiles.service";
import {
    BusinessBillingProfileService,
    CHECKOUT_WAITING,
    CHECKOUT_WAITING_MESSAGE,
} from "./business-billing-profile.service";
import { CheckoutService } from "./checkout.service";
import { PlansService } from "./plans.service";
import {
    FakeBillingProvider,
    FakeBillingProviderFactory,
} from "./providers/fake.provider";

const service = new BusinessBillingProfileService(
    new BillingProfilesService(),
    new CheckoutService(
        new PlansService(),
        new FakeBillingProviderFactory(new FakeBillingProvider("RAZORPAY")),
    ),
    new AuditService(),
);

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;

async function person() {
    return prisma.user.create({
        data: { email: `${uniq("owner-")}@example.com`, name: "Asha Rao" },
    });
}

async function profileOf(
    ownerUserId: string,
    over: { legalName?: string } = {},
) {
    return prisma.billingProfile.create({
        data: {
            ownerUserId,
            legalName: over.legalName ?? "Asha Foods LLP",
            gstin: "29ABCDE1234F1ZW",
            gstState: "29",
            addressLine1: "3 Hill Road",
            city: "Bengaluru",
            postalCode: "560038",
            billingEmail: `${uniq("accounts-")}@example.com`,
            provider: "RAZORPAY",
        },
    });
}

async function business(billingProfileId: string | null) {
    return prisma.organization.create({
        data: { name: "Asha's Kitchen", slug: uniq("asha-"), billingProfileId },
    });
}

function as(
    role: "OWNER" | "ADMIN",
    userId: string,
    organizationId: string,
): OrganizationContext {
    return {
        organizationId,
        userId,
        role,
        roleKey: role,
        actions: resolveCapabilities(role, null, []),
    };
}

/**
 * Put the business on a paid plan at the provider, with a payment for
 * another plan waiting to be authorised.
 */
async function onPaidPlanWithPaymentWaiting(organizationId: string) {
    const plan = await prisma.plan.create({
        data: {
            key: uniq("grow-"),
            name: "Grow",
            priceCents: 99900,
            entitlements: {},
        },
    });
    await prisma.subscription.create({
        data: {
            organizationId,
            planId: plan.id,
            status: "ACTIVE",
            provider: "RAZORPAY",
            providerSubscriptionId: uniq("sub_"),
            currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000),
        },
    });
    await prisma.billingCheckout.create({
        data: {
            organizationId,
            planId: plan.id,
            cycle: "month",
            kind: "UPGRADE",
            // Only a NEW checkout has no start (BillingCheckout_start_shape).
            startAt: new Date(),
            provider: "RAZORPAY",
            providerSubscriptionId: uniq("sub_"),
            providerPlanId: uniq("plan_"),
            pricePaise: 99900,
            expiresAt: new Date(Date.now() + 86_400_000),
        },
    });
}

const auditOf = (organizationId: string, action: string) =>
    prisma.auditEvent.findMany({ where: { organizationId, action } });

describe("reading who Saroh bills", () => {
    it("shows the Owner the business's profile in full, how many businesses it bills, and their own", async () => {
        const owner = await person();
        const a = await profileOf(owner.id);
        const b = await profileOf(owner.id, { legalName: "Asha Fitness" });
        const org = await business(a.id);
        await business(a.id);

        const view = await service.view(as("OWNER", owner.id, org.id));
        expect(view.current).toMatchObject({
            id: a.id,
            mine: true,
            legalName: "Asha Foods LLP",
            gstin: "29ABCDE1234F1ZW",
            billingEmail: a.billingEmail,
            businesses: 2,
        });
        expect(view.businessesOnCurrent).toBe(2);
        expect(view.mine.map((p) => p.id)).toEqual([a.id, b.id]);
    });

    it("refuses an Admin before reading anything: no profile, no list (AE6)", async () => {
        const owner = await person();
        const admin = await person();
        const org = await business((await profileOf(owner.id)).id);
        await profileOf(admin.id);

        await expect(
            service.view(as("ADMIN", admin.id, org.id)),
        ).rejects.toMatchObject({ status: 403 });
        await expect(
            service.choose(as("ADMIN", admin.id, org.id), "anything"),
        ).rejects.toMatchObject({ status: 403 });
    });

    it("names another owner's profile on the business by its legal name only", async () => {
        const first = await person();
        const second = await person();
        const theirs = await profileOf(first.id, { legalName: "Rao Holdings" });
        const mine = await profileOf(second.id);
        const org = await business(theirs.id);

        const view = await service.view(as("OWNER", second.id, org.id));
        expect(view.current).toEqual({
            legalName: "Rao Holdings",
            mine: false,
        });
        expect(view.businessesOnCurrent).toBeNull();
        expect(view.mine.map((p) => p.id)).toEqual([mine.id]);
    });

    it("says a business with no profile has none", async () => {
        const owner = await person();
        const org = await business(null);
        const view = await service.view(as("OWNER", owner.id, org.id));
        expect(view).toMatchObject({ current: null, mine: [] });
    });
});

describe("choosing a profile for the business", () => {
    it("applies at once on Free, and is audited by id", async () => {
        const owner = await person();
        const a = await profileOf(owner.id);
        const b = await profileOf(owner.id, { legalName: "Asha Fitness" });
        const org = await business(a.id);

        const view = await service.choose(as("OWNER", owner.id, org.id), b.id);
        expect(view).toMatchObject({
            current: { id: b.id, mine: true },
            outcome: "applied",
            authorise: null,
            pendingSwitch: null,
        });
        const after = await prisma.organization.findUniqueOrThrow({
            where: { id: org.id },
        });
        expect(after.billingProfileId).toBe(b.id);
        const events = await auditOf(org.id, AuditAction.BillingProfileChoose);
        expect(events).toHaveLength(1);
        expect(events[0]!.metadata).toEqual({
            from: a.id,
            to: b.id,
            via: "chosen",
        });
    });

    it("bills a business on another owner's profile to one of mine", async () => {
        const first = await person();
        const second = await person();
        const theirs = await profileOf(first.id);
        const mine = await profileOf(second.id);
        const org = await business(theirs.id);

        const view = await service.choose(
            as("OWNER", second.id, org.id),
            mine.id,
        );
        expect(view.current).toMatchObject({ id: mine.id, mine: true });
    });

    it("gives a business with none its first", async () => {
        const owner = await person();
        const a = await profileOf(owner.id);
        const org = await business(null);
        const view = await service.choose(as("OWNER", owner.id, org.id), a.id);
        expect(view.current).toMatchObject({ id: a.id });
    });

    it("refuses another user's profile as not found, and changes nothing", async () => {
        const owner = await person();
        const stranger = await person();
        const a = await profileOf(owner.id);
        const theirs = await profileOf(stranger.id);
        const org = await business(a.id);

        const tried = service.choose(as("OWNER", owner.id, org.id), theirs.id);
        await expect(tried).rejects.toBeInstanceOf(NotFoundException);
        await expect(tried).rejects.toMatchObject({
            response: { details: { field: "billingProfile" } },
        });
        const after = await prisma.organization.findUniqueOrThrow({
            where: { id: org.id },
        });
        expect(after.billingProfileId).toBe(a.id);
    });

    it("refuses with checkout-waiting while a payment for a plan waits, and changes nothing", async () => {
        const owner = await person();
        const a = await profileOf(owner.id);
        const b = await profileOf(owner.id, { legalName: "Asha Fitness" });
        const org = await business(a.id);
        await onPaidPlanWithPaymentWaiting(org.id);

        const tried = service.choose(as("OWNER", owner.id, org.id), b.id);
        await expect(tried).rejects.toBeInstanceOf(ConflictException);
        await expect(tried).rejects.toMatchObject({
            response: {
                message: CHECKOUT_WAITING_MESSAGE,
                details: { field: "billingProfile", code: CHECKOUT_WAITING },
            },
        });
        const after = await prisma.organization.findUniqueOrThrow({
            where: { id: org.id },
        });
        expect(after.billingProfileId).toBe(a.id);
        // The profile it is already on is no switch.
        await expect(
            service.choose(as("OWNER", owner.id, org.id), a.id),
        ).resolves.toMatchObject({ current: { id: a.id }, outcome: "none" });
    });
});

describe("a new profile made in place", () => {
    const typed = (billingEmail: string) => ({
        legalName: "Asha Fitness Pvt Ltd",
        billingEmail,
        addressLine1: "12 MG Road",
        city: "Pune",
        postalCode: "411001",
        gstState: "27",
    });

    it("is made for the caller, used for the business when asked, with its sync queued", async () => {
        const owner = await person();
        const a = await profileOf(owner.id);
        const org = await business(a.id);

        const view = await service.create(
            as("OWNER", owner.id, org.id),
            typed(`${uniq("fit-")}@example.com`),
            true,
        );
        expect(view.current).toMatchObject({
            id: view.created,
            mine: true,
            legalName: "Asha Fitness Pvt Ltd",
        });
        const made = await prisma.billingProfile.findUniqueOrThrow({
            where: { id: view.created },
        });
        expect(made.ownerUserId).toBe(owner.id);
        const jobs = await prisma.job.findMany({
            where: {
                type: BILLING_PROFILE_SYNC_TYPE,
                payload: { path: ["billingProfileId"], equals: view.created },
            },
        });
        expect(jobs).toHaveLength(1);
        expect(
            await auditOf(org.id, AuditAction.BillingProfileCreate),
        ).toHaveLength(1);
    });

    it("leaves the business where it was without `use`", async () => {
        const owner = await person();
        const a = await profileOf(owner.id);
        const org = await business(a.id);
        const view = await service.create(
            as("OWNER", owner.id, org.id),
            typed(`${uniq("fit-")}@example.com`),
            false,
        );
        expect(view.current).toMatchObject({ id: a.id });
        expect(view.mine.map((p) => p.id)).toContain(view.created);
    });

    it("refuses a billing email the owner already uses, naming the field (AE1)", async () => {
        const owner = await person();
        const a = await profileOf(owner.id);
        const org = await business(a.id);
        const tried = service.create(
            as("OWNER", owner.id, org.id),
            typed(a.billingEmail.toUpperCase()),
            true,
        );
        await expect(tried).rejects.toBeInstanceOf(ConflictException);
        await expect(tried).rejects.toMatchObject({
            response: {
                message: BILLING_EMAIL_TAKEN,
                details: { field: "billingEmail" },
            },
        });
        expect(
            await prisma.billingProfile.count({
                where: { ownerUserId: owner.id },
            }),
        ).toBe(1);
    });

    it("used for a business with a payment waiting, is refused whole: no profile is left", async () => {
        const owner = await person();
        const a = await profileOf(owner.id);
        const org = await business(a.id);
        await onPaidPlanWithPaymentWaiting(org.id);
        await expect(
            service.create(
                as("OWNER", owner.id, org.id),
                typed(`${uniq("fit-")}@example.com`),
                true,
            ),
        ).rejects.toMatchObject({
            response: { details: { code: CHECKOUT_WAITING } },
        });
        expect(
            await prisma.billingProfile.count({
                where: { ownerUserId: owner.id },
            }),
        ).toBe(1);
    });
});

describe("editing a profile", () => {
    it("says how many businesses it changes (AE3), and audits field names only", async () => {
        const owner = await person();
        const a = await profileOf(owner.id);
        const org = await business(a.id);
        await business(a.id);
        await business(a.id);

        const saved = await service.update(
            as("OWNER", owner.id, org.id),
            a.id,
            {
                addressLine1: "4 Lake View",
                city: undefined,
            },
        );
        expect(saved.businesses).toBe(3);
        expect(saved.profile).toMatchObject({ addressLine1: "4 Lake View" });
        const events = await auditOf(org.id, AuditAction.BillingProfileUpdate);
        expect(events[0]!.metadata).toEqual({
            fields: ["addressLine1"],
            businesses: 3,
        });
    });

    it("refuses another user's profile as not found", async () => {
        const owner = await person();
        const other = await person();
        const org = await business((await profileOf(owner.id)).id);
        const theirs = await profileOf(other.id);
        await expect(
            service.update(as("OWNER", owner.id, org.id), theirs.id, {
                city: "Pune",
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("refuses a billing email another of the owner's profiles uses", async () => {
        const owner = await person();
        const a = await profileOf(owner.id);
        const b = await profileOf(owner.id);
        const org = await business(a.id);
        await expect(
            service.update(as("OWNER", owner.id, org.id), a.id, {
                billingEmail: b.billingEmail,
            }),
        ).rejects.toMatchObject({
            response: { details: { field: "billingEmail" } },
        });
    });

    it("refuses an Admin", async () => {
        const owner = await person();
        const a = await profileOf(owner.id);
        const org = await business(a.id);
        await expect(
            service.update(as("ADMIN", owner.id, org.id), a.id, {
                city: "Pune",
            }),
        ).rejects.toMatchObject({ status: 403 });
    });
});
