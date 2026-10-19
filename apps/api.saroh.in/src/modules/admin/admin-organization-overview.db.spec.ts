/**
 * A business's Overview (admin plan U3, #991) against a real Postgres, over
 * HTTP with the real staff guards and no support session:
 *
 * - a plan with a custom price until a date, and the next charge on autopay;
 * - free, with no next charge;
 * - a soft limit gone over;
 * - for a Release manager: no email, no note text, no reason, no billed-to;
 * - Billing staff see who it is billed to, or "chooses at first payment"
 *   (no profile);
 * - the Billing tab's badge for an open billing action;
 * - 403 without `organization:read`.
 *
 * Only Better Auth is a stand-in (a test header), as in
 * `admin-business-modules.db.spec.ts`. The catalogue, prices and limits are
 * made up (`fakeMeteredCatalog`). Integration project (TEST_DATABASE_URL),
 * plain and `TEST_RLS=on`.
 */
jest.mock("../../common/guards/better-auth.guard", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { UnauthorizedException } = require("@nestjs/common") as {
        UnauthorizedException: new (message: string) => Error;
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { prisma } = require("@saroh/database") as {
        prisma: {
            user: {
                findUnique: (args: unknown) => Promise<{ id: string } | null>;
            };
        };
    };
    return {
        BetterAuthGuard: class BetterAuthGuard {
            async canActivate(context: {
                switchToHttp: () => {
                    getRequest: () => {
                        headers: Record<string, string | undefined>;
                        user?: unknown;
                    };
                };
            }) {
                const request = context.switchToHttp().getRequest();
                const id = request.headers["x-test-user"];
                const user = id
                    ? await prisma.user.findUnique({ where: { id } })
                    : null;
                if (!user) {
                    throw new UnauthorizedException(
                        "Invalid or expired session",
                    );
                }
                request.user = user;
                return true;
            }
        },
    };
});

import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma, writeCatalogueVersion } from "@saroh/database";
import { planRows } from "@saroh/pricing-catalog";

import { fakeMeteredCatalog } from "../../../test/fixtures/pricing-catalog";
import { AllExceptionsFilter } from "../../common/filters/all-exceptions.filter";
import { PlatformAdminGuard } from "../../common/guards/platform-admin.guard";
import { PlatformPermissionGuard } from "../../common/guards/platform-permission.guard";
import { validationPipeOptions } from "../../common/validation";
import { CatalogueAccessService } from "../billing/catalogue-access.service";
import { EntitlementService } from "../billing/entitlement.service";
import { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { ModuleReadinessRegistry } from "../capabilities/readiness/module-readiness.registry";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { AdminAccessService } from "./admin-access.service";
import { AdminAuditService } from "./admin-audit.service";
import { AdminBusinessModulesService } from "./admin-business-modules.service";
import { AdminOrganizationOverviewController } from "./admin-organization-overview.controller";
import type { OrganizationOverview } from "./admin-organization-overview.service";
import { AdminOrganizationOverviewService } from "./admin-organization-overview.service";
import { OrganizationAccessSessionGuard } from "./organization-access-session.guard";

const DAY = 24 * 60 * 60 * 1000;
const tag = `${process.pid}-${Date.now()}`;
const VERSION = 1;

let app: INestApplication;
let url: string;
const staff = { support: "", billing: "", release: "", manager: "" };

async function user(name: string | null, email: string): Promise<string> {
    return (await prisma.user.create({ data: { email, name } })).id;
}

async function staffMember(role: string): Promise<string> {
    const id = await user(role, `${role.toLowerCase()}-${tag}@example.com`);
    await prisma.platformAdmin.create({
        data: {
            userId: id,
            roleAssignments: { create: { role, reason: "overview spec" } },
        },
    });
    return id;
}

let seq = 0;
/** A business on a made-up catalogue plan (`free`, `grow` or `pro`). */
async function business(
    planId: "free" | "grow" | "pro",
    sub: {
        provider?: string;
        providerSubscriptionId?: string;
        currentPeriodEnd?: Date;
    } = {},
): Promise<string> {
    seq += 1;
    const org = await prisma.organization.create({
        data: { name: `Overview ${seq}`, slug: `adm-overview-${seq}-${tag}` },
    });
    const plan = await prisma.plan.findUniqueOrThrow({
        where: {
            key_version_interval: {
                key: `catalog.${planId}`,
                version: VERSION,
                interval: "month",
            },
        },
    });
    await prisma.subscription.create({
        data: {
            organizationId: org.id,
            planId: plan.id,
            status: "ACTIVE",
            ...sub,
        },
    });
    return org.id;
}

async function member(organizationId: string, name: string, role = "MEMBER") {
    seq += 1;
    const id = await user(name, `member-${seq}-${tag}@example.com`);
    await prisma.membership.create({
        data: { organizationId, userId: id, role },
    });
    return id;
}

function get(path: string, as?: string) {
    return fetch(`${url}/admin${path}`, {
        headers: as ? { "x-test-user": as } : {},
    });
}

async function read(
    organizationId: string,
    as: string = staff.support,
): Promise<{ body: OrganizationOverview; raw: string }> {
    const res = await get(`/organizations/${organizationId}/overview`, as);
    expect(res.status).toBe(200);
    const raw = await res.text();
    return { body: JSON.parse(raw) as OrganizationOverview, raw };
}

function ok<T>(panel: { status: "ok"; data: T } | { status: "failed" }): T {
    if (panel.status !== "ok") throw new Error("card failed");
    return panel.data;
}

beforeAll(async () => {
    const flags = new FeatureFlagService();
    const access = new CatalogueAccessService(flags);
    const moduleRef = await Test.createTestingModule({
        controllers: [AdminOrganizationOverviewController],
        providers: [
            AdminOrganizationOverviewService,
            AdminBusinessModulesService,
            { provide: FeatureFlagService, useValue: flags },
            { provide: CatalogueAccessService, useValue: access },
            {
                provide: ModuleAvailabilityService,
                useValue: new ModuleAvailabilityService(
                    flags,
                    new EntitlementService(access),
                    new ModuleReadinessRegistry(),
                ),
            },
            AdminAuditService,
            AdminAccessService,
            PlatformAdminGuard,
            PlatformPermissionGuard,
            OrganizationAccessSessionGuard,
        ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0, "127.0.0.1");
    url = await app.getUrl();

    // `members` made soft for the "over a soft limit" case: counted and
    // told, never refused.
    const catalog = fakeMeteredCatalog((c) => {
        const members = c.modules.find((m) => m.id === "members");
        for (const cell of Object.values(members?.cells ?? {})) {
            if (cell.inc && "limit" in cell && cell.limit !== undefined) {
                cell.soft = true;
            }
        }
    });
    await writeCatalogueVersion(prisma, {
        version: VERSION,
        catalog,
        goLiveAt: new Date(Date.now() - DAY),
        policy: "keep",
        planRows: planRows(catalog, VERSION),
    });

    staff.support = await staffMember("SUPPORT");
    staff.billing = await staffMember("BILLING");
    staff.release = await staffMember("RELEASE_MANAGER");
    staff.manager = await staffMember("ACCOUNT_MANAGER");
});

afterAll(async () => {
    // The integration setup truncates every table after the file.
    await app?.close();
});

describe("a business's Overview (U3)", () => {
    it("shows a custom price until a date, and the next charge on autopay", async () => {
        const periodEnd = new Date(Date.now() + 10 * DAY);
        const org = await business("grow", {
            provider: "RAZORPAY",
            providerSubscriptionId: `sub_overview_${tag}`,
            currentPeriodEnd: periodEnd,
        });
        const until = new Date(Date.now() + 40 * DAY);
        await prisma.entitlementOverride.create({
            data: {
                organizationId: org,
                kind: "price",
                key: "price",
                value: 12_345,
                expiresAt: until,
                reason: "made-up price for the spec",
                grantedByUserId: staff.support,
            },
        });

        const plan = ok((await read(org)).body.plan);
        expect(plan.name).toBe("Plan B");
        expect(plan.customPrice).toEqual({
            pricePaise: 12_345,
            expiresAt: until.toISOString(),
        });
        expect(plan.pricePaise).toBe(12_345);
        expect(plan.planPricePaise).toBe(22_200);
        expect(plan.nextCharge).toEqual({
            at: periodEnd.toISOString(),
            how: "AUTOPAY",
            autopayRunsOutSoon: false,
        });
        expect(plan.offers).toEqual([
            expect.objectContaining({
                kind: "price",
                value: 12_345,
                expiresAt: until.toISOString(),
            }),
        ]);
        expect(plan.offers[0]).not.toHaveProperty("reason");
    });

    it("shows a plan override and when it ends", async () => {
        const org = await business("free");
        const until = new Date(Date.now() + 20 * DAY);
        await prisma.entitlementOverride.create({
            data: {
                organizationId: org,
                kind: "plan",
                key: "plan",
                planKey: "pro",
                expiresAt: until,
                reason: "made-up plan override",
                grantedByUserId: staff.support,
            },
        });

        const plan = ok((await read(org)).body.plan);
        expect(plan.name).toBe("Plan C");
        expect(plan.basePlanName).toBe("Plan A");
        expect(plan.overrideEndsAt).toBe(until.toISOString());
    });

    it("free, with no next charge", async () => {
        const org = await business("free");
        const plan = ok((await read(org)).body.plan);
        expect(plan.name).toBe("Plan A");
        expect(plan.customPrice).toBeNull();
        expect(plan.nextCharge).toEqual({
            at: null,
            how: "NONE",
            autopayRunsOutSoon: false,
        });
        expect(plan.livePlans?.map((p) => p.id)).toEqual([
            "free",
            "grow",
            "pro",
        ]);
    });

    it("shows a soft limit gone over", async () => {
        const org = await business("free");
        // Plan A's made-up cap is 2 people; three are in.
        await member(org, "One", "OWNER");
        await member(org, "Two");
        await member(org, "Three");

        const usage = ok((await read(org)).body.usage);
        expect(usage.find((r) => r.key === "members")).toMatchObject({
            used: 3,
            limit: 2,
            planLimit: 2,
            soft: true,
            over: true,
            raisable: true,
        });
    });

    it("shows a Release manager no email, note text, reason or billed-to", async () => {
        const owner = await user("Asha Owner", `asha-${tag}@example.com`);
        const org = await business("free");
        await prisma.membership.create({
            data: { organizationId: org, userId: owner, role: "OWNER" },
        });
        await prisma.organizationInvitation.create({
            data: {
                organizationId: org,
                email: `invitee-${tag}@example.com`,
                role: "MEMBER",
                status: "PENDING",
                tokenHash: `overview-invite-${tag}`,
                invitedByUserId: owner,
                expiresAt: new Date(Date.now() + DAY),
            },
        });
        const profile = await prisma.billingProfile.create({
            data: {
                ownerUserId: owner,
                legalName: "Secret Legal Name Pvt",
                billingEmail: `billing-${tag}@example.com`,
                provider: "RAZORPAY",
            },
        });
        await prisma.organization.update({
            where: { id: org },
            data: { billingProfileId: profile.id },
        });
        await prisma.adminOrganizationNote.create({
            data: {
                organizationId: org,
                authorUserId: staff.support,
                body: "SECRET-NOTE-TEXT",
            },
        });
        await prisma.adminAuditEvent.create({
            data: {
                actorUserId: staff.support,
                permission: "organization:modules:write",
                action: "organization.module",
                targetType: "organization",
                targetId: org,
                organizationId: org,
                reason: "SECRET-REASON-TEXT",
                outcome: "SUCCESS",
            },
        });
        await prisma.auditEvent.create({
            data: {
                action: "membership.invite",
                actorUserId: owner,
                organizationId: org,
                outcome: "SUCCESS",
            },
        });
        await prisma.entitlementOverride.create({
            data: {
                organizationId: org,
                kind: "raise",
                key: "members",
                value: 5,
                expiresAt: new Date(Date.now() + 5 * DAY),
                reason: "SECRET-OVERRIDE-REASON",
                grantedByUserId: staff.support,
            },
        });

        const { body, raw } = await read(org, staff.release);
        expect(raw).not.toContain("@example.com");
        expect(raw).not.toContain("SECRET");
        expect(body.billedTo).toBeNull();
        expect(ok(body.team).members).toEqual([
            { name: "Asha Owner", role: "OWNER" },
        ]);
        expect(ok(body.team).invitesOpen).toBe(1);
        expect(ok(body.notes).count).toBe(1);
        expect(ok(body.notes).lastAt).not.toBeNull();
        expect(ok(body.activity).map((a) => [a.source, a.action])).toEqual(
            expect.arrayContaining([
                ["operator", "organization.module"],
                ["business", "membership.invite"],
            ]),
        );
        for (const row of ok(body.activity)) {
            expect(Object.keys(row).sort()).toEqual([
                "action",
                "at",
                "id",
                "source",
            ]);
        }
        expect(body.badges.notes).toEqual({ count: 1 });
        expect(body.badges.team).toEqual({ count: 1 });

        // Billing staff read the same business with who it is billed to.
        const billing = await read(org, staff.billing);
        expect(billing.body.billedTo).toEqual({
            name: "Secret Legal Name Pvt",
        });
        expect(billing.raw).not.toContain("@example.com");
    });

    it("says it chooses at first payment when there is no billing profile", async () => {
        const org = await business("free");
        const { body } = await read(org, staff.billing);
        expect(body.billedTo).toEqual({ name: null });
    });

    it("flags Billing for an open billing action, and not a resolved one", async () => {
        const org = await business("free");
        expect((await read(org)).body.badges.billing).toEqual({
            needsYou: false,
            count: 0,
        });

        await prisma.billingAction.create({
            data: {
                organizationId: org,
                code: "overview_spec_resolved",
                refs: {},
                note: "made up",
                resolvedAt: new Date(),
                resolvedBy: staff.billing,
                resolution: "done",
            },
        });
        expect((await read(org)).body.badges.billing.needsYou).toBe(false);

        await prisma.billingAction.create({
            data: {
                organizationId: org,
                code: "overview_spec_open",
                refs: {},
                note: "made up",
            },
        });
        expect((await read(org)).body.badges.billing).toEqual({
            needsYou: true,
            count: 1,
        });
    });

    it("counts modules on for the Modules tab", async () => {
        const org = await business("free");
        const { body } = await read(org);
        const modules = ok(body.modules);
        expect(modules.total).toBe(modules.on + modules.off + modules.locked);
        expect(body.badges.modules).toEqual({ count: modules.on });
    });

    it("refuses staff without organization:read (403), and 401 signed out", async () => {
        const org = await business("free");
        expect(
            (await get(`/organizations/${org}/overview`, staff.manager)).status,
        ).toBe(403);
        expect((await get(`/organizations/${org}/overview`)).status).toBe(401);
    });

    it("shows the account manager by name, how they came and since when (U25)", async () => {
        const org = await business("free");
        const none = await read(org);
        expect(ok(none.body.accountManager)).toEqual({ manager: null });

        const amEmail = `am-overview-${tag}@example.com`;
        const amUser = await user("Asha Manager", amEmail);
        const admin = await prisma.platformAdmin.create({
            data: {
                userId: amUser,
                roleAssignments: {
                    create: {
                        role: "ACCOUNT_MANAGER",
                        reason: "overview spec",
                    },
                },
            },
        });
        const since = new Date(Date.now() - 3 * DAY);
        const link = await prisma.accountManagerLink.create({
            data: {
                organizationId: org,
                platformAdminId: admin.id,
                source: "LINK",
                kind: "BROUGHT_IN",
                evidence: { source: "LINK", code: "ABCD2345" },
                startedAt: since,
            },
        });
        const { body, raw } = await read(org, staff.release);
        expect(ok(body.accountManager).manager).toEqual({
            platformAdminId: admin.id,
            name: "Asha Manager",
            kind: "BROUGHT_IN",
            source: "LINK",
            since: since.toISOString(),
        });
        // A teammate's name, never their email.
        expect(raw).not.toContain(amEmail);

        await prisma.accountManagerLink.update({
            where: { id: link.id },
            data: { endedAt: new Date(), endedReason: "overview spec" },
        });
        expect(ok((await read(org)).body.accountManager)).toEqual({
            manager: null,
        });
    });

    it("is 404 for a business that doesn't exist", async () => {
        expect(
            (await get(`/organizations/nope-${tag}/overview`, staff.support))
                .status,
        ).toBe(404);
    });
});
