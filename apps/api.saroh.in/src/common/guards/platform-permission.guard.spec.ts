import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";

import {
    AdminPermission,
    AdminRole,
    ALL_ADMIN_PERMISSIONS,
} from "../../modules/admin/admin-permissions";
import { IDENTITY_ONLY } from "../decorators/identity-only.decorator";
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

/**
 * Key-aware, because the guard now reads two pieces of metadata: the required
 * permissions and the explicit identity-only marker. A mock that answered every
 * key with the same value could not tell "no permissions declared" apart from
 * "declared identity-only", which is the exact distinction under test.
 */
function build(required?: AdminPermission[], identityOnly = false) {
    const reflector = {
        getAllAndOverride: jest.fn((key: string) =>
            key === IDENTITY_ONLY ? identityOnly || undefined : required,
        ),
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
    it("allows a route that declares itself identity-only", () => {
        const guard = build(undefined, true);

        expect(guard.canActivate(contextFor(staff([])))).toBe(true);
    });

    it("REFUSES a route that declares no authorization at all", () => {
        // The defect this guard was changed to fix. A handler with neither
        // decorator used to return true, so any `/admin/*` route added without
        // one shipped reachable by every authenticated staff member. Absence of
        // a declaration is now a denial, not a permission.
        const guard = build(undefined, false);

        expect(() => guard.canActivate(contextFor(staff([])))).toThrow(
            ForbiddenException,
        );
    });

    it("names the missing decorator so the mistake is fixable from the error", () => {
        const guard = build(undefined, false);

        expect(() => guard.canActivate(contextFor(staff([])))).toThrow(
            /@RequireAdminPermission\(\.\.\.\) or.*@IdentityOnly\(\)/s,
        );
    });

    it("refuses an empty permission array as undeclared, not as allow-all", () => {
        // `@RequireAdminPermission()` with no arguments reads as an intent to
        // protect, so it must not be the one spelling that opens the route.
        const guard = build([], false);

        expect(() => guard.canActivate(contextFor(staff([])))).toThrow(
            ForbiddenException,
        );
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
