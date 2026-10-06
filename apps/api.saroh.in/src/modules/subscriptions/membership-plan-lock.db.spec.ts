/**
 * Memberships and the business's Saroh plan against a real Postgres (6 Oct
 * 2026: memberships are a paid feature, checked at set-up). On a plan
 * without the `subscriptions` row: creating a membership plan, starting or
 * publishing a draft and selling an archived plan again are 403
 * `MODULE_LOCKED`; changing wording and archiving still work; the site
 * lists no plans; staff can't add a member; and the members the business
 * already has keep renewing (ADR-003). On a plan with the row, and with
 * `PLAN_ENFORCEMENT` off, nothing changes.
 *
 * A business "after a downgrade" is made directly on the smaller plan with
 * its plans and members written as rows, as they were before it moved.
 * Catalogue rows are made up (`fakePaymentsCatalog`). Runs in the
 * integration project (TEST_DATABASE_URL).
 */
import { ForbiddenException } from "@nestjs/common";
import { prisma, writeCatalogueVersion } from "@saroh/database";
import { planRows } from "@saroh/pricing-catalog";

import { giveBusinessDetails } from "../../../test/business-details";
import { fakePaymentsCatalog } from "../../../test/fixtures/pricing-catalog";
import type { OrganizationContext } from "../../common/types/organization-context";
import { MODULE_LOCKED } from "../billing/plan-limit-errors";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { FlagKey } from "../feature-flags/flags";
import { InvoicesService } from "../invoices/invoices.service";
import { PublicPlansService } from "./public-plans.service";
import { SubscriptionsService } from "./subscriptions.service";

const tag = `${process.pid}-${Date.now()}`;
const V = 850_000 + Math.floor(Math.random() * 9_000);
const DAY = 86_400_000;
let seq = 0;
const uniq = (p: string) => `${p}-${++seq}-${tag}`;

const service = new SubscriptionsService(new InvoicesService());
const publicPlans = new PublicPlansService(new FixedWindowRateLimiter(1_000));

interface Business {
    orgId: string;
    siteId: string;
    owner: OrganizationContext;
}

async function planRow(planId: string) {
    return prisma.plan.findUniqueOrThrow({
        where: {
            key_version_interval: {
                key: `catalog.${planId}`,
                version: V,
                interval: "month",
            },
        },
    });
}

async function flagOn(key: string, organizationId: string, enabled = true) {
    await prisma.featureFlag.upsert({
        where: { key },
        create: { key, enabledByDefault: false },
        update: {},
    });
    await prisma.featureFlagOverride.create({
        data: { flagKey: key, organizationId, enabled },
    });
}

/** A business on `planId`@V with Payments on, a site and its details. */
async function business(planId: string, enforce = true): Promise<Business> {
    const org = await prisma.organization.create({
        data: { name: "Pulse Studio", slug: uniq("memberships-plan") },
    });
    const user = await prisma.user.create({
        data: { email: `${uniq("owner")}@example.test` },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: user.id, role: "OWNER" },
    });
    await prisma.subscription.create({
        data: {
            organizationId: org.id,
            planId: (await planRow(planId)).id,
            status: "ACTIVE",
        },
    });
    await flagOn(FlagKey.PLAN_ENFORCEMENT, org.id, enforce);
    await flagOn("MODULE_PAYMENTS", org.id);
    await prisma.organizationModule.create({
        data: {
            organizationId: org.id,
            moduleKey: "PAYMENTS",
            status: "ENABLED",
        },
    });
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: "UTC" },
    });
    await giveBusinessDetails(org.id);
    const site = await prisma.site.create({
        data: { organizationId: org.id, name: "Site", slug: uniq("site") },
    });
    return {
        orgId: org.id,
        siteId: site.id,
        owner: { organizationId: org.id, userId: user.id, role: "OWNER" },
    };
}

/** A plan as it was written before the business moved plan. */
async function planAsBefore(
    b: Business,
    name: string,
    status: "ACTIVE" | "DRAFT" | "ARCHIVED" = "ACTIVE",
) {
    return (
        await prisma.subscriptionPlan.create({
            data: {
                organizationId: b.orgId,
                name,
                price: "1200",
                currency: "INR",
                interval: "MONTH",
                status,
            },
        })
    ).id;
}

/** A member already on the plan, with a period that has just ended. */
async function memberDue(b: Business, planId: string) {
    const contact = await prisma.contact.create({
        data: { organizationId: b.orgId, email: `${uniq("m")}@example.com` },
    });
    const start = new Date(Date.now() - 40 * DAY);
    return prisma.customerSubscription.create({
        data: {
            organizationId: b.orgId,
            contactId: contact.id,
            planId,
            price: "1200",
            currency: "INR",
            interval: "MONTH",
            timezone: "UTC",
            anchorAt: start,
            currentPeriodStart: start,
            currentPeriodEnd: new Date(Date.now() - DAY),
            status: "ACTIVE",
        },
    });
}

const WHOLE = {
    price: "1500",
    currency: "INR",
    interval: "MONTH" as const,
};

async function locked(p: Promise<unknown>) {
    const err = await p.then(
        () => null,
        (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({
        details: { code: MODULE_LOCKED, moduleId: "subscriptions" },
    });
}

beforeAll(async () => {
    const catalog = fakePaymentsCatalog();
    await writeCatalogueVersion(prisma, {
        version: V,
        catalog,
        goLiveAt: new Date(Date.now() - DAY),
        policy: "keep",
        planRows: planRows(catalog, V),
    });
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe("on a plan without memberships, after a downgrade (DB)", () => {
    it("refuses a new plan, a new draft, publishing a draft and selling again", async () => {
        const b = await business("free");
        const draftId = await planAsBefore(b, "Drop-in", "DRAFT");
        const archivedId = await planAsBefore(b, "Old yearly", "ARCHIVED");

        await locked(service.createPlan(b.owner, { name: "New", ...WHOLE }));
        await locked(service.createPlanDraft(b.owner, { name: "Weekly" }));
        await prisma.subscriptionPlan.update({
            where: { id: draftId },
            data: { price: "900" },
        });
        const draft = await service.getPlanEditor(b.owner, draftId);
        await locked(service.publishPlan(b.owner, draftId, draft.revision));
        await locked(service.setPlanStatus(b.owner, archivedId, "ACTIVE"));

        const rows = await prisma.subscriptionPlan.findMany({
            where: { organizationId: b.orgId },
            select: { name: true, status: true },
            orderBy: { name: "asc" },
        });
        expect(rows).toEqual([
            { name: "Drop-in", status: "DRAFT" },
            { name: "Old yearly", status: "ARCHIVED" },
        ]);
    });

    it("lets the business change a plan's wording and archive it", async () => {
        const b = await business("free");
        const id = await planAsBefore(b, "Monthly");

        await service.updatePlan(b.owner, id, { description: "Mornings" });
        const editor = await service.savePlanDraft(b.owner, id, {
            revision: (await service.getPlanEditor(b.owner, id)).revision,
            name: "Monthly (mornings)",
        });
        await service.publishPlan(b.owner, id, editor.revision);
        await service.setPlanStatus(b.owner, id, "ARCHIVED");

        expect(
            await prisma.subscriptionPlan.findUniqueOrThrow({
                where: { id },
                select: { name: true, description: true, status: true },
            }),
        ).toEqual({
            name: "Monthly (mornings)",
            description: "Mornings",
            status: "ARCHIVED",
        });
    });

    it("takes the plans off the site, and staff can't add a member", async () => {
        const b = await business("free");
        const planId = await planAsBefore(b, "Monthly");
        const contact = await prisma.contact.create({
            data: {
                organizationId: b.orgId,
                email: `${uniq("c")}@example.com`,
            },
        });

        await expect(publicPlans.list(b.siteId, uniq("v"))).resolves.toEqual({
            plans: [],
            payOnline: false,
            autopayMethods: [],
            offered: false,
        });
        await locked(
            service.subscribe(b.owner, { contactId: contact.id, planId }),
        );
    });

    it("keeps renewing the members it already has (ADR-003)", async () => {
        const b = await business("free");
        const planId = await planAsBefore(b, "Monthly");
        const member = await memberDue(b, planId);

        await expect(service.renewOne(member.id, new Date())).resolves.toBe(
            "renewed",
        );
        const after = await prisma.customerSubscription.findUniqueOrThrow({
            where: { id: member.id },
            select: { status: true, currentPeriodEnd: true },
        });
        expect(after.status).toBe("ACTIVE");
        expect(after.currentPeriodEnd.getTime()).toBeGreaterThan(Date.now());
        expect(
            await prisma.invoice.count({
                where: { organizationId: b.orgId, subscriptionId: member.id },
            }),
        ).toBe(1);
    });
});

describe("on a plan with memberships, or with enforcement off (DB)", () => {
    it.each([
        ["grow", true],
        ["free", false],
    ] as const)(
        "on %s (enforcing: %s) makes, publishes and lists plans as before",
        async (planId, enforce) => {
            const b = await business(planId, enforce);
            await service.createPlan(b.owner, { name: "Monthly", ...WHOLE });
            const draft = await service.createPlanDraft(b.owner, {
                name: "Weekly",
                price: "400",
            });
            await service.publishPlan(b.owner, draft.id, draft.revision);

            const read = await publicPlans.list(b.siteId, uniq("v"));
            expect(read.offered).toBe(true);
            expect(read.plans.map((p) => p.name).sort()).toEqual([
                "Monthly",
                "Weekly",
            ]);
        },
    );
});
