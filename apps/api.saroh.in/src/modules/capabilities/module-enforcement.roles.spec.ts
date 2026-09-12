jest.mock("@saroh/database", () => ({
    ...jest.requireActual("@saroh/database"),
    prisma: {
        store: { findFirst: jest.fn() },
        site: { findFirst: jest.fn().mockResolvedValue({ id: "site_1" }) },
        page: {
            // The page, with the draft section a note can be pinned to (#277):
            // createComment refuses a key that is not on the page.
            findFirst: jest.fn().mockResolvedValue({
                id: "page_1",
                title: "Home",
                versions: [{ sections: [{ key: "hero" }] }],
            }),
            findMany: jest.fn().mockResolvedValue([]),
        },
        siteComment: {
            findMany: jest.fn().mockResolvedValue([]),
            create: jest.fn().mockResolvedValue({ id: "note_1" }),
            count: jest.fn().mockResolvedValue(0),
        },
        siteApproval: {
            create: jest.fn().mockResolvedValue({ id: "approval_1" }),
            findFirst: jest.fn().mockResolvedValue(null),
            // #278 reads every verdict to decide where the site stands.
            findMany: jest.fn().mockResolvedValue([]),
        },
    },
}));

import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";

import type { OrgRole } from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import type { OrganizationContextService } from "../organizations/organization-context.service";
import { SitesService } from "../sites/sites.service";
import { ModuleAvailabilityService } from "./module-availability.service";
import { ModuleEnforcementGuard } from "./module-enforcement.guard";
import type { ModuleKey } from "./module-registry";
import { MODULE_KEYS } from "./module-registry";
import type { ModuleReadinessRegistry } from "./readiness/module-readiness.registry";

/**
 * The guard with the REAL availability service behind it (#274).
 *
 * `module-enforcement.guard.spec.ts` stubs `evaluate`, so it proves what the
 * guard does with a blocker, not which roles get one. That gap is how the
 * WEBSITE module shipped gated on `site:update`: every route a REVIEWER exists
 * to call would have returned 404 the moment MODULE_ENFORCEMENT was switched
 * on, and no test could see it. Here the registry, the policy and the guard all
 * run for real. Only I/O is faked, with every module installed, rolled out,
 * entitled and ready, so authorization is the only gate that can close.
 */
function guardFor(moduleKey: ModuleKey): ModuleEnforcementGuard {
    const reflector = {
        getAllAndOverride: jest.fn().mockReturnValue(moduleKey),
    } as unknown as Reflector;
    const availability = new ModuleAvailabilityService(
        {
            isEnabled: jest.fn().mockResolvedValue(true),
        } as unknown as FeatureFlagService,
        {
            can: jest.fn().mockResolvedValue(true),
        } as unknown as EntitlementService,
        {
            evaluate: jest
                .fn()
                .mockResolvedValue({ readiness: "ACTIVE", blockers: [] }),
        } as unknown as ModuleReadinessRegistry,
        {
            organizationModule: {
                findUnique: jest.fn().mockResolvedValue({ status: "ENABLED" }),
            },
            projectModule: { count: jest.fn().mockResolvedValue(1) },
        } as never,
    );
    const organizations = {
        resolve: jest.fn(),
    } as unknown as OrganizationContextService;
    return new ModuleEnforcementGuard(reflector, availability, organizations);
}

function asRole(role: OrgRole): ExecutionContext {
    const request = {
        organizationContext: { organizationId: "org_1", userId: "u", role },
    };
    return {
        getHandler: () => () => undefined,
        getClass: () => class {},
        switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
}

describe("ModuleEnforcementGuard by role, with enforcement on", () => {
    const previousEnforcement = process.env.MODULE_ENFORCEMENT;
    beforeEach(() => {
        process.env.MODULE_ENFORCEMENT = "1";
    });

    afterEach(() => {
        if (previousEnforcement === undefined)
            delete process.env.MODULE_ENFORCEMENT;
        else process.env.MODULE_ENFORCEMENT = previousEnforcement;
    });

    it.each(["OWNER", "ADMIN", "MEMBER", "REVIEWER"] as const)(
        "preserves module access for %s",
        async (role) => {
            for (const key of MODULE_KEYS) {
                const result = guardFor(key).canActivate(asRole(role));
                if (role === "OWNER" || role === "ADMIN" || key === "WEBSITE") {
                    await expect(result).resolves.toBe(true);
                } else {
                    await expect(result).rejects.toBeInstanceOf(
                        NotFoundException,
                    );
                }
            }
        },
    );

    it("lets reviewers reach review services but refuses draft writes and publishing with 403", async () => {
        const ctx = {
            organizationId: "org_1",
            userId: "u",
            role: "REVIEWER" as const,
        };
        const service = new SitesService({} as EntitlementService);
        const guard = guardFor("WEBSITE");
        async function run<T>(handler: () => Promise<T>): Promise<T> {
            await guard.canActivate(asRole("REVIEWER"));
            return handler();
        }
        await expect(
            run(() => service.listComments(ctx, "site_1")),
        ).resolves.toEqual([]);
        await expect(
            run(() => service.getReviewState(ctx, "site_1")),
        ).resolves.toMatchObject({ openNotes: 0 });
        await expect(
            run(() =>
                service.createComment(ctx, "site_1", {
                    pageId: "page_1",
                    sectionKey: "hero",
                    body: "Looks good",
                }),
            ),
        ).resolves.toEqual({ id: "note_1" });
        await expect(
            run(() =>
                service.createApproval(ctx, "site_1", { outcome: "APPROVED" }),
            ),
        ).resolves.toEqual({ id: "approval_1" });
        await expect(
            run(() =>
                service.replaceDraftSections(ctx, "site_1", "page_1", {
                    sections: [],
                }),
            ),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            run(() => service.publishSite(ctx, "site_1")),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});
