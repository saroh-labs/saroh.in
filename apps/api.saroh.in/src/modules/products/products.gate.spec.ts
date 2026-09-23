// The real guard loads better-auth, an ESM build the unit project does not
// transform; a stand-in class is enough to check it is the one attached.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));

import "reflect-metadata";

import { GUARDS_METADATA } from "@nestjs/common/constants";

import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { REQUIRE_MODULE_KEY } from "../capabilities/require-module.decorator";
import { CatalogueController } from "../catalogue/catalogue.controller";
import { CategoriesController } from "../categories/categories.controller";
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
