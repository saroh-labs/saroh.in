/**
 * A custom offer's dry run and Take away a module… against a real Postgres
 * (admin console U5, R5, #993): each kind's preview and the write that
 * confirms it, the preview writing nothing, and the refusals the sheet
 * shows in words (a provider-billed price, an end past the cap, a reason
 * under four characters, a price without pricing:publish, a trial that
 * isn't running, a module their paid plan includes).
 *
 * Every catalogue is the made-up `fakeLegacyMappedCatalog` (Plan A/B/C);
 * a custom price is random per run. Runs in the integration project
 * (TEST_DATABASE_URL), plain and with TEST_RLS=on.
 */
import { prisma, writeCatalogueVersion } from "@saroh/database";
import type { Catalog } from "@saroh/pricing-catalog";
import { planRows } from "@saroh/pricing-catalog";

import { fakeLegacyMappedCatalog } from "../../../test/fixtures/pricing-catalog";
import { CatalogueAccessService } from "../billing/catalogue-access.service";
import { EntitlementService } from "../billing/entitlement.service";
import type { ModuleLifecycleService } from "../capabilities/module-lifecycle.service";
import { AdminAuditService } from "./admin-audit.service";
import { AdminLifecycleService } from "./admin-lifecycle.service";
import { AdminOverridesService } from "./admin-overrides.service";
import { AdminPermission, AdminRole } from "./admin-permissions";

const tag = `${process.pid}-${Date.now()}`;
const DAY = 24 * 60 * 60 * 1000;
const V = 1;

const access = new CatalogueAccessService();
const service = new AdminOverridesService(new AdminAuditService(), access);
const lifecycle = new AdminLifecycleService(
    new AdminAuditService(),
    {} as ModuleLifecycleService,
    new EntitlementService(access),
);

let staffId: string;
const staff = (
    permissions: string[] = [
        AdminPermission.PricingOverride,
        AdminPermission.PricingPublish,
        AdminPermission.SubscriptionOverride,
    ],
    roles: string[] = [],
) =>
    ({
        userId: staffId,
        platformAdminId: "pa",
        roles,
        permissions,
        viaBootstrap: false,
    }) as never;
const owner = () => staff(undefined, [AdminRole.PlatformOwner]);
/** Billing's grants: overrides and subscriptions, never publish. */
const billing = () =>
    staff(
        [AdminPermission.PricingOverride, AdminPermission.SubscriptionOverride],
        [AdminRole.Billing],
    );

let seq = 0;
async function org(name: string) {
    seq += 1;
    return prisma.organization.create({
        data: { name, slug: `ovp-${seq}-${tag}` },
    });
}

async function subscribe(
    organizationId: string,
    planId: string,
    over: {
        provider?: string;
        status?: "ACTIVE" | "TRIALING";
        currentPeriodEnd?: Date;
    } = {},
) {
    const plan = await prisma.plan.findUniqueOrThrow({
        where: {
            key_version_interval: {
                key: `catalog.${planId}`,
                version: V,
                interval: "month",
            },
        },
    });
    return prisma.subscription.create({
        data: {
            organizationId,
            planId: plan.id,
            status: over.status ?? "ACTIVE",
            provider: over.provider ?? null,
            currentPeriodEnd: over.currentPeriodEnd ?? null,
        },
    });
}

async function install(catalog: Catalog) {
    await writeCatalogueVersion(prisma, {
        version: V,
        catalog,
        goLiveAt: new Date(Date.now() - DAY),
        policy: "keep",
        planRows: planRows(catalog, V),
    });
}

const inDays = (days: number) =>
    new Date(Date.now() + days * DAY).toISOString();

/** Everything a write would leave behind, to show a preview left none. */
async function footprint(organizationId: string) {
    const [overrides, ledger, own, jobs, sub] = await Promise.all([
        prisma.entitlementOverride.count({ where: { organizationId } }),
        prisma.adminAuditEvent.count({ where: { organizationId } }),
        prisma.auditEvent.count({ where: { organizationId } }),
        prisma.job.count({ where: { organizationId } }),
        prisma.subscription.findUnique({
            where: { organizationId },
            select: { planId: true, status: true, currentPeriodEnd: true },
        }),
    ]);
    return { overrides, ledger, own, jobs, sub };
}

const write = (organizationId: string, extra: Record<string, unknown>) =>
    ({
        staff: owner(),
        organizationId,
        reason: "fake reason",
        ...extra,
    }) as never;

describe("custom offers: the dry run and its confirm (DB, admin U5)", () => {
    beforeAll(async () => {
        staffId = (
            await prisma.user.create({
                data: { email: `offers-${tag}@example.com`, name: "Staff" },
            })
        ).id;
        await install(fakeLegacyMappedCatalog());
    });

    afterEach(async () => {
        const mine = await prisma.organization.findMany({
            where: { slug: { endsWith: tag } },
            select: { id: true },
        });
        const ids = mine.map((m) => m.id);
        await prisma.auditEvent.deleteMany({
            where: { organizationId: { in: ids } },
        });
        await prisma.adminAuditEvent.deleteMany({
            where: { organizationId: { in: ids } },
        });
        await prisma.job.deleteMany({ where: { organizationId: { in: ids } } });
        await prisma.organization.deleteMany({
            where: { slug: { endsWith: tag } },
        });
    });

    it("previews a plan until a date, and the confirm puts it there", async () => {
        const o = await org("Plan offer");
        await subscribe(o.id, "free");
        const until = inDays(30);

        const preview = await service.preview(owner(), o.id, {
            kind: "plan",
            planKey: "pro",
            expiresAt: until,
        });

        expect(preview).toMatchObject({
            kind: "plan",
            endsAt: until,
            subject: "Plan C",
            then: "Plan A",
        });
        expect(preview.changes[0]).toEqual({
            type: "plan",
            from: "Plan A",
            to: "Plan C",
        });
        expect(preview.changes).toContainEqual(
            expect.objectContaining({
                type: "module",
                moduleId: "invoicing",
                to: "on",
            }),
        );

        await service.setPlan(
            write(o.id, { planKey: "pro", expiresAt: until }),
        );
        const a = await access.resolve(o.id);
        expect(a.source === "catalogue" && a.planId).toBe("pro");
    });

    it("previews a custom price, and the confirm sets it", async () => {
        const o = await org("Price offer");
        await subscribe(o.id, "grow");
        const pricePaise = 100 + Math.floor(Math.random() * 9_000);

        const preview = await service.preview(owner(), o.id, {
            kind: "price",
            pricePaise,
        });

        expect(preview).toMatchObject({ kind: "price", endsAt: null });
        expect(preview.changes).toEqual([
            {
                type: "price",
                fromPaise: fakeLegacyMappedCatalog().plans[1].pricePaise,
                toPaise: pricePaise,
            },
        ]);
        await service.setPrice(write(o.id, { pricePaise }));
        const a = await access.resolve(o.id);
        expect(a.source === "catalogue" && a.pricePaise).toBe(pricePaise);
    });

    it("previews one module granted, and the confirm grants it", async () => {
        const o = await org("Module offer");
        await subscribe(o.id, "free");

        const preview = await service.preview(owner(), o.id, {
            kind: "module",
            moduleKey: "invoicing",
            expiresAt: inDays(10),
        });

        expect(preview).toMatchObject({ kind: "module", subject: "Bills" });
        expect(preview.changes).toEqual([
            {
                type: "module",
                moduleId: "invoicing",
                name: "Bills",
                from: "locked",
                to: "on",
            },
        ]);
        await service.setModuleOverride(
            write(o.id, { kind: "grant", moduleKey: "invoicing" }),
        );
        await expect(
            service.preview(owner(), o.id, {
                kind: "module",
                moduleKey: "invoicing",
            }),
        ).rejects.toMatchObject({ status: 409 });
    });

    it("previews a higher limit, and the confirm raises it to the same end", async () => {
        const o = await org("Limit offer");
        await subscribe(o.id, "grow");
        const before = await access.resolve(o.id);
        const plan = before.planEntitlements.products as number;
        const value = plan + 1 + Math.floor(Math.random() * 50);

        const preview = await service.preview(owner(), o.id, {
            kind: "limit",
            moduleKey: "products",
            value,
            expiresAt: inDays(20),
        });

        expect(preview).toMatchObject({ kind: "limit", days: 20 });
        expect(preview.changes).toEqual([
            expect.objectContaining({
                type: "limit",
                key: "products",
                from: plan,
                to: value,
            }),
        ]);
        const raised = await lifecycle.raiseLimit(
            write(o.id, { key: "products", value, days: preview.days }),
        );
        expect(
            Math.abs(
                raised.expiresAt!.getTime() -
                    new Date(preview.endsAt!).getTime(),
            ),
        ).toBeLessThan(60_000);

        await expect(
            service.preview(owner(), o.id, {
                kind: "limit",
                moduleKey: "products",
                value: plan,
                expiresAt: inDays(20),
            }),
        ).rejects.toMatchObject({ status: 400 });
    });

    it("previews a longer trial, and the confirm ends it when the preview said", async () => {
        const o = await org("Trial offer");
        const ends = new Date(Date.now() + 5 * DAY);
        await subscribe(o.id, "grow", {
            status: "TRIALING",
            currentPeriodEnd: ends,
        });

        const preview = await service.preview(owner(), o.id, {
            kind: "trial",
            expiresAt: new Date(ends.getTime() + 7 * DAY).toISOString(),
        });

        expect(preview).toMatchObject({ kind: "trial", days: 7 });
        expect(preview.changes).toEqual([
            {
                type: "trial",
                from: ends.toISOString(),
                to: preview.endsAt,
            },
        ]);
        const r = await lifecycle.trial(write(o.id, { days: preview.days }));
        expect(r.endsAt.toISOString()).toBe(preview.endsAt);
    });

    it("writes nothing: no override, no ledger row, no job, no subscription change", async () => {
        const o = await org("Dry run");
        await subscribe(o.id, "free", {
            status: "TRIALING",
            currentPeriodEnd: new Date(Date.now() + 3 * DAY),
        });
        const before = await footprint(o.id);

        await service.preview(owner(), o.id, {
            kind: "plan",
            planKey: "grow",
            expiresAt: inDays(9),
        });
        await service.preview(owner(), o.id, {
            kind: "module",
            moduleKey: "bookings",
        });
        await service.preview(owner(), o.id, {
            kind: "trial",
            expiresAt: inDays(9),
        });
        await service.preview(owner(), o.id, {
            kind: "price",
            pricePaise: 1 + Math.floor(Math.random() * 999),
        });
        await service.offers(owner(), o.id);

        expect(await footprint(o.id)).toEqual(before);
    });

    it("refuses a custom price on a provider-billed plan, with the reason", async () => {
        const o = await org("Provider billed");
        await subscribe(o.id, "grow", { provider: "razorpay" });

        await expect(
            service.preview(owner(), o.id, { kind: "price", pricePaise: 1 }),
        ).rejects.toMatchObject({
            status: 409,
            message: expect.stringMatching(/billed through razorpay/),
        });
        const options = await service.offers(owner(), o.id);
        expect(options.kinds.price).toEqual({
            available: false,
            why: expect.stringMatching(/billed through razorpay/),
        });
    });

    it("refuses an end date beyond the cap", async () => {
        const o = await org("Too far");
        await subscribe(o.id, "free");

        await expect(
            service.preview(owner(), o.id, {
                kind: "plan",
                planKey: "grow",
                expiresAt: inDays(6 * 366),
            }),
        ).rejects.toMatchObject({
            status: 400,
            message: expect.stringMatching(/within five years/),
        });
        await expect(
            service.preview(owner(), o.id, {
                kind: "limit",
                moduleKey: "products",
                value: 999,
                expiresAt: inDays(400),
            }),
        ).rejects.toMatchObject({
            status: 400,
            message: expect.stringMatching(/at most 365 days/),
        });
    });

    it("refuses a reason under four characters on the confirm", async () => {
        const o = await org("Short reason");
        await subscribe(o.id, "free");

        await expect(
            service.setPlan({
                ...(write(o.id, {
                    planKey: "grow",
                    expiresAt: inDays(3),
                }) as object),
                reason: "abc",
            } as never),
        ).rejects.toMatchObject({ status: 400 });
        expect(
            await prisma.entitlementOverride.count({
                where: { organizationId: o.id },
            }),
        ).toBe(0);
    });

    it("keeps a custom price from Billing staff without pricing:publish", async () => {
        const o = await org("No publish");
        await subscribe(o.id, "grow");

        await expect(
            service.preview(billing(), o.id, { kind: "price", pricePaise: 1 }),
        ).rejects.toMatchObject({
            status: 403,
            message: expect.stringMatching(/pricing:publish/),
        });
        const options = await service.offers(billing(), o.id);
        expect(options.kinds.price.available).toBe(false);
        expect(options.kinds.plan.available).toBe(true);
        expect(options.kinds.limit.available).toBe(true);
    });

    it("offers a longer trial only while in a trial", async () => {
        const paying = await org("Paying");
        await subscribe(paying.id, "grow");
        const trialing = await org("Trialing");
        const ends = new Date(Date.now() + 4 * DAY);
        await subscribe(trialing.id, "grow", {
            status: "TRIALING",
            currentPeriodEnd: ends,
        });

        await expect(
            service.preview(owner(), paying.id, {
                kind: "trial",
                expiresAt: inDays(10),
            }),
        ).rejects.toMatchObject({ status: 409 });
        const notNow = await service.offers(owner(), paying.id);
        expect(notNow.kinds.trial.available).toBe(false);
        expect(notNow.trialEndsAt).toBeNull();

        const now = await service.offers(owner(), trialing.id);
        expect(now.kinds.trial.available).toBe(true);
        expect(now.trialEndsAt).toBe(ends.toISOString());
    });

    it("takes a module away only for a Platform owner, and never one their paid plan includes", async () => {
        const paid = await org("Paid plan");
        await subscribe(paid.id, "grow");

        // Not a Platform owner: refused, by the dry run and the write.
        await expect(
            service.preview(billing(), paid.id, {
                kind: "remove",
                moduleKey: "invoicing",
            }),
        ).rejects.toMatchObject({ status: 403 });
        await expect(
            service.setModuleOverride({
                ...(write(paid.id, {
                    kind: "remove",
                    moduleKey: "invoicing",
                }) as object),
                staff: billing(),
            } as never),
        ).rejects.toMatchObject({ status: 403 });

        // A Platform owner, on a row Plan B includes: refused, both ways.
        await expect(
            service.preview(owner(), paid.id, {
                kind: "remove",
                moduleKey: "invoicing",
            }),
        ).rejects.toMatchObject({
            status: 409,
            message: expect.stringMatching(/paid plan includes Bills/),
        });
        await expect(
            service.setModuleOverride(
                write(paid.id, { kind: "remove", moduleKey: "invoicing" }),
            ),
        ).rejects.toMatchObject({ status: 409 });
        const options = await service.offers(owner(), paid.id);
        expect(options.modules.find((m) => m.id === "invoicing")).toMatchObject(
            { state: "on", paidPlanIncludes: true },
        );

        // A gift on Free is theirs to take back.
        const free = await org("Free with a gift");
        await subscribe(free.id, "free");
        await service.setModuleOverride(
            write(free.id, { kind: "grant", moduleKey: "invoicing" }),
        );
        const preview = await service.preview(owner(), free.id, {
            kind: "remove",
            moduleKey: "invoicing",
        });
        expect(preview.changes).toEqual([
            expect.objectContaining({
                type: "module",
                moduleId: "invoicing",
                from: "on",
            }),
        ]);
        await service.setModuleOverride(
            write(free.id, { kind: "remove", moduleKey: "invoicing" }),
        );
        const a = await access.resolve(free.id);
        expect(
            a.source === "catalogue" &&
                a.modules.find((m) => m.moduleId === "invoicing")?.state,
        ).not.toBe("on");
    });

    it("lists what the sheet can give: plans, modules with their registry, limits", async () => {
        const o = await org("Options");
        await subscribe(o.id, "free");

        const options = await service.offers(owner(), o.id);

        expect(options.planName).toBe("Plan A");
        expect(options.plans.map((p) => p.id)).toEqual(["free", "grow", "pro"]);
        expect(options.modules.find((m) => m.id === "bookings")).toMatchObject({
            registry: "APPOINTMENTS",
            state: "locked",
            paidPlanIncludes: false,
        });
        expect(options.limits.map((l) => l.key)).toContain("products");
        expect(options.kinds.module.available).toBe(true);
        expect(options.kinds.remove).toMatchObject({ available: true });
        await expect(
            service.offers(staff([AdminPermission.OrganizationRead]), o.id),
        ).rejects.toMatchObject({ status: 403 });
    });
});
