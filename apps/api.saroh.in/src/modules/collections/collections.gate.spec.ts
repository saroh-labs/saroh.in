// The real guard loads better-auth, an ESM build the unit project does not
// transform; a stand-in class is enough to check it is the one attached.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));

import "reflect-metadata";

import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { Reflector } from "@nestjs/core";

import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { REQUIRE_MODULE_KEY } from "../capabilities/require-module.decorator";
import type { OrganizationContextService } from "../organizations/organization-context.service";
import { resolveCapabilities } from "../organizations/organization-policy";
import {
    OrganizationCollectionsController,
    ProductCollectionsController,
} from "./collections.controller";
import { readCollections, writeCollections } from "./collections.service";

/**
 * Collections (#516) are signed-in, organization-proved routes switched off
 * with the COMMERCE module. Read from the controllers' own metadata, so a
 * handler added without the gate fails here, not in production.
 */
describe("collections: sign-in, the organization guard and COMMERCE", () => {
    const controllers = [
        OrganizationCollectionsController,
        ProductCollectionsController,
    ];

    it.each(controllers.map((c) => [c.name, c] as const))(
        "%s runs the session, organization and module guards, in order",
        (_name, controller) => {
            const guards = Reflect.getMetadata(
                GUARDS_METADATA,
                controller,
            ) as unknown[];
            expect(guards).toEqual([
                BetterAuthGuard,
                OrganizationGuard,
                ModuleEnforcementGuard,
            ]);
            expect(Reflect.getMetadata(REQUIRE_MODULE_KEY, controller)).toBe(
                "COMMERCE",
            );
        },
    );

    const handlers = controllers.flatMap((controller) =>
        Object.getOwnPropertyNames(controller.prototype)
            .filter((name) => name !== "constructor")
            .map((name) => {
                const handler = (
                    controller.prototype as unknown as Record<string, unknown>
                )[name] as () => unknown;
                return [
                    `${controller.name}.${name}`,
                    controller,
                    handler,
                ] as const;
            }),
    );

    beforeEach(() => {
        process.env.MODULE_ENFORCEMENT = "1";
    });
    afterEach(() => {
        delete process.env.MODULE_ENFORCEMENT;
    });

    it("covers every handler", () => {
        expect(handlers).toHaveLength(10);
    });

    it.each(handlers)(
        "%s → 403 with COMMERCE off",
        async (_name, controller, handler) => {
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
                getClass: () => controller,
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
        },
    );
});

describe("collections: who may read and change them", () => {
    const ctx = (
        role: OrganizationContext["role"],
        actions?: string[],
    ): OrganizationContext => ({
        organizationId: "org_rye",
        userId: "u_1",
        role,
        ...(actions
            ? {
                  roleKey: "custom",
                  actions: resolveCapabilities("custom", actions),
              }
            : {}),
    });

    it("an owner reads and changes them, at the business the guard proved", () => {
        expect(readCollections(ctx("OWNER"))).toBe("org_rye");
        expect(writeCollections(ctx("OWNER"))).toBe("org_rye");
    });

    it("someone who can only read the catalogue can't change them", () => {
        const reader = ctx("MEMBER", ["store:read"]);
        expect(readCollections(reader)).toBe("org_rye");
        expect(() => writeCollections(reader)).toThrow(
            "Your role can't change collections.",
        );
    });

    it("counting stock is not enough to change them", () => {
        const clerk = ctx("MEMBER", ["store:read", "inventory:write"]);
        expect(() => writeCollections(clerk)).toThrow(ForbiddenException);
    });

    it("someone who can't read the catalogue reads nothing", () => {
        expect(() => readCollections(ctx("MEMBER", []))).toThrow(
            ForbiddenException,
        );
    });
});
