jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));
jest.mock("../../common/guards/platform-admin.guard", () => ({
    PlatformAdminGuard: class PlatformAdminGuard {},
}));

import { PATH_METADATA } from "@nestjs/common/constants";

import { IDENTITY_ONLY } from "../../common/decorators/identity-only.decorator";
import { REQUIRE_ADMIN_PERMISSIONS } from "../../common/decorators/require-admin-permission.decorator";
import { AdminPermission } from "./admin-permissions";
import { AdminController } from "./admin.controller";

/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */

type Handler = (...args: never[]) => unknown;

/**
 * Every route on the controller, discovered from Nest's own routing metadata.
 *
 * This used to be a hand-written union of eleven method names, which meant the
 * contract only covered routes somebody remembered to add to it — the twelfth
 * route would have been unprotected AND untested, silently. Reading `PATH_METADATA`
 * (the key `@Get`/`@Post`/... write) means a new route joins this list the moment
 * it is declared, whether or not anyone updates this file.
 */
function routeHandlers(): { name: string; handler: Handler }[] {
    const proto = AdminController.prototype as unknown as Record<
        string,
        Handler
    >;
    return Object.getOwnPropertyNames(proto)
        .filter((name) => name !== "constructor")
        .map((name) => ({ name, handler: proto[name] as Handler }))
        .filter(
            ({ handler }) =>
                Reflect.getMetadata(PATH_METADATA, handler) !== undefined,
        );
}

const permissionsOf = (handler: Handler): AdminPermission[] | undefined =>
    Reflect.getMetadata(REQUIRE_ADMIN_PERMISSIONS, handler) as
        | AdminPermission[]
        | undefined;

const isIdentityOnly = (handler: Handler): boolean =>
    Reflect.getMetadata(IDENTITY_ONLY, handler) === true;

describe("AdminController authorization contract", () => {
    it("discovers every route from the router, not from a list in this file", () => {
        const names = routeHandlers().map((r) => r.name);
        // A floor, not an exact count: this must not need editing when a route
        // is added, or it becomes the hand-maintained list it replaced.
        expect(names.length).toBeGreaterThanOrEqual(11);
        expect(names).toContain("me");
    });

    it.each(routeHandlers().map((r) => [r.name, r.handler] as const))(
        "%s declares its authorization explicitly",
        (name, handler) => {
            const permissions = permissionsOf(handler);
            const declared =
                (permissions !== undefined && permissions.length > 0) ||
                isIdentityOnly(handler);

            // The failure this exists to catch: a route added without either
            // decorator. Before the guard was made fail-closed, that route
            // would have been reachable by any authenticated staff member.
            expect({ route: name, declared }).toEqual({
                route: name,
                declared: true,
            });
        },
    );

    it("keeps identity-only routes deliberate and rare", () => {
        const identityOnly = routeHandlers()
            .filter(({ handler }) => isIdentityOnly(handler))
            .map(({ name }) => name);

        // `/admin/me` returns the caller's own identity and permissions, which
        // the console needs before it can render anything. Any addition here is
        // a decision worth arguing for in review.
        expect(identityOnly).toEqual(["me"]);
    });
});

describe("AdminController permission assignments", () => {
    const perms = (name: string) => {
        const route = routeHandlers().find((r) => r.name === name);
        return route ? permissionsOf(route.handler) : undefined;
    };

    it("protects aggregate metrics with platform read", () => {
        expect(perms("getMetrics")).toEqual([AdminPermission.PlatformRead]);
    });

    it("protects Organization targets with Organization read", () => {
        expect(perms("listOrganizations")).toEqual([
            AdminPermission.OrganizationRead,
        ]);
    });

    it.each(["listFlags", "history"] as const)(
        "protects %s with flag read",
        (method) => {
            expect(perms(method)).toEqual([AdminPermission.FlagsRead]);
        },
    );

    it("protects the platform audit ledger with audit read", () => {
        expect(perms("listAudit")).toEqual([AdminPermission.AuditRead]);
    });

    it.each(["openOrganizationAccess", "revokeOrganizationAccess"] as const)(
        "protects %s with Organization view-as",
        (method) => {
            expect(perms(method)).toEqual([AdminPermission.OrganizationViewAs]);
        },
    );

    it.each(["setGlobal", "setOverride", "clearOverride"] as const)(
        "protects %s with flag publish",
        (method) => {
            expect(perms(method)).toEqual([AdminPermission.FlagsPublish]);
        },
    );
});

describe("AdminController staff identity", () => {
    it("returns the server-resolved roles and permissions to the admin shell", () => {
        const controller = new AdminController(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
        );

        expect(
            controller.me(
                { id: "user_1", email: "staff@example.test" } as never,
                {
                    userId: "user_1",
                    platformAdminId: "platform_admin_1",
                    roles: ["AUDITOR"],
                    permissions: [AdminPermission.AuditRead],
                    viaBootstrap: false,
                },
            ),
        ).toEqual({
            userId: "user_1",
            email: "staff@example.test",
            roles: ["AUDITOR"],
            permissions: [AdminPermission.AuditRead],
            viaBootstrap: false,
        });
    });
});
