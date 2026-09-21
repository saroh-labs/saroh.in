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
import { DiscountsController } from "./discounts.controller";
import type { DiscountsService } from "./discounts.service";

describe("DiscountsController authorization", () => {
    const service = {
        list: jest.fn().mockResolvedValue([]),
        get: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
    };
    const controller = new DiscountsController(
        service as unknown as DiscountsService,
    );
    const as = (
        role: OrganizationContext["role"],
        over: Partial<OrganizationContext> = {},
    ): OrganizationContext => ({
        organizationId: "org_1",
        userId: "u_1",
        role,
        ...over,
    });

    beforeEach(() => Object.values(service).forEach((m) => m.mockClear()));

    it.each(["MEMBER", "REVIEWER"] as const)(
        "refuses a %s even the list",
        (role) => {
            expect(() => controller.list(as(role))).toThrow(ForbiddenException);
            expect(() => controller.create(as(role), {})).toThrow(
                ForbiddenException,
            );
            expect(service.list).not.toHaveBeenCalled();
        },
    );

    it("lets an Admin read and write", async () => {
        await controller.list(as("ADMIN"));
        await controller.create(as("ADMIN"), { code: "X" });
        expect(service.create).toHaveBeenCalledWith("org_1", { code: "X" });
    });

    it("follows an invented role: reading is not writing", async () => {
        const clerk = as("MEMBER", {
            roleKey: "till",
            actions: resolveCapabilities("till", ["discount:read"]),
        });
        await controller.list(clerk);
        expect(service.list).toHaveBeenCalled();
        expect(() => controller.update(clerk, "d_1", {})).toThrow(
            ForbiddenException,
        );
    });
});
