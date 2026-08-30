jest.mock("@saroh/database", () => ({
    prisma: { store: { findFirst: jest.fn() } },
}));

import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";

import { prisma } from "@saroh/database";

import type { OrganizationContextService } from "../organizations/organization-context.service";
import type { ModuleAvailabilityService } from "./module-availability.service";
import { ModuleEnforcementGuard } from "./module-enforcement.guard";

const storeFindFirst = prisma.store.findFirst as jest.Mock;

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
    /** Org context resolved from a store, or an error the resolver throws. */
    resolved?: unknown;
    resolveError?: Error;
}) {
    const reflector = {
        getAllAndOverride: jest.fn().mockReturnValue(opts.moduleKey),
    } as unknown as Reflector;
    const evaluate = jest
        .fn()
        .mockResolvedValue({ blockers: opts.blockers ?? [] });
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
