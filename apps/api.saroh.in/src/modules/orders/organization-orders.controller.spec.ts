// The guards pull in Better Auth, which Jest cannot parse; this spec is about
// the policy check the controller makes itself, so they are stood in for, the
// same way `capabilities.controller.spec.ts` does it.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class {},
}));
jest.mock("../../common/guards/organization.guard", () => ({
    OrganizationGuard: class {},
}));
jest.mock("../capabilities/module-enforcement.guard", () => ({
    ModuleEnforcementGuard: class {},
}));

import { ForbiddenException } from "@nestjs/common";

import type { OrganizationContext } from "../../common/types/organization-context";
import { resolveCapabilities } from "../organizations/organization-policy";
import type { OrdersService } from "./orders.service";
import { OrganizationOrdersController } from "./organization-orders.controller";

/**
 * Who may list every order in the business.
 *
 * Exists because the first version did not ask: the org and module guards
 * passed, and a Reviewer — website-only, the narrowest role there is — got
 * every order, with customer names, emails and totals.
 */
describe("OrganizationOrdersController", () => {
    const listForOrganization = jest.fn().mockResolvedValue([]);
    const controller = new OrganizationOrdersController({
        listForOrganization,
    } as unknown as OrdersService);

    const as = (
        role: OrganizationContext["role"],
        over: Partial<OrganizationContext> = {},
    ): OrganizationContext => ({
        organizationId: "org_1",
        userId: "user_1",
        role,
        ...over,
    });

    beforeEach(() => listForOrganization.mockClear());

    it.each(["REVIEWER", "MEMBER"] as const)(
        "refuses a %s, who cannot read orders",
        (role) => {
            expect(() => controller.list(as(role))).toThrow(ForbiddenException);
            expect(listForOrganization).not.toHaveBeenCalled();
        },
    );

    it.each(["OWNER", "ADMIN"] as const)(
        "lets a %s read them",
        async (role) => {
            await controller.list(as(role));
            expect(listForOrganization).toHaveBeenCalledWith("org_1", {
                storeId: undefined,
            });
        },
    );

    it("follows an invented role's own permissions", async () => {
        const clerk = as("MEMBER", {
            roleKey: "stock-clerk",
            actions: resolveCapabilities("stock-clerk", ["order:read"]),
        });
        await controller.list(clerk);
        expect(listForOrganization).toHaveBeenCalled();

        const tidier = as("MEMBER", {
            roleKey: "shelf-tidier",
            actions: resolveCapabilities("shelf-tidier", ["store:read"]),
        });
        expect(() => controller.list(tidier)).toThrow(ForbiddenException);
    });
});
