import {
    AdminPermission,
    AdminRole,
    ALL_ADMIN_PERMISSIONS,
    isAdminRole,
    permissionsFor,
} from "./admin-permissions";

describe("admin permission policy", () => {
    it("gives Support Organization diagnostics without staff governance", () => {
        const permissions = permissionsFor([AdminRole.Support]);

        expect(permissions).toContain(AdminPermission.OrganizationRead);
        expect(permissions).not.toContain(AdminPermission.StaffGrant);
    });

    it("unions permissions when a teammate holds multiple roles", () => {
        const permissions = permissionsFor([
            AdminRole.Operations,
            AdminRole.Billing,
        ]);

        expect(permissions).toEqual(
            expect.arrayContaining([
                AdminPermission.JobsRetry,
                AdminPermission.SubscriptionOverride,
            ]),
        );
    });

    it("keeps Auditor read-only", () => {
        const permissions = permissionsFor([AdminRole.Auditor]);

        expect(permissions).toContain(AdminPermission.AuditRead);
        expect(permissions).not.toContain(AdminPermission.FlagsPublish);
    });

    it("gives Platform Owner every control-plane permission", () => {
        expect(permissionsFor([AdminRole.PlatformOwner])).toEqual(
            ALL_ADMIN_PERMISSIONS,
        );
    });

    it("rejects tenant and unknown roles as staff roles", () => {
        expect(isAdminRole("OWNER")).toBe(false);
        expect(isAdminRole("tenant_owner")).toBe(false);
        expect(isAdminRole("SUPPORT")).toBe(true);
    });

    it("deduplicates roles and returns permissions in stable order", () => {
        const once = permissionsFor([AdminRole.Billing, AdminRole.Operations]);
        const repeated = permissionsFor([
            AdminRole.Operations,
            AdminRole.Billing,
            AdminRole.Operations,
        ]);

        expect(repeated).toEqual(once);
        expect(new Set(repeated).size).toBe(repeated.length);
    });
});
