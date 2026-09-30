import { BadRequestException, NotFoundException } from "@nestjs/common";

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
import type { ModuleSetupService } from "./setup/module-setup.service";

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
        impact: jest.fn((_ctx: unknown, moduleKey: string) =>
            Promise.resolve({
                moduleKey,
                enabled: true,
                goesWith: [],
                items: [],
                blockers: [],
            }),
        ),
    } as unknown as ModuleLifecycleService;
    const setup = {
        enable: jest.fn().mockResolvedValue({
            alreadyEnabled: false,
            created: { pipelineId: "pipe_1" },
        }),
        defaults: jest.fn((_ctx: unknown, moduleKey: string) =>
            Promise.resolve({
                moduleKey,
                hidden: false,
                dependencies: [],
                setup: {},
                existing: null,
            }),
        ),
    } as unknown as ModuleSetupService;
    return {
        controller: new CapabilitiesController(availability, lifecycle, setup),
        availability,
        lifecycle,
        setup,
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

    it("an enable without setup is the previous app's call: lifecycle alone, the view alone (DEC-068)", async () => {
        const { controller, lifecycle, setup } = build();
        const res = await controller.setStatus(CTX, "CRM", {
            status: "ENABLED",
        });
        expect(lifecycle.enable).toHaveBeenCalledWith(CTX, "CRM");
        expect(setup.enable).not.toHaveBeenCalled();
        expect(res).toEqual({ data: { key: "CRM", lifecycle: "ENABLED" } });
    });

    it("an enable with setup goes to the setup, and says what it did", async () => {
        const { controller, lifecycle, setup } = build();
        const res = await controller.setStatus(CTX, "CRM", {
            status: "ENABLED",
            setup: {},
        });
        expect(setup.enable).toHaveBeenCalledWith(CTX, "CRM", {});
        expect(lifecycle.enable).not.toHaveBeenCalled();
        expect(res).toEqual({
            data: { key: "CRM", lifecycle: "ENABLED" },
            alreadyEnabled: false,
            created: { pipelineId: "pipe_1" },
        });
    });

    it("refuses a setup with any status but ENABLED", async () => {
        const { controller, lifecycle, setup } = build();
        for (const status of ["DISABLED", "ARCHIVED"] as const) {
            await expect(
                controller.setStatus(CTX, "CRM", { status, setup: {} }),
            ).rejects.toBeInstanceOf(BadRequestException);
        }
        expect(setup.enable).not.toHaveBeenCalled();
        expect(lifecycle.disable).not.toHaveBeenCalled();
        expect(lifecycle.archive).not.toHaveBeenCalled();
    });

    it("GET setup-defaults answers what the Turn on sheet prefills", async () => {
        const { controller, setup } = build();
        const res = await controller.setupDefaults(CTX, "WEBSITE");
        expect(setup.defaults).toHaveBeenCalledWith(CTX, "WEBSITE");
        expect(res.data).toEqual(
            expect.objectContaining({ moduleKey: "WEBSITE", hidden: false }),
        );
        await expect(
            controller.setupDefaults(CTX, "NOPE"),
        ).rejects.toBeInstanceOf(NotFoundException);
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

    it("GET impact returns what turning the module off touches (F13)", async () => {
        const { controller, lifecycle } = build();
        const res = await controller.impact(CTX, "APPOINTMENTS");
        expect(lifecycle.impact).toHaveBeenCalledWith(CTX, "APPOINTMENTS");
        expect(res.data).toEqual(
            expect.objectContaining({ moduleKey: "APPOINTMENTS" }),
        );
    });

    it("GET impact 404s an unknown module", async () => {
        const { controller, lifecycle } = build();
        await expect(controller.impact(CTX, "NOPE")).rejects.toBeInstanceOf(
            NotFoundException,
        );
        expect(lifecycle.impact).not.toHaveBeenCalled();
    });
});
