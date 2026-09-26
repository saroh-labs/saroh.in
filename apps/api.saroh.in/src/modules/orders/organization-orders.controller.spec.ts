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
import type { OrderKitchenService } from "./order-kitchen.service";
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
    const controller = new OrganizationOrdersController(
        { listForOrganization } as unknown as OrdersService,
        {} as unknown as OrderKitchenService,
    );

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

    it("refuses a REVIEWER, who cannot read orders", () => {
        expect(() => controller.list(as("REVIEWER"))).toThrow(
            ForbiddenException,
        );
        expect(listForOrganization).not.toHaveBeenCalled();
    });

    it("gives a MEMBER, who moves kitchen stages, the kitchen's view", async () => {
        await controller.list(as("MEMBER"));
        expect(listForOrganization).toHaveBeenCalledWith(
            "org_1",
            { storeId: undefined },
            { kitchenOnly: true },
        );
    });

    it.each(["OWNER", "ADMIN"] as const)(
        "lets a %s read them in full",
        async (role) => {
            await controller.list(as(role));
            expect(listForOrganization).toHaveBeenCalledWith(
                "org_1",
                { storeId: undefined },
                { kitchenOnly: false },
            );
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
