// The real guard loads better-auth, an ESM build the unit project does not
// transform; a stand-in class is enough to check it is the one attached.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));

import "reflect-metadata";

import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";
import { GUARDS_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { Reflector } from "@nestjs/core";

import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { REQUIRE_MODULE_KEY } from "../capabilities/require-module.decorator";
import type { OrganizationContextService } from "../organizations/organization-context.service";
import { StockController } from "./stock.controller";

/**
 * The Stock API (#514) is signed-in, organization-scoped and switched off
 * with the COMMERCE module: with COMMERCE off, every handler is refused 403.
 * Read from the controller's own metadata, so a handler that slips out of
 * the class guards fails here.
 */
describe("Stock API: sign-in, the organization and the COMMERCE gate", () => {
    it("is nested under the organization", () => {
        expect(Reflect.getMetadata(PATH_METADATA, StockController)).toBe(
            "organizations/:organizationId/stock",
        );
    });

    it("runs sign-in, the organization guard, then the module guard", () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, StockController)).toEqual([
            BetterAuthGuard,
            OrganizationGuard,
            ModuleEnforcementGuard,
        ]);
        expect(Reflect.getMetadata(REQUIRE_MODULE_KEY, StockController)).toBe(
            "COMMERCE",
        );
    });

    const handlers = Object.getOwnPropertyNames(StockController.prototype)
        .filter((name) => name !== "constructor")
        .map((name) => {
            const handler = (
                StockController.prototype as unknown as Record<string, unknown>
            )[name] as () => unknown;
            return [name, handler] as const;
        });

    beforeEach(() => {
        process.env.MODULE_ENFORCEMENT = "1";
    });
    afterEach(() => {
        delete process.env.MODULE_ENFORCEMENT;
    });

    it("covers every endpoint", () => {
        expect(handlers.map(([name]) => name).sort()).toEqual(
            [
                "adjust",
                "counts",
                "entries",
                "getTracking",
                "levels",
                "listChecks",
                "log",
                "move",
                "resolveCheck",
                "reverse",
                "setTracking",
                "warnings",
            ].sort(),
        );
    });

    it.each(handlers)("%s → 403 with COMMERCE off", async (_name, handler) => {
        const evaluate = jest.fn().mockResolvedValue({
            blockers: [{ code: "MODULE_DISABLED" }],
            gatesPassed: false,
        });
        const guard = new ModuleEnforcementGuard(
            new Reflector(),
            { evaluate } as unknown as ModuleAvailabilityService,
            {} as OrganizationContextService,
        );
        const context = {
            getHandler: () => handler,
            getClass: () => StockController,
            switchToHttp: () => ({
                getRequest: () => ({
                    organizationContext: {
                        organizationId: "org_1",
                        userId: "u_1",
                        role: "OWNER",
                    },
                }),
            }),
        } as unknown as ExecutionContext;

        await expect(guard.canActivate(context)).rejects.toThrow(
            ForbiddenException,
        );
        expect(evaluate).toHaveBeenCalledWith(
            expect.objectContaining({
                organizationId: "org_1",
                moduleKey: "COMMERCE",
            }),
        );
    });
});
