jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));
jest.mock("../../common/guards/platform-admin.guard", () => ({
    PlatformAdminGuard: class PlatformAdminGuard {},
}));

import { REQUIRE_ADMIN_PERMISSIONS } from "../../common/decorators/require-admin-permission.decorator";
import { AdminPermission } from "./admin-permissions";
import { AdminController } from "./admin.controller";

type AdminMethod = keyof Pick<
    AdminController,
    | "me"
    | "getMetrics"
    | "listFlags"
    | "listOrganizations"
    | "history"
    | "listAudit"
    | "setGlobal"
    | "setOverride"
    | "clearOverride"
>;

function required(method: AdminMethod): AdminPermission[] | undefined {
    return Reflect.getMetadata(
        REQUIRE_ADMIN_PERMISSIONS,
        AdminController.prototype[method],
    ) as AdminPermission[] | undefined;
}

describe("AdminController permission contract", () => {
    it("keeps staff identity permission-free after the staff gate", () => {
        expect(required("me")).toBeUndefined();
    });

    it("protects aggregate metrics with platform read", () => {
        expect(required("getMetrics")).toEqual([AdminPermission.PlatformRead]);
    });

    it("protects Organization targets with Organization read", () => {
        expect(required("listOrganizations")).toEqual([
            AdminPermission.OrganizationRead,
        ]);
    });

    it.each(["listFlags", "history"] as const)(
        "protects %s with flag read",
        (method) => {
            expect(required(method)).toEqual([AdminPermission.FlagsRead]);
        },
    );

    it("protects the platform audit ledger with audit read", () => {
        expect(required("listAudit")).toEqual([AdminPermission.AuditRead]);
    });

    it.each(["setGlobal", "setOverride", "clearOverride"] as const)(
        "protects %s with flag publish",
        (method) => {
            expect(required(method)).toEqual([AdminPermission.FlagsPublish]);
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
