import { NotFoundException } from "@nestjs/common";

// Stub the guard modules so importing the controller doesn't pull in
// better-auth's ESM (which ts-jest can't transform) — keeps this a pure unit
// test of the controller's routing/validation.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class {},
}));
jest.mock("../../common/guards/organization.guard", () => ({
    OrganizationGuard: class {},
}));

import type { OrganizationContext } from "../../common/types/organization-context";
import { CapabilitiesController } from "./capabilities.controller";
import type { ModuleAvailabilityService } from "./module-availability.service";
import type { ModuleLifecycleService } from "./module-lifecycle.service";

const CTX: OrganizationContext = {
    organizationId: "org_1",
    userId: "user_1",
    role: "OWNER",
};

function build() {
    const availability = {
        listViews: jest.fn().mockResolvedValue([{ key: "CRM" }]),
        view: jest.fn().mockResolvedValue({ key: "CRM", lifecycle: "ENABLED" }),
    } as unknown as ModuleAvailabilityService;
    const lifecycle = {
        enable: jest.fn().mockResolvedValue(undefined),
        disable: jest.fn().mockResolvedValue(undefined),
        archive: jest.fn().mockResolvedValue(undefined),
        selectForProject: jest.fn().mockResolvedValue(undefined),
        deselectForProject: jest.fn().mockResolvedValue(undefined),
    } as unknown as ModuleLifecycleService;
    return {
        controller: new CapabilitiesController(availability, lifecycle),
        availability,
        lifecycle,
    };
}

describe("CapabilitiesController", () => {
    it("lists effective modules with meta", async () => {
        const { controller, availability } = build();
        const res = await controller.list(CTX, "proj_1");
        expect(availability.listViews).toHaveBeenCalledWith({
            organizationId: "org_1",
            organizationRole: "OWNER",
            projectId: "proj_1",
        });
        expect(res.meta).toEqual({
            organizationId: "org_1",
            projectId: "proj_1",
        });
        expect(res.data).toEqual([{ key: "CRM" }]);
    });

    it("routes each status to the matching lifecycle command", async () => {
        const { controller, lifecycle } = build();
        await controller.setStatus(CTX, "CRM", { status: "ENABLED" });
        expect(lifecycle.enable).toHaveBeenCalledWith(CTX, "CRM");
        await controller.setStatus(CTX, "CRM", { status: "DISABLED" });
        expect(lifecycle.disable).toHaveBeenCalledWith(CTX, "CRM");
        await controller.setStatus(CTX, "COMMERCE", { status: "ARCHIVED" });
        expect(lifecycle.archive).toHaveBeenCalledWith(CTX, "COMMERCE");
    });

    it("rejects an unknown module key with 404", async () => {
        const { controller, lifecycle } = build();
        await expect(
            controller.setStatus(CTX, "NOPE", { status: "ENABLED" }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(lifecycle.enable).not.toHaveBeenCalled();
    });

    it("selects and deselects a module for a Project", async () => {
        const { controller, lifecycle } = build();
        await controller.selectForProject(CTX, "proj_1", "CRM");
        expect(lifecycle.selectForProject).toHaveBeenCalledWith(
            CTX,
            "proj_1",
            "CRM",
        );
        await controller.deselectForProject(CTX, "proj_1", "CRM");
        expect(lifecycle.deselectForProject).toHaveBeenCalledWith(
            CTX,
            "proj_1",
            "CRM",
        );
    });

    it("DELETE disables the module", async () => {
        const { controller, lifecycle } = build();
        await controller.disable(CTX, "CRM");
        expect(lifecycle.disable).toHaveBeenCalledWith(CTX, "CRM");
    });
});
