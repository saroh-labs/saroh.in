jest.mock("@saroh/database", () => ({
    prisma: { store: { findFirst: jest.fn() } },
}));
jest.mock("./module-enforcement.log", () => ({
    logModuleEnforcement: jest.fn(),
}));

import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";

import { prisma } from "@saroh/database";

import { isMemberPaused, memberPaused } from "../billing/paused-errors";
import type { OrganizationContextService } from "../organizations/organization-context.service";
import type { ModuleAvailabilityService } from "./module-availability.service";
import {
    ModuleEnforcementGuard,
    moduleEnforcementMode,
} from "./module-enforcement.guard";
import { logModuleEnforcement } from "./module-enforcement.log";
import { IGNORE_MODULE_READINESS_KEY } from "./require-module.decorator";

const storeFindFirst = prisma.store.findFirst as jest.Mock;
const logged = logModuleEnforcement as jest.Mock;

function execContext(request: unknown): ExecutionContext {
    return {
        getHandler: () => () => undefined,
        getClass: () => class {},
        switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
}

function build(opts: {
    moduleKey?: string;
    blockers?: { code: string }[];
    gatesPassed?: boolean;
    /** Org context resolved from a store, or an error the resolver throws. */
    resolved?: unknown;
    resolveError?: Error;
}) {
    const reflector = {
        getAllAndOverride: jest.fn().mockReturnValue(opts.moduleKey),
    } as unknown as Reflector;
    const evaluate = jest.fn().mockResolvedValue({
        blockers: opts.blockers ?? [],
        gatesPassed: opts.gatesPassed ?? false,
    });
    const availability = { evaluate } as unknown as ModuleAvailabilityService;
    const resolve = opts.resolveError
        ? jest.fn().mockRejectedValue(opts.resolveError)
        : jest.fn().mockResolvedValue(
              opts.resolved ?? {
                  organizationId: "org_1",
                  userId: "u",
                  role: "OWNER",
              },
          );
    const organizations = {
        resolve,
    } as unknown as OrganizationContextService;
    return {
        guard: new ModuleEnforcementGuard(
            reflector,
            availability,
            organizations,
        ),
        evaluate,
        resolve,
    };
}

const REQUEST = {
    organizationContext: {
        organizationId: "org_1",
        userId: "u",
        role: "OWNER",
    },
};

describe("ModuleEnforcementGuard", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        storeFindFirst.mockResolvedValue({ organizationId: "org_1" });
    });

    afterEach(() => {
        delete process.env.MODULE_ENFORCEMENT;
    });

    it("allows an unannotated route without evaluating", async () => {
        const { guard, evaluate } = build({ moduleKey: undefined });
        process.env.MODULE_ENFORCEMENT = "1";
        await expect(guard.canActivate(execContext(REQUEST))).resolves.toBe(
            true,
        );
        expect(evaluate).not.toHaveBeenCalled();
    });

    it("is a no-op while enforcement is dark (flag unset)", async () => {
        const { guard, evaluate } = build({
            moduleKey: "CRM",
            blockers: [{ code: "ORG_MODULE_DISABLED" }],
        });
        // MODULE_ENFORCEMENT unset → allow even though the module is unavailable.
        await expect(guard.canActivate(execContext(REQUEST))).resolves.toBe(
            true,
        );
        expect(evaluate).not.toHaveBeenCalled();
    });

    it("allows when enforcement is on and the module is available", async () => {
        const { guard } = build({ moduleKey: "CRM", blockers: [] });
        process.env.MODULE_ENFORCEMENT = "1";
        await expect(guard.canActivate(execContext(REQUEST))).resolves.toBe(
            true,
        );
    });

    it("404s an unauthorized actor (no existence leak)", async () => {
        const { guard } = build({
            moduleKey: "CRM",
            blockers: [{ code: "UNAUTHORIZED" }],
        });
        process.env.MODULE_ENFORCEMENT = "1";
        await expect(
            guard.canActivate(execContext(REQUEST)),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("403s a disabled/unselected module without leaking flag detail", async () => {
        const { guard } = build({
            moduleKey: "CRM",
            blockers: [{ code: "ORG_MODULE_DISABLED" }],
        });
        process.env.MODULE_ENFORCEMENT = "1";
        await expect(
            guard.canActivate(execContext(REQUEST)),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    describe("MODULE_ENFORCEMENT's three modes", () => {
        it.each([
            [undefined, "off"],
            ["", "off"],
            ["0", "off"],
            ["false", "off"],
            ["shadow", "shadow"],
            ["1", "on"],
            ["true", "on"],
        ])("%s reads as %s", (value, mode) => {
            if (value === undefined) delete process.env.MODULE_ENFORCEMENT;
            else process.env.MODULE_ENFORCEMENT = value;
            expect(moduleEnforcementMode()).toBe(mode);
        });
    });

    describe("logging (#117)", () => {
        const ROUTED = {
            ...REQUEST,
            method: "POST",
            route: { path: "/organizations/:organizationId/orders" },
        };

        it("logs nothing, and looks nothing up, while off", async () => {
            const { guard, evaluate } = build({
                moduleKey: "CRM",
                blockers: [{ code: "ORG_MODULE_DISABLED" }],
            });
            await guard.canActivate(execContext(ROUTED));
            expect(evaluate).not.toHaveBeenCalled();
            expect(logged).not.toHaveBeenCalled();
        });

        it("shadow lets a request through and logs what it would refuse", async () => {
            process.env.MODULE_ENFORCEMENT = "shadow";
            const { guard } = build({
                moduleKey: "COMMERCE",
                blockers: [{ code: "ORG_MODULE_DISABLED" }],
            });
            await expect(guard.canActivate(execContext(ROUTED))).resolves.toBe(
                true,
            );
            expect(logged).toHaveBeenCalledWith(
                "module_enforcement_would_refuse",
                {
                    module: "COMMERCE",
                    route: "POST /organizations/:organizationId/orders",
                    org: "org_1",
                    blockers: ["ORG_MODULE_DISABLED"],
                    status: 403,
                },
            );
        });

        it("shadow names a would-be 404 for an actor who may not use the module", async () => {
            process.env.MODULE_ENFORCEMENT = "shadow";
            const { guard } = build({
                moduleKey: "CRM",
                blockers: [{ code: "UNAUTHORIZED" }],
            });
            await expect(guard.canActivate(execContext(ROUTED))).resolves.toBe(
                true,
            );
            expect(logged).toHaveBeenCalledWith(
                "module_enforcement_would_refuse",
                expect.objectContaining({ status: 404 }),
            );
        });

        it("shadow logs nothing when the module is available", async () => {
            process.env.MODULE_ENFORCEMENT = "shadow";
            const { guard, evaluate } = build({ moduleKey: "CRM" });
            await expect(guard.canActivate(execContext(ROUTED))).resolves.toBe(
                true,
            );
            expect(evaluate).toHaveBeenCalled();
            expect(logged).not.toHaveBeenCalled();
        });

        it("shadow never fails a request when the lookup throws", async () => {
            process.env.MODULE_ENFORCEMENT = "shadow";
            const { guard, evaluate } = build({ moduleKey: "CRM" });
            evaluate.mockRejectedValue(new Error("db down"));
            await expect(guard.canActivate(execContext(ROUTED))).resolves.toBe(
                true,
            );
            expect(logged).toHaveBeenCalledWith(
                "module_enforcement_shadow_failed",
                {
                    module: "CRM",
                    route: "POST /organizations/:organizationId/orders",
                },
            );
        });

        it("shadow leaves a paused member to the service, unlogged", async () => {
            process.env.MODULE_ENFORCEMENT = "shadow";
            const { guard } = build({
                moduleKey: "COMMERCE",
                resolveError: memberPaused("Rye Bakery"),
            });
            await expect(
                guard.canActivate(
                    execContext({
                        user: { id: "u" },
                        params: { storeId: "store_1" },
                    }),
                ),
            ).resolves.toBe(true);
            expect(logged).not.toHaveBeenCalled();
        });

        it("on logs the refusal it answers with", async () => {
            process.env.MODULE_ENFORCEMENT = "1";
            const { guard } = build({
                moduleKey: "COMMERCE",
                blockers: [{ code: "ORG_MODULE_DISABLED" }],
            });
            await expect(
                guard.canActivate(execContext(ROUTED)),
            ).rejects.toBeInstanceOf(ForbiddenException);
            expect(logged).toHaveBeenCalledWith("module_enforcement_refused", {
                module: "COMMERCE",
                route: "POST /organizations/:organizationId/orders",
                org: "org_1",
                blockers: ["ORG_MODULE_DISABLED"],
                status: 403,
            });
        });

        it("on logs nothing for a request it lets through", async () => {
            process.env.MODULE_ENFORCEMENT = "1";
            const { guard } = build({ moduleKey: "COMMERCE" });
            await guard.canActivate(execContext(ROUTED));
            expect(logged).not.toHaveBeenCalled();
        });

        it("names the controller and handler when there is no route template", async () => {
            process.env.MODULE_ENFORCEMENT = "1";
            const { guard } = build({
                moduleKey: "CRM",
                blockers: [{ code: "UNAUTHORIZED" }],
            });
            class LeadsController {}
            function list() {
                return undefined;
            }
            const context = {
                getHandler: () => list,
                getClass: () => LeadsController,
                switchToHttp: () => ({ getRequest: () => REQUEST }),
            } as unknown as ExecutionContext;
            await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
                NotFoundException,
            );
            expect(logged).toHaveBeenCalledWith(
                "module_enforcement_refused",
                expect.objectContaining({
                    route: "LeadsController.list",
                    status: 404,
                }),
            );
        });
    });

    describe("a route that works before setup is finished", () => {
        // Payments with no provider connected is "not ready", and invoices
        // recorded by hand need no provider (ADR-007). The readiness opt-out
        // passes once every gate has — and only then.
        function optedOut(blockers: { code: string }[], gatesPassed = false) {
            const built = build({
                moduleKey: "PAYMENTS",
                blockers,
                gatesPassed,
            });
            const reflector = {
                getAllAndOverride: jest.fn((key: string) =>
                    key === IGNORE_MODULE_READINESS_KEY ? true : "PAYMENTS",
                ),
            } as unknown as Reflector;
            return new ModuleEnforcementGuard(
                reflector,
                {
                    evaluate: built.evaluate,
                } as unknown as ModuleAvailabilityService,
                {} as OrganizationContextService,
            );
        }

        it("allows a module whose only blocker is unfinished setup", async () => {
            process.env.MODULE_ENFORCEMENT = "1";
            const guard = optedOut([{ code: "PAYMENTS_NO_PROVIDER" }], true);
            await expect(guard.canActivate(execContext(REQUEST))).resolves.toBe(
                true,
            );
        });

        it("refuses a gate it has never heard of, rather than failing open", async () => {
            process.env.MODULE_ENFORCEMENT = "1";
            const guard = optedOut([{ code: "SOME_NEW_GATE" }], false);
            await expect(
                guard.canActivate(execContext(REQUEST)),
            ).rejects.toBeInstanceOf(ForbiddenException);
        });

        it("still refuses a module that is switched off", async () => {
            process.env.MODULE_ENFORCEMENT = "1";
            const guard = optedOut([{ code: "ORG_MODULE_DISABLED" }]);
            await expect(
                guard.canActivate(execContext(REQUEST)),
            ).rejects.toBeInstanceOf(ForbiddenException);
        });

        it("still 404s an actor who may not use the module", async () => {
            process.env.MODULE_ENFORCEMENT = "1";
            const guard = optedOut([{ code: "UNAUTHORIZED" }]);
            await expect(
                guard.canActivate(execContext(REQUEST)),
            ).rejects.toBeInstanceOf(NotFoundException);
        });

        it("refuses unfinished setup on a route that did not opt out", async () => {
            process.env.MODULE_ENFORCEMENT = "1";
            const reflector = {
                getAllAndOverride: jest.fn((key: string) =>
                    key === IGNORE_MODULE_READINESS_KEY
                        ? undefined
                        : "PAYMENTS",
                ),
            } as unknown as Reflector;
            const guard = new ModuleEnforcementGuard(
                reflector,
                {
                    evaluate: jest.fn().mockResolvedValue({
                        blockers: [{ code: "PAYMENTS_NO_PROVIDER" }],
                    }),
                } as unknown as ModuleAvailabilityService,
                {} as OrganizationContextService,
            );
            await expect(
                guard.canActivate(execContext(REQUEST)),
            ).rejects.toBeInstanceOf(ForbiddenException);
        });
    });

    it("skips public/webhook requests with no Organization context", async () => {
        const { guard, evaluate } = build({
            moduleKey: "CRM",
            blockers: [{ code: "ORG_MODULE_DISABLED" }],
        });
        process.env.MODULE_ENFORCEMENT = "1";
        await expect(guard.canActivate(execContext({}))).resolves.toBe(true);
        expect(evaluate).not.toHaveBeenCalled();
    });

    describe("store-scoped routes (no OrganizationGuard)", () => {
        const STORE_REQUEST = {
            user: { id: "u" },
            params: { storeId: "store_1" },
        };

        it("does not touch the database while enforcement is dark", async () => {
            const { guard, evaluate } = build({ moduleKey: "COMMERCE" });
            await expect(
                guard.canActivate(execContext(STORE_REQUEST)),
            ).resolves.toBe(true);
            // The whole point of annotating ahead of the flip: zero cost and
            // zero behaviour change until MODULE_ENFORCEMENT is set.
            expect(storeFindFirst).not.toHaveBeenCalled();
            expect(evaluate).not.toHaveBeenCalled();
        });

        it("resolves the Organization from the store and enforces", async () => {
            process.env.MODULE_ENFORCEMENT = "1";
            const { guard, evaluate, resolve } = build({
                moduleKey: "COMMERCE",
                blockers: [{ code: "ORG_MODULE_DISABLED" }],
            });
            await expect(
                guard.canActivate(execContext(STORE_REQUEST)),
            ).rejects.toBeInstanceOf(ForbiddenException);
            expect(resolve).toHaveBeenCalledWith("u", "org_1");
            expect(evaluate).toHaveBeenCalled();
        });

        it("allows when the store's module is available", async () => {
            process.env.MODULE_ENFORCEMENT = "1";
            const { guard } = build({ moduleKey: "COMMERCE" });
            await expect(
                guard.canActivate(execContext(STORE_REQUEST)),
            ).resolves.toBe(true);
        });

        it("does not enforce for a user with no Organization membership", async () => {
            // A legacy StoreOwner/StoreMembers grant can authorize store access
            // without org membership. Enforcement must not silently become an
            // authorization change for un-migrated staff — the service layer
            // still decides whether they may read or write.
            process.env.MODULE_ENFORCEMENT = "1";
            const { guard, evaluate } = build({
                moduleKey: "COMMERCE",
                resolveError: new Error("not a member"),
                blockers: [{ code: "ORG_MODULE_DISABLED" }],
            });
            await expect(
                guard.canActivate(execContext(STORE_REQUEST)),
            ).resolves.toBe(true);
            expect(evaluate).not.toHaveBeenCalled();
        });

        it("answers a paused team member with MEMBER_PAUSED first, not a module refusal (#800)", async () => {
            process.env.MODULE_ENFORCEMENT = "1";
            const paused = memberPaused("Rye Bakery");
            const { guard, evaluate } = build({
                moduleKey: "COMMERCE",
                resolveError: paused,
                blockers: [{ code: "ORG_MODULE_DISABLED" }],
            });
            const err = await guard
                .canActivate(execContext(STORE_REQUEST))
                .catch((e: unknown) => e);
            expect(err).toBe(paused);
            expect(isMemberPaused(err)).toBe(true);
            // Asked before any module question.
            expect(evaluate).not.toHaveBeenCalled();
        });

        it("does not enforce when the store does not exist", async () => {
            process.env.MODULE_ENFORCEMENT = "1";
            storeFindFirst.mockResolvedValue(null);
            const { guard, evaluate } = build({
                moduleKey: "COMMERCE",
                blockers: [{ code: "ORG_MODULE_DISABLED" }],
            });
            await expect(
                guard.canActivate(execContext(STORE_REQUEST)),
            ).resolves.toBe(true);
            expect(evaluate).not.toHaveBeenCalled();
        });

        it("does not enforce an unauthenticated request", async () => {
            process.env.MODULE_ENFORCEMENT = "1";
            const { guard, evaluate } = build({
                moduleKey: "COMMERCE",
                blockers: [{ code: "ORG_MODULE_DISABLED" }],
            });
            await expect(
                guard.canActivate(
                    execContext({ params: { storeId: "store_1" } }),
                ),
            ).resolves.toBe(true);
            expect(evaluate).not.toHaveBeenCalled();
        });

        it("prefers an already-resolved context over the store lookup", async () => {
            process.env.MODULE_ENFORCEMENT = "1";
            const { guard, resolve } = build({ moduleKey: "COMMERCE" });
            await expect(guard.canActivate(execContext(REQUEST))).resolves.toBe(
                true,
            );
            expect(storeFindFirst).not.toHaveBeenCalled();
            expect(resolve).not.toHaveBeenCalled();
        });
    });
});
