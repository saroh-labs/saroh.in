/**
 * A business's true module state for the console (admin console U1, #989)
 * against a real Postgres, over HTTP with the real staff guards:
 *
 * - the release off with their switch on reads Off, "Release off for
 *   everyone", never On (R4); on for this business it reads On;
 * - outside their plan with PLAN_ENFORCEMENT on it reads Locked; with
 *   enforcement off it reads On and the note comes once for the business;
 * - their switch off reads Off with "Switch on for them…";
 * - release off and outside the plan shows the release fix first, then
 *   Locked once the release is on for them;
 * - a dependency that is off is listed, never a blocker;
 * - hidden modules (DEC-068) are not listed;
 * - 401 with no session, 403 without `organization:read`, and no support
 *   session is needed.
 *
 * Only Better Auth is a stand-in (a test header), as in
 * `admin-billing-controls.db.spec.ts`. The catalogue is made up
 * (`fakeLegacyMappedCatalog`). Integration project (TEST_DATABASE_URL).
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

import { fakeLegacyMappedCatalog } from "../../../test/fixtures/pricing-catalog";
import { AllExceptionsFilter } from "../../common/filters/all-exceptions.filter";
import { PlatformAdminGuard } from "../../common/guards/platform-admin.guard";
import { PlatformPermissionGuard } from "../../common/guards/platform-permission.guard";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { validationPipeOptions } from "../../common/validation";
import { CatalogueAccessService } from "../billing/catalogue-access.service";
import { EntitlementService } from "../billing/entitlement.service";
import { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { ModuleReadinessRegistry } from "../capabilities/readiness/module-readiness.registry";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import { AdminAccessService } from "./admin-access.service";
import { AdminAuditService } from "./admin-audit.service";
import type { BusinessModulesState } from "./admin-business-modules.service";
import {
    AdminBusinessModulesService,
    PLAN_LIMITS_OFF_NOTE,
} from "./admin-business-modules.service";
import { AdminLifecycleService } from "./admin-lifecycle.service";
import { AdminOrganizationViewService } from "./admin-organization-view.service";
import { AdminOrganizationsController } from "./admin-organizations.controller";
import { AdminOrganizationsService } from "./admin-organizations.service";
import { AdminOverridesService } from "./admin-overrides.service";
import { AdminSiteTrackersService } from "./admin-site-trackers.service";
import { OrganizationAccessSessionGuard } from "./organization-access-session.guard";

const DAY = 24 * 60 * 60 * 1000;
const tag = `${process.pid}-${Date.now()}`;
const VERSION = 1;

let app: INestApplication;
let url: string;
const people = { owner: "", support: "" };

async function user(name: string): Promise<string> {
    return (
        await prisma.user.create({
            data: { email: `${name}-${tag}@example.com`, name },
        })
    ).id;
}

let seq = 0;
/** A business on the made-up catalogue's free plan, which leaves Bookings out. */
async function business(): Promise<string> {
    seq += 1;
    const org = await prisma.organization.create({
        data: { name: `Modules ${seq}`, slug: `adm-modules-${seq}-${tag}` },
    });
    const plan = await prisma.plan.findUniqueOrThrow({
        where: {
            key_version_interval: {
                key: "catalog.free",
                version: VERSION,
                interval: "month",
            },
        },
    });
    await prisma.subscription.create({
        data: { organizationId: org.id, planId: plan.id, status: "ACTIVE" },
    });
    return org.id;
}

async function switchModule(
    organizationId: string,
    moduleKey: string,
    status: "ENABLED" | "DISABLED",
) {
    await prisma.organizationModule.upsert({
        where: { organizationId_moduleKey: { organizationId, moduleKey } },
        create: { organizationId, moduleKey, status },
        update: { status },
    });
}

async function flag(key: string, on: boolean) {
    await prisma.featureFlag.upsert({
        where: { key },
        create: { key, enabledByDefault: on },
        update: { enabledByDefault: on },
    });
}

async function onForBusiness(key: string, organizationId: string) {
    await prisma.featureFlagOverride.create({
        data: { flagKey: key, organizationId, enabled: true },
    });
}

async function read(
    organizationId: string,
    as: string = people.support,
): Promise<BusinessModulesState> {
    const res = await get(`/organizations/${organizationId}/modules/state`, as);
    expect(res.status).toBe(200);
    return (await res.json()) as BusinessModulesState;
}

function get(path: string, as?: string) {
    return fetch(`${url}/admin${path}`, {
        headers: as ? { "x-test-user": as } : {},
    });
}

function row(state: BusinessModulesState, key: string) {
    const found = state.modules.find((m) => m.moduleKey === key);
    if (!found) throw new Error(`${key} not listed`);
    return found;
}

beforeAll(async () => {
    const flags = new FeatureFlagService();
    const moduleRef = await Test.createTestingModule({
        controllers: [AdminOrganizationsController],
        providers: [
            AdminBusinessModulesService,
            { provide: FeatureFlagService, useValue: flags },
            {
                provide: ModuleAvailabilityService,
                useValue: new ModuleAvailabilityService(
                    flags,
                    new EntitlementService(new CatalogueAccessService(flags)),
                    new ModuleReadinessRegistry(),
                ),
            },
            AdminAuditService,
            AdminAccessService,
            IdempotencyService,
            PlatformAdminGuard,
            PlatformPermissionGuard,
            OrganizationAccessSessionGuard,
            // The controller's other routes; none is called here.
            { provide: AdminOrganizationsService, useValue: {} },
            { provide: AdminOrganizationViewService, useValue: {} },
            { provide: AdminLifecycleService, useValue: {} },
            { provide: AdminOverridesService, useValue: {} },
            { provide: AdminSiteTrackersService, useValue: {} },
        ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0, "127.0.0.1");
    url = await app.getUrl();

    const catalog = fakeLegacyMappedCatalog();
    await writeCatalogueVersion(prisma, {
        version: VERSION,
        catalog,
        goLiveAt: new Date(Date.now() - DAY),
        policy: "keep",
        planRows: planRows(catalog, VERSION),
    });

    people.owner = await user("owner");
    people.support = await user("support");
    await prisma.platformAdmin.create({
        data: {
            userId: people.support,
            roleAssignments: {
                create: { role: "SUPPORT", reason: "module state spec" },
            },
        },
    });
});

beforeEach(async () => {
    // Rolled out for everyone, unless a test says otherwise; enforcement off.
    for (const key of [
        FlagKey.MODULE_CRM,
        FlagKey.MODULE_APPOINTMENTS,
        FlagKey.MODULE_CLASS_PACKS,
        FlagKey.MODULE_AUTOMATIONS,
    ]) {
        await flag(key, true);
    }
    await flag(FlagKey.PLAN_ENFORCEMENT, false);
});

afterAll(async () => {
    // The integration setup truncates every table after the file.
    await app?.close();
});

describe("a business's module state (U1)", () => {
    it("reads Off, release off for everyone, while their switch is on (R4)", async () => {
        await flag(FlagKey.MODULE_APPOINTMENTS, false);
        const org = await business();
        await switchModule(org, "APPOINTMENTS", "ENABLED");

        expect(row(await read(org), "APPOINTMENTS")).toMatchObject({
            label: "Bookings",
            state: "off",
            blocker: "ROLLOUT_DISABLED",
            reason: "Release off for everyone",
            fix: {
                kind: "release",
                label: "Turn on for this business…",
                flagKey: FlagKey.MODULE_APPOINTMENTS,
            },
        });
    });

    it("reads On when the release is on for this business", async () => {
        await flag(FlagKey.MODULE_APPOINTMENTS, false);
        const org = await business();
        await switchModule(org, "APPOINTMENTS", "ENABLED");
        await onForBusiness(FlagKey.MODULE_APPOINTMENTS, org);

        expect(row(await read(org), "APPOINTMENTS")).toMatchObject({
            state: "on",
        });
        expect(row(await read(org), "APPOINTMENTS").blocker).not.toBe(
            "ROLLOUT_DISABLED",
        );
    });

    it("reads Locked outside their plan with plan enforcement on", async () => {
        await flag(FlagKey.PLAN_ENFORCEMENT, true);
        const org = await business();
        await switchModule(org, "APPOINTMENTS", "ENABLED");

        const state = await read(org);
        expect(state.planLimitsEnforced).toBe(true);
        expect(state.note).toBeNull();
        expect(row(state, "APPOINTMENTS")).toMatchObject({
            state: "locked",
            blocker: "ENTITLEMENT_REQUIRED",
            reason: "Not in their plan",
            fix: { kind: "plan", permission: "pricing:override" },
        });
    });

    it("reads On with enforcement off, and says so once for the business", async () => {
        const org = await business();
        await switchModule(org, "APPOINTMENTS", "ENABLED");

        const state = await read(org);
        expect(state.planLimitsEnforced).toBe(false);
        expect(state.note).toBe(PLAN_LIMITS_OFF_NOTE);
        expect(row(state, "APPOINTMENTS").state).toBe("on");
        for (const m of state.modules) {
            expect(m.reason ?? "").not.toContain(PLAN_LIMITS_OFF_NOTE);
        }
    });

    it("reads Off with Switch on for them… when they switched it off", async () => {
        const org = await business();
        await switchModule(org, "APPOINTMENTS", "DISABLED");

        expect(row(await read(org), "APPOINTMENTS")).toMatchObject({
            state: "off",
            blocker: "ORG_MODULE_DISABLED",
            reason: "They switched it off",
            fix: {
                kind: "switch-on",
                label: "Switch on for them…",
                permission: "organization:modules:write",
            },
        });
    });

    it("shows the release fix first when also outside the plan, then Locked", async () => {
        await flag(FlagKey.PLAN_ENFORCEMENT, true);
        await flag(FlagKey.MODULE_APPOINTMENTS, false);
        const org = await business();
        await switchModule(org, "APPOINTMENTS", "ENABLED");

        expect(row(await read(org), "APPOINTMENTS")).toMatchObject({
            state: "off",
            blocker: "ROLLOUT_DISABLED",
            fix: { kind: "release" },
        });

        await onForBusiness(FlagKey.MODULE_APPOINTMENTS, org);
        expect(row(await read(org), "APPOINTMENTS")).toMatchObject({
            state: "locked",
            blocker: "ENTITLEMENT_REQUIRED",
            fix: { kind: "plan" },
        });
    });

    it("lists a dependency that is off as information, never a blocker", async () => {
        const org = await business();
        await switchModule(org, "APPOINTMENTS", "ENABLED");
        await switchModule(org, "CRM", "DISABLED");

        const state = await read(org);
        expect(row(state, "CRM").state).toBe("off");
        expect(row(state, "APPOINTMENTS")).toMatchObject({
            state: "on",
            dependencies: [{ moduleKey: "CRM", label: "CRM", on: false }],
        });
    });

    it("leaves hidden modules out, even switched on with their flag on", async () => {
        const org = await business();
        await switchModule(org, "CLASS_PACKS", "ENABLED");
        await switchModule(org, "AUTOMATIONS", "ENABLED");

        const keys = (await read(org)).modules.map((m) => m.moduleKey);
        expect(keys).not.toContain("CLASS_PACKS");
        expect(keys).not.toContain("AUTOMATIONS");
        expect(keys).toContain("APPOINTMENTS");
    });

    it("needs a session and organization:read, but no support session", async () => {
        const org = await business();
        const path = `/organizations/${org}/modules/state`;

        expect((await get(path)).status).toBe(401);
        // A business owner is not staff: no organization:read.
        expect((await get(path, people.owner)).status).toBe(403);
        // Support holds organization:read and has no session open here.
        expect((await get(path, people.support)).status).toBe(200);
    });

    it("404s for a business that doesn't exist", async () => {
        expect(
            (
                await get(
                    "/organizations/no-such-business/modules/state",
                    people.support,
                )
            ).status,
        ).toBe(404);
    });
});
