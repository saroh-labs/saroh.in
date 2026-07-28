import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";

import {
    AdminPermission,
    AdminRole,
    ALL_ADMIN_PERMISSIONS,
} from "../../modules/admin/admin-permissions";
import type { PlatformAdminInfo } from "../decorators/platform-admin-context.decorator";
import { PlatformPermissionGuard } from "./platform-permission.guard";

function contextFor(platformAdmin?: PlatformAdminInfo): ExecutionContext {
    return {
        getHandler: () => () => undefined,
        getClass: () => class {},
        switchToHttp: () => ({
            getRequest: () => ({ platformAdmin }),
        }),
    } as unknown as ExecutionContext;
}

function build(required?: AdminPermission[]) {
    const reflector = {
        getAllAndOverride: jest.fn().mockReturnValue(required),
    } as unknown as Reflector;
    return new PlatformPermissionGuard(reflector);
}

function staff(permissions: AdminPermission[]): PlatformAdminInfo {
    return {
        userId: "user_1",
        platformAdminId: "pa_1",
        roles: [AdminRole.Support],
        permissions,
        viaBootstrap: false,
    };
}

describe("PlatformPermissionGuard", () => {
    it("allows an identity-only route with no permission metadata", () => {
        const guard = build();

        expect(guard.canActivate(contextFor(staff([])))).toBe(true);
    });

    it("allows a route when every required permission is present", () => {
        const guard = build([
            AdminPermission.OrganizationRead,
            AdminPermission.OrganizationPiiRead,
        ]);

        expect(
            guard.canActivate(
                contextFor(
                    staff([
                        AdminPermission.OrganizationRead,
                        AdminPermission.OrganizationPiiRead,
                    ]),
                ),
            ),
        ).toBe(true);
    });

    it("requires every permission declared by the endpoint", () => {
        const guard = build([
            AdminPermission.OrganizationRead,
            AdminPermission.OrganizationPiiRead,
        ]);

        expect(() =>
            guard.canActivate(
                contextFor(staff([AdminPermission.OrganizationRead])),
            ),
        ).toThrow(ForbiddenException);
    });

    it("fails closed when the staff guard did not attach context", () => {
        const guard = build([AdminPermission.PlatformRead]);

        expect(() => guard.canActivate(contextFor())).toThrow(
            UnauthorizedException,
        );
    });

    it("refuses a staff member without the required permission", () => {
        const guard = build([AdminPermission.StaffGrant]);

        expect(() =>
            guard.canActivate(
                contextFor(staff([AdminPermission.OrganizationRead])),
            ),
        ).toThrow(ForbiddenException);
    });

    it("allows Platform Owner through the complete permission vocabulary", () => {
        const guard = build([
            AdminPermission.StaffGrant,
            AdminPermission.FlagsPublish,
            AdminPermission.OrganizationLifecycleWrite,
        ]);
        const owner: PlatformAdminInfo = {
            ...staff([...ALL_ADMIN_PERMISSIONS]),
            roles: [AdminRole.PlatformOwner],
        };

        expect(guard.canActivate(contextFor(owner))).toBe(true);
    });
});
