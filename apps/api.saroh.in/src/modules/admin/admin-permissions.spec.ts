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

    it("lets Billing and Auditor read the pricing catalogue, and no one else below Owner", () => {
        const readers = Object.values(AdminRole).filter((role) =>
            permissionsFor([role]).includes(AdminPermission.PricingRead),
        );
        expect(readers.sort()).toEqual(
            [
                AdminRole.Auditor,
                AdminRole.Billing,
                AdminRole.PlatformOwner,
            ].sort(),
        );
    });

    it("lets Billing edit the pricing draft, and only Platform Owner publish it or manage coupons", () => {
        const holders = (permission: AdminPermission) =>
            Object.values(AdminRole)
                .filter((role) => permissionsFor([role]).includes(permission))
                .sort();
        expect(holders(AdminPermission.PricingEdit)).toEqual(
            [AdminRole.Billing, AdminRole.PlatformOwner].sort(),
        );
        expect(holders(AdminPermission.PricingPublish)).toEqual([
            AdminRole.PlatformOwner,
        ]);
        expect(holders(AdminPermission.CouponsManage)).toEqual(
            [AdminRole.Billing, AdminRole.PlatformOwner].sort(),
        );
    });

    it("lets Billing and Platform Owner make one business's catalogue exceptions", () => {
        const holders = Object.values(AdminRole)
            .filter((role) =>
                permissionsFor([role]).includes(
                    AdminPermission.PricingOverride,
                ),
            )
            .sort();
        expect(holders).toEqual(
            [AdminRole.Billing, AdminRole.PlatformOwner].sort(),
        );
    });

    it("lets Support and Platform Owner mark a customer's report done, and Support never suspend", () => {
        const holders = Object.values(AdminRole)
            .filter((role) =>
                permissionsFor([role]).includes(AdminPermission.ReportsResolve),
            )
            .sort();
        expect(holders).toEqual(
            [AdminRole.PlatformOwner, AdminRole.Support].sort(),
        );
        expect(permissionsFor([AdminRole.Support])).not.toContain(
            AdminPermission.OrganizationLifecycleWrite,
        );
    });

    it("lets only a Platform Owner lift a legal hold, while placing one needs the lifecycle write (DEC-119)", () => {
        const holders = (permission: AdminPermission) =>
            Object.values(AdminRole)
                .filter((role) => permissionsFor([role]).includes(permission))
                .sort();
        expect(holders(AdminPermission.OrganizationLegalHoldLift)).toEqual([
            AdminRole.PlatformOwner,
        ]);
        expect(AdminPermission.OrganizationLegalHoldLift).toBe(
            "organization:legal-hold:lift",
        );
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
