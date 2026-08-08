import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";

import type { ModuleAvailabilityService } from "./module-availability.service";
import { ModuleEnforcementGuard } from "./module-enforcement.guard";

function execContext(request: unknown): ExecutionContext {
    return {
        getHandler: () => () => undefined,
        getClass: () => class {},
        switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
}

function build(opts: { moduleKey?: string; blockers?: { code: string }[] }) {
    const reflector = {
        getAllAndOverride: jest.fn().mockReturnValue(opts.moduleKey),
    } as unknown as Reflector;
    const evaluate = jest
        .fn()
        .mockResolvedValue({ blockers: opts.blockers ?? [] });
    const availability = { evaluate } as unknown as ModuleAvailabilityService;
    return {
        guard: new ModuleEnforcementGuard(reflector, availability),
        evaluate,
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
});
