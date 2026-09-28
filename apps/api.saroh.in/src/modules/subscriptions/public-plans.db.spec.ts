/**
 * The Plans block's read (round-2 G9) against a real Postgres: only plans on
 * sale, with their published values (never a DRAFT, an ARCHIVED plan or a
 * live plan's unpublished changes), nothing while Payments is off or not
 * rolled out, another business's plans never, and the per-visitor limit.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { HttpException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { PublicPlansService } from "./public-plans.service";

const tag = `${process.pid}-${Date.now()}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;

// Generous: these tests read many times from one "visitor".
const service = new PublicPlansService(new FixedWindowRateLimiter(1_000));

async function expectNotFound(p: Promise<unknown>) {
    await expect(p).rejects.toBeInstanceOf(NotFoundException);
}

/** A business with a site; Payments rolled out and on unless said. */
async function business(
    over: {
        rolledOut?: boolean;
        payments?: "ENABLED" | "DISABLED" | null;
    } = {},
) {
    const org = await prisma.organization.create({
        data: { name: "Plans", slug: uniq("g9-org") },
    });
    if (over.rolledOut !== false) {
        // The flag's own row first (off for everyone): an override
        // references it, and a fresh test schema has none.
        await prisma.featureFlag.upsert({
            where: { key: "MODULE_PAYMENTS" },
            create: { key: "MODULE_PAYMENTS", enabledByDefault: false },
            update: {},
        });
        await prisma.featureFlagOverride.create({
            data: {
                flagKey: "MODULE_PAYMENTS",
                organizationId: org.id,
                enabled: true,
            },
        });
    }
    const status = over.payments === undefined ? "ENABLED" : over.payments;
    if (status) {
        await prisma.organizationModule.create({
            data: { organizationId: org.id, moduleKey: "PAYMENTS", status },
        });
    }
    const site = await prisma.site.create({
        data: { organizationId: org.id, name: "Site", slug: uniq("g9-site") },
    });
    return { organizationId: org.id, siteId: site.id };
}

async function plan(
    organizationId: string,
    name: string,
    price: string,
    over: {
        status?: string;
        description?: string;
        interval?: string;
        pendingChanges?: Record<string, unknown>;
    } = {},
) {
    return (
        await prisma.subscriptionPlan.create({
            data: {
                organizationId,
                name,
                price,
                currency: "INR",
                interval: over.interval ?? "MONTH",
                status: over.status ?? "ACTIVE",
                description: over.description ?? null,
                ...(over.pendingChanges
                    ? {
                          pendingChanges: over.pendingChanges,
                          pendingChangedAt: new Date(),
                      }
                    : {}),
            },
        })
    ).id;
}

async function members(organizationId: string, planId: string, n: number) {
    for (let i = 0; i < n; i++) {
        const contact = await prisma.contact.create({
            data: { organizationId, email: `${uniq("g9-member")}@example.com` },
        });
        await prisma.customerSubscription.create({
            data: {
                organizationId,
                contactId: contact.id,
                planId,
                price: "0",
                currency: "INR",
                interval: "MONTH",
                timezone: "Asia/Kolkata",
                anchorAt: new Date(),
                currentPeriodStart: new Date(),
                currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
            },
        });
    }
}

describe("GET public/sites/:siteId/plans (G9, real database)", () => {
    it("lists two active plans in order, the most chosen first and marked", async () => {
        const { organizationId, siteId } = await business();
        const weekly = await plan(organizationId, "Weekly loaf", "350", {
            interval: "WEEK",
            description: "One sourdough every Saturday.",
        });
        const monthly = await plan(organizationId, "Monthly box", "1200");
        await members(organizationId, monthly, 2);
        await members(organizationId, weekly, 1);

        const { plans } = await service.list(siteId, "visitor");
        expect(plans).toEqual([
            {
                id: monthly,
                name: "Monthly box",
                description: null,
                price: "1200.00",
                currency: "INR",
                interval: "MONTH",
                mostChosen: true,
            },
            {
                id: weekly,
                name: "Weekly loaf",
                description: "One sourdough every Saturday.",
                price: "350.00",
                currency: "INR",
                interval: "WEEK",
                mostChosen: false,
            },
        ]);
    });

    it("says whether Join works: only with a provider that opens a checkout (G20)", async () => {
        const { organizationId, siteId } = await business();
        await plan(organizationId, "Monthly", "1200");
        expect((await service.list(siteId, "visitor")).payOnline).toBe(false);

        // A Razorpay connection still missing its public key can't open one.
        const provider = await prisma.merchantPaymentProvider.create({
            data: {
                organizationId,
                provider: "RAZORPAY",
                status: "CONNECTED",
                encryptedCredentials: "x",
                credentialsIv: "x",
                credentialsAuthTag: "x",
            },
        });
        expect((await service.list(siteId, "visitor")).payOnline).toBe(false);

        await prisma.merchantPaymentProvider.update({
            where: { id: provider.id },
            data: { publicKey: "rzp_test_G20" },
        });
        const read = await service.list(siteId, "visitor");
        expect(read.payOnline).toBe(true);
        // Never how: no provider or payment method is named (DEC-059).
        expect(Object.keys(read).sort()).toEqual(["payOnline", "plans"]);
    });

    it("a cancelled member doesn't count towards Most chosen", async () => {
        const { organizationId, siteId } = await business();
        const a = await plan(organizationId, "A", "100");
        const b = await plan(organizationId, "B", "200");
        await members(organizationId, b, 1);
        await prisma.customerSubscription.updateMany({
            where: { planId: b },
            data: { status: "CANCELLED" },
        });
        const { plans } = await service.list(siteId, "visitor");
        expect(plans.map((p) => p.id)).toEqual([a, b]);
        expect(plans.some((p) => p.mostChosen)).toBe(false);
    });

    it("never serves a Draft, and a live plan's pending changes stay unpublished", async () => {
        const { organizationId, siteId } = await business();
        await plan(organizationId, "Unlimited (draft)", "2500", {
            status: "DRAFT",
        });
        const live = await plan(organizationId, "Monthly", "1200", {
            description: "Published words",
            pendingChanges: {
                name: "Monthly plus",
                price: "1500.00",
                description: "Unpublished words",
            },
        });

        const { plans } = await service.list(siteId, "visitor");
        expect(plans).toHaveLength(1);
        expect(plans[0]).toMatchObject({
            id: live,
            name: "Monthly",
            price: "1200.00",
            description: "Published words",
        });
        expect(JSON.stringify(plans)).not.toMatch(/draft|plus|Unpublished/i);
    });

    it("never serves an archived plan", async () => {
        const { organizationId, siteId } = await business();
        await plan(organizationId, "Old monthly", "900", {
            status: "ARCHIVED",
        });
        expect(await service.list(siteId, "visitor")).toEqual({
            plans: [],
            payOnline: false,
        });
    });

    it("with Payments switched off → 404, whatever plans exist", async () => {
        const { organizationId, siteId } = await business({
            payments: "DISABLED",
        });
        await plan(organizationId, "Monthly", "1200");
        await expectNotFound(service.list(siteId, "visitor"));
    });

    it("with Payments never switched on → 404", async () => {
        const { organizationId, siteId } = await business({ payments: null });
        await plan(organizationId, "Monthly", "1200");
        await expectNotFound(service.list(siteId, "visitor"));
    });

    it("with Payments not rolled out for the business → 404 (DEC-057)", async () => {
        const { organizationId, siteId } = await business({
            rolledOut: false,
        });
        await plan(organizationId, "Monthly", "1200");
        await expectNotFound(service.list(siteId, "visitor"));
    });

    it("serves only the site's own business's plans", async () => {
        const mine = await business();
        const theirs = await business();
        const own = await plan(mine.organizationId, "Mine", "100");
        await plan(theirs.organizationId, "Theirs", "100");
        const { plans } = await service.list(mine.siteId, "visitor");
        expect(plans.map((p) => p.id)).toEqual([own]);
    });

    it("an unknown or deleted site → 404", async () => {
        await expectNotFound(service.list("no-such-site", "visitor"));
        const { siteId } = await business();
        await prisma.site.update({
            where: { id: siteId },
            data: { deletedAt: new Date() },
        });
        await expectNotFound(service.list(siteId, "visitor"));
    });

    it("limits a visitor who reads too often → 429", async () => {
        const { siteId } = await business();
        const tight = new PublicPlansService(new FixedWindowRateLimiter(2));
        await tight.list(siteId, "busy");
        await tight.list(siteId, "busy");
        const third = tight.list(siteId, "busy");
        await expect(third).rejects.toBeInstanceOf(HttpException);
        await expect(tight.list(siteId, "busy")).rejects.toMatchObject({
            status: 429,
        });
        // Another visitor is still served.
        await expect(tight.list(siteId, "calm")).resolves.toEqual({
            plans: [],
            payOnline: false,
        });
    });
});
