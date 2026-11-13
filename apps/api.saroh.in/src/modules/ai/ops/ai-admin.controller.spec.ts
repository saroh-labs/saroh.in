jest.mock("../../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));
jest.mock("../../../common/guards/platform-admin.guard", () => ({
    PlatformAdminGuard: class PlatformAdminGuard {},
}));

import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { PlatformAdminInfo } from "../../../common/decorators/platform-admin-context.decorator";
import { PlatformPermissionGuard } from "../../../common/guards/platform-permission.guard";
import { AdminRole, permissionsFor } from "../../admin/admin-permissions";
import { AdminAskAiController } from "./ai-admin.controller";

type Route = keyof AdminAskAiController;

/** The real guard on the controller's own metadata, for one role. */
function allowed(route: Route, role: AdminRole): boolean {
    const staff: PlatformAdminInfo = {
        userId: "user_1",
        platformAdminId: "pa_1",
        roles: [role],
        permissions: permissionsFor([role]),
        viaBootstrap: false,
        edition: null,
    };
    const context = {
        getHandler: () => AdminAskAiController.prototype[route],
        getClass: () => AdminAskAiController,
        switchToHttp: () => ({ getRequest: () => ({ platformAdmin: staff }) }),
    } as unknown as ExecutionContext;
    try {
        return new PlatformPermissionGuard(new Reflector()).canActivate(
            context,
        );
    } catch (error) {
        if (error instanceof ForbiddenException) return false;
        throw error;
    }
}

describe("the console's Ask AI routes (U8)", () => {
    it("refuses reports to staff without ai-reports:read (403)", () => {
        for (const role of [
            AdminRole.Operations,
            AdminRole.Billing,
            AdminRole.Auditor,
            AdminRole.ReleaseManager,
        ]) {
            expect(allowed("askAiReport", role)).toBe(false);
            expect(allowed("askAiReports", role)).toBe(false);
        }
        expect(allowed("askAiReport", AdminRole.Support)).toBe(true);
        expect(allowed("askAiReport", AdminRole.PlatformOwner)).toBe(true);
    });

    it("lets only a Platform owner change settings, halt or grant", () => {
        for (const route of [
            "setAskAiSetting",
            "setAskAiHalt",
            "setAskAiOverride",
            "endAskAiOverride",
            "grantAskAiRequest",
            "declineAskAiRequest",
        ] as const) {
            expect(allowed(route, AdminRole.PlatformOwner)).toBe(true);
            expect(allowed(route, AdminRole.Support)).toBe(false);
            expect(allowed(route, AdminRole.Billing)).toBe(false);
        }
    });
});
