/**
 * One business's catalogue exceptions against a real Postgres (plans
 * catalogue U11): grant, remove and limit a row, a custom price, a plan
 * until a date, a move to the live version, and the business page's plan
 * panel read through the catalogue. Every write is audited with its reason
 * in the admin ledger and the business's own history.
 *
 * Route permissions (`pricing:override`, and `pricing:publish` too for a
 * price) are pinned by `admin.controller.permissions.spec.ts`; the guard's
 * refusal by `platform-permission.guard.spec.ts`.
 *
 * Every catalogue here is made up (`fakeLegacyMappedCatalog`: Plan A/B/C,
 * 11, 222). Rows satisfy the migration's CHECKs, so it holds in RLS mode.
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma, writeCatalogueVersion } from "@saroh/database";
import type { Catalog } from "@saroh/pricing-catalog";
import { planRows } from "@saroh/pricing-catalog";

import { fakeLegacyMappedCatalog } from "../../../test/fixtures/pricing-catalog";
import { CatalogueAccessService } from "../billing/catalogue-access.service";
import { EntitlementService } from "../billing/entitlement.service";
import { PRICING_MOVE_NOTICE_TYPE } from "../pricing/moves.service";
import { AdminAuditService } from "./admin-audit.service";
import { AdminOrganizationViewService } from "./admin-organization-view.service";
import { AdminOverridesService } from "./admin-overrides.service";
import { AdminPermission } from "./admin-permissions";

const tag = `${process.pid}-${Date.now()}`;
const DAY = 24 * 60 * 60 * 1000;
// The suite runs serially and truncates between files: V1 is an earlier
// version, V2 the live one.
const V1 = 1;
const V2 = 2;

const access = new CatalogueAccessService();
const service = new AdminOverridesService(new AdminAuditService(), access);
const view = new AdminOrganizationViewService(
    new EntitlementService(access),
    access,
);

let staffId: string;
const staff = (permissions: string[] = [AdminPermission.PricingOverride]) =>
    ({
        userId: staffId,
        platformAdminId: "pa",
        roles: [],
        permissions,
        viaBootstrap: false,
    }) as never;

let seq = 0;
async function org(name: string) {
    seq += 1;
    return prisma.organization.create({
        data: { name, slug: `ov-${seq}-${tag}` },
    });
}

async function subscribe(
    organizationId: string,
    planId: string,
    over: {
        version?: number;
        provider?: string;
        currentPeriodEnd?: Date;
    } = {},
) {
    const plan = await prisma.plan.findUniqueOrThrow({
        where: {
            key_version_interval: {
                key: `catalog.${planId}`,
                version: over.version ?? V2,
                interval: "month",
            },
        },
    });
    return prisma.subscription.create({
        data: {
            organizationId,
            planId: plan.id,
            status: "ACTIVE",
            provider: over.provider ?? null,
            currentPeriodEnd: over.currentPeriodEnd ?? null,
        },
    });
}

async function install(version: number, catalog: Catalog, goLiveAt: Date) {
    await writeCatalogueVersion(prisma, {
        version,
        catalog,
        goLiveAt,
        policy: "keep",
        planRows: planRows(catalog, version),
    });
}

async function row(organizationId: string, moduleId: string) {
    const a = await access.resolve(organizationId);
    if (a.source !== "catalogue") throw new Error("not on the catalogue");
    return a.modules.find((m) => m.moduleId === moduleId)!;
}

const cmd = (organizationId: string, extra: Record<string, unknown> = {}) =>
    ({
        staff: staff(),
        organizationId,
        reason: "fake reason",
        ...extra,
    }) as never;

describe("business overrides (DB, U11)", () => {
    beforeAll(async () => {
        staffId = (
            await prisma.user.create({
                data: { email: `overrides-${tag}@example.com`, name: "Staff" },
            })
        ).id;
        await install(
            V1,
            fakeLegacyMappedCatalog(),
            new Date(Date.now() - 9 * DAY),
        );
        // The live version changes Plan B's products, so a move to it is
        // told ahead.
        await install(
            V2,
            fakeLegacyMappedCatalog((c) => {
                c.modules.find((m) => m.id === "products")!.cells.grow = {
                    inc: true,
                    text: "333",
                    card: "",
                    limit: 333,
                    per: "",
                };
            }),
            new Date(Date.now() - DAY),
        );
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
        await prisma.organization.deleteMany({
            where: { slug: { endsWith: tag } },
        });
    });

    it("grants a row to a Free business, and audits it with the reason", async () => {
        const o = await org("Granted");
        await subscribe(o.id, "free");
        expect((await row(o.id, "invoicing")).state).toBe("locked");

        const written = await service.setModuleOverride(
            cmd(o.id, { kind: "grant", moduleKey: "invoicing" }),
        );

        expect(await row(o.id, "invoicing")).toMatchObject({
            state: "on",
            override: "Granted by Saroh",
        });
        expect(
            await prisma.adminAuditEvent.findFirstOrThrow({
                where: { organizationId: o.id },
            }),
        ).toMatchObject({
            action: "organization.override.granted",
            permission: AdminPermission.PricingOverride,
            reason: "fake reason",
            targetId: written.id,
        });
        const own = await prisma.auditEvent.findFirstOrThrow({
            where: { organizationId: o.id },
        });
        expect(own).toMatchObject({ action: "organization.override.granted" });
        expect(own.metadata).toMatchObject({ byOperator: true });
    });

    it("lets a removal replace a grant on the same row, so the latest stands", async () => {
        const o = await org("Flipped");
        await subscribe(o.id, "grow");
        const grant = await service.setModuleOverride(
            cmd(o.id, { kind: "grant", moduleKey: "bookings" }),
        );
        await service.setModuleOverride(
            cmd(o.id, { kind: "remove", moduleKey: "bookings" }),
        );

        expect(await row(o.id, "bookings")).toMatchObject({
            state: "hidden",
            override: "Removed by Saroh",
        });
        const live = await prisma.entitlementOverride.findMany({
            where: { organizationId: o.id, revokedAt: null },
        });
        expect(live.map((r) => r.kind)).toEqual(["remove"]);
        expect(
            (
                await prisma.entitlementOverride.findUniqueOrThrow({
                    where: { id: grant.id },
                })
            ).revokedAt,
        ).not.toBeNull();
    });

    it("sets a limit below what is in use, and warns that the rest stay read-only", async () => {
        const o = await org("Limited");
        await subscribe(o.id, "grow");
        await prisma.product.createMany({
            data: Array.from({ length: 3 }, (_, i) => ({
                organizationId: o.id,
                name: `Thing ${i}`,
                slug: `thing-${i}`,
                price: 1,
            })),
        });

        const written = await service.setModuleOverride(
            cmd(o.id, { kind: "limit", moduleKey: "products", value: 2 }),
        );

        expect(written.warning).toMatch(/3 already/);
        expect(await row(o.id, "products")).toMatchObject({
            limit: 2,
            override: "Limit set by Saroh",
        });
    });

    it("refuses a limit on a switch row, on a row that is off, and without a value", async () => {
        const o = await org("Refused limits");
        await subscribe(o.id, "free");
        await expect(
            service.setModuleOverride(
                cmd(o.id, { kind: "limit", moduleKey: "website", value: 4 }),
            ),
        ).rejects.toMatchObject({ status: 400 });
        await expect(
            service.setModuleOverride(
                cmd(o.id, { kind: "limit", moduleKey: "bookings", value: 4 }),
            ),
        ).rejects.toMatchObject({ status: 409 });
        await expect(
            service.setModuleOverride(
                cmd(o.id, { kind: "limit", moduleKey: "members" }),
            ),
        ).rejects.toMatchObject({ status: 400 });
        await expect(
            service.setModuleOverride(
                cmd(o.id, { kind: "grant", moduleKey: "nope" }),
            ),
        ).rejects.toMatchObject({ status: 400 });
    });

    it("refuses a limit on a row an operator removed", async () => {
        const o = await org("Off row");
        await subscribe(o.id, "grow");
        await service.setModuleOverride(
            cmd(o.id, { kind: "remove", moduleKey: "products" }),
        );
        await expect(
            service.setModuleOverride(
                cmd(o.id, { kind: "limit", moduleKey: "products", value: 4 }),
            ),
        ).rejects.toMatchObject({ status: 409 });
    });

    it("refuses an override for a business the catalogue doesn't reach yet", async () => {
        const o = await org("No plan");
        await expect(
            service.setModuleOverride(
                cmd(o.id, { kind: "grant", moduleKey: "invoicing" }),
            ),
        ).rejects.toMatchObject({ status: 409 });
    });

    it("sets a custom price, refuses it on a provider-managed plan, and ends it only with publish", async () => {
        const o = await org("Priced");
        await subscribe(o.id, "grow");
        const written = await service.setPrice(
            cmd(o.id, { pricePaise: 12_345 }),
        );
        const a = await access.resolve(o.id);
        expect(a.source === "catalogue" && a.pricePaise).toBe(12_345);

        await expect(
            service.removeOverride(cmd(o.id, { overrideId: written.id })),
        ).rejects.toMatchObject({ status: 403 });
        await expect(
            service.removeOverride({
                ...(cmd(o.id, { overrideId: written.id }) as object),
                staff: staff([
                    AdminPermission.PricingOverride,
                    AdminPermission.PricingPublish,
                ]),
            } as never),
        ).resolves.toMatchObject({ changed: true });

        const billed = await org("Billed elsewhere");
        await subscribe(billed.id, "grow", { provider: "fakepay" });
        await expect(
            service.setPrice(cmd(billed.id, { pricePaise: 1 })),
        ).rejects.toMatchObject({ status: 409 });
    });

    it("puts a business on a plan until a date, and extends it by replacing the old one", async () => {
        const o = await org("Kept on B");
        await subscribe(o.id, "free");
        const first = await service.setPlan(
            cmd(o.id, {
                planKey: "grow",
                expiresAt: new Date(Date.now() + DAY).toISOString(),
            }),
        );
        const later = new Date(Date.now() + 20 * DAY);
        await service.setPlan(
            cmd(o.id, { planKey: "grow", expiresAt: later.toISOString() }),
        );

        const a = await access.resolve(o.id);
        expect(a.planOverride?.expiresAt?.getTime()).toBe(later.getTime());
        expect(a.source === "catalogue" && a.planId).toBe("grow");
        expect(
            (
                await prisma.entitlementOverride.findUniqueOrThrow({
                    where: { id: first.id },
                })
            ).revokedAt,
        ).not.toBeNull();

        await expect(
            service.setPlan(
                cmd(o.id, {
                    planKey: "zzz",
                    expiresAt: later.toISOString(),
                }),
            ),
        ).rejects.toMatchObject({ status: 400 });
        await expect(
            service.setPlan(
                cmd(o.id, {
                    planKey: "grow",
                    expiresAt: new Date(Date.now() - DAY).toISOString(),
                }),
            ),
        ).rejects.toMatchObject({ status: 400 });
    });

    it("schedules a move to the live version at the first renewal a notice allows, and tells it ahead", async () => {
        const o = await org("Moving later");
        const renews = new Date(Date.now() + 20 * DAY);
        const sub = await subscribe(o.id, "grow", {
            version: V1,
            currentPeriodEnd: renews,
        });

        const r = await service.moveToLive(cmd(o.id, { when: "renewal" }));

        expect(r).toMatchObject({ version: V2 });
        const after = await prisma.subscription.findUniqueOrThrow({
            where: { id: sub.id },
            include: { pendingPlan: true },
        });
        expect(after.planId).toBe(sub.planId);
        expect(after.pendingPlan).toMatchObject({
            key: "catalog.grow",
            version: V2,
        });
        expect(after.pendingFrom?.getTime()).toBe(renews.getTime());
        const notices = await prisma.job.findMany({
            where: { type: PRICING_MOVE_NOTICE_TYPE, organizationId: o.id },
        });
        expect(notices).toHaveLength(1);
        expect(notices[0].runAt.getTime()).toBe(renews.getTime() - 7 * DAY);
    });

    it("moves a business now, and refuses one already there or billed by a provider", async () => {
        const o = await org("Moving now");
        const sub = await subscribe(o.id, "grow", { version: V1 });
        await service.moveToLive(cmd(o.id, { when: "now" }));
        const after = await prisma.subscription.findUniqueOrThrow({
            where: { id: sub.id },
            include: { plan: true },
        });
        expect(after.plan).toMatchObject({ key: "catalog.grow", version: V2 });
        expect(after.pendingPlanId).toBeNull();

        await expect(
            service.moveToLive(cmd(o.id, { when: "now" })),
        ).rejects.toMatchObject({ status: 409 });

        const billed = await org("Provider");
        await subscribe(billed.id, "grow", {
            version: V1,
            provider: "fakepay",
        });
        await expect(
            service.moveToLive(cmd(billed.id, { when: "now" })),
        ).rejects.toMatchObject({ status: 409 });
    });

    it("shows the catalogue rows on the business page, and only the other keys as limits", async () => {
        const o = await org("Viewed");
        await subscribe(o.id, "free");
        await service.setModuleOverride(
            cmd(o.id, { kind: "grant", moduleKey: "invoicing" }),
        );

        const page = await view.view(o.id, { canReadPii: false });
        expect(page.plan.status).toBe("ok");
        if (page.plan.status !== "ok") return;
        const plan = page.plan.data;
        expect(plan.catalogue).toMatchObject({
            version: V2,
            liveVersion: V2,
            planId: "free",
        });
        expect(
            plan.catalogue?.modules.find((m) => m.moduleId === "invoicing"),
        ).toMatchObject({ state: "on", planState: "locked" });
        expect(
            plan.catalogue?.modules.find((m) => m.moduleId === "members"),
        ).toMatchObject({ limit: 1, usage: 0, limitable: true });
        const keys = plan.limits.map((l) => l.key);
        expect(keys).toContain("sites");
        expect(keys).not.toContain("members");
        expect(keys).not.toContain("teamMembers");
        expect(keys).not.toContain("invoicing");
        expect(plan.overrides.map((x) => x.kind)).toEqual(["grant"]);
    });

    it("shows the plan an override puts it on, its base beside it, and the live plans (UX-087)", async () => {
        const o = await org("Pro for a while");
        await subscribe(o.id, "free");
        const until = new Date(Date.now() + 30 * DAY);
        await service.setPlan(
            cmd(o.id, { planKey: "pro", expiresAt: until.toISOString() }),
        );
        // One storefront with no kind of its own, and one shop: the old
        // floor counts places customers visit, as metering does (8 Oct).
        await prisma.store.create({
            data: { organizationId: o.id, name: "Online" },
        });
        await prisma.store.create({
            data: {
                organizationId: o.id,
                name: "Hill Road",
                settings: { create: { kind: "SHOP" } },
            },
        });

        const page = await view.view(o.id, { canReadPii: false });
        if (page.plan.status !== "ok") throw new Error("plan panel failed");
        const plan = page.plan.data;
        expect(plan.effective).toMatchObject({
            id: "pro",
            name: "Plan C",
            basePlanId: "free",
            basePlanName: "Plan A",
        });
        expect(plan.effective?.override?.expiresAt).toBeInstanceOf(Date);
        expect(plan.liveCatalogue).toEqual({
            version: V2,
            plans: [
                { id: "free", name: "Plan A" },
                { id: "grow", name: "Plan B" },
                { id: "pro", name: "Plan C" },
            ],
        });
        expect(plan.limits.find((l) => l.key === "storefronts")?.usage).toBe(1);
    });

    it("offers the live plans to a business the catalogue doesn't reach yet", async () => {
        const o = await org("No plan row");
        const page = await view.view(o.id, { canReadPii: false });
        if (page.plan.status !== "ok") throw new Error("plan panel failed");
        expect(page.plan.data.catalogue).toBeNull();
        expect(page.plan.data.effective).toBeNull();
        expect(page.plan.data.liveCatalogue?.version).toBe(V2);
    });
});
