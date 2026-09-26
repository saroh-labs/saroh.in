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
import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { REQUIRE_MODULE_KEY } from "../capabilities/require-module.decorator";
import { OrganizationCatalogueController } from "../catalogue/catalogue.controller";
import { CatalogueController } from "../catalogue/store-catalogue.controller";
import {
    CategoriesController,
    OrganizationCategoriesController,
} from "../categories/categories.controller";
import type { OrganizationContextService } from "../organizations/organization-context.service";
import { OrganizationListingsController } from "./listings.controller";
import { OrganizationProductsController } from "./organization-products.controller";
import { ProductDetailsController } from "./product-details.controller";
import { ProductsController } from "./products.controller";

/**
 * Every products-area controller is signed-in only and switched off with
 * the COMMERCE module (#464). Read from the controllers' own metadata, so a
 * new controller that forgets either fails here, not in production.
 */
describe("products area: sign-in and the COMMERCE gate", () => {
    const controllers = [
        ProductsController,
        ProductDetailsController,
        CategoriesController,
        CatalogueController,
        OrganizationCategoriesController,
        OrganizationCatalogueController,
        OrganizationProductsController,
        OrganizationListingsController,
    ];

    it.each(controllers.map((c) => [c.name, c] as const))(
        "%s requires a session and the COMMERCE module",
        (_name, controller) => {
            const guards = Reflect.getMetadata(
                GUARDS_METADATA,
                controller,
            ) as unknown[];
            expect(guards).toEqual(
                expect.arrayContaining([
                    BetterAuthGuard,
                    ModuleEnforcementGuard,
                ]),
            );
            expect(Reflect.getMetadata(REQUIRE_MODULE_KEY, controller)).toBe(
                "COMMERCE",
            );
        },
    );
});

/**
 * The organization routes (#531) prove membership with the organization
 * guard, and with COMMERCE off every one of their handlers is refused 403.
 */
describe("organization product routes: COMMERCE off", () => {
    const orgControllers = [
        OrganizationProductsController,
        OrganizationListingsController,
    ];

    it.each(orgControllers.map((c) => [c.name, c] as const))(
        "%s runs the organization guard before the module guard",
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
        },
    );

    const handlers = orgControllers.flatMap((controller) =>
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
        expect(handlers.length).toBeGreaterThanOrEqual(20);
    });

    it.each(handlers)("%s → 403", async (_name, controller, handler) => {
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
    });
});
