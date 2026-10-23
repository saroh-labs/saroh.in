import {
    AdminPermission,
    AdminRole,
    ALL_ADMIN_PERMISSIONS,
    isAdminRole,
    OWN_SCOPED_ROLES,
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

    it("lets only a Platform Owner lift a legal hold, while placing one needs the lifecycle write (DEC-122)", () => {
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

    it("rejects tenant roles named like the Account manager's job", () => {
        expect(isAdminRole("ACCOUNT_MANAGER")).toBe(true);
        expect(isAdminRole("ACCOUNT_MANAGER_JOB")).toBe(false);
    });
});

/**
 * The Team permissions (DEC-169), exactly as the admin console redesign
 * plan's "Roles and the new permissions" table sets them. Each row lists
 * every role that holds the permission; a role added to or dropped from a
 * row fails here.
 */
describe("Team permissions (DEC-169)", () => {
    const holders = (permission: AdminPermission) =>
        Object.values(AdminRole)
            .filter((role) => permissionsFor([role]).includes(permission))
            .sort();
    const { PlatformOwner, Support, Billing, Auditor, AccountManager } =
        AdminRole;

    it.each([
        [AdminPermission.TeamRead, [PlatformOwner, Support, Billing, Auditor]],
        [AdminPermission.TeamWrite, [PlatformOwner]],
        [
            AdminPermission.AccountsRead,
            [PlatformOwner, Support, Billing, Auditor, AccountManager],
        ],
        [AdminPermission.AccountsAssign, [PlatformOwner, Support]],
        [
            AdminPermission.SarohLeadsRead,
            [PlatformOwner, Support, AccountManager],
        ],
        [
            AdminPermission.SarohLeadsWrite,
            [PlatformOwner, Support, AccountManager],
        ],
        [AdminPermission.TeamPay, [PlatformOwner, Billing]],
        [AdminPermission.CommissionRates, [PlatformOwner]],
        [AdminPermission.PeopleSignInHelp, [PlatformOwner, Support]],
    ] as const)("%s is held by exactly its row", (permission, roles) => {
        expect(holders(permission)).toEqual([...roles].sort());
    });

    it("spells the new permissions as the console mirrors them", () => {
        expect([
            AdminPermission.TeamRead,
            AdminPermission.TeamWrite,
            AdminPermission.AccountsRead,
            AdminPermission.AccountsAssign,
            AdminPermission.SarohLeadsRead,
            AdminPermission.SarohLeadsWrite,
            AdminPermission.TeamPay,
            AdminPermission.CommissionRates,
            AdminPermission.PeopleSignInHelp,
        ]).toEqual([
            "team:read",
            "team:write",
            "accounts:read",
            "accounts:assign",
            "saroh-leads:read",
            "saroh-leads:write",
            "team:pay",
            "commission:rates",
            "people:sign-in-help",
        ]);
    });

    it("gives the Account manager its three scoped permissions and nothing else", () => {
        expect(permissionsFor([AdminRole.AccountManager])).toEqual([
            AdminPermission.AccountsRead,
            AdminPermission.SarohLeadsRead,
            AdminPermission.SarohLeadsWrite,
        ]);
    });

    it.each([
        AdminPermission.OrganizationRead,
        AdminPermission.AccountsAssign,
        AdminPermission.TeamWrite,
        AdminPermission.StaffGrant,
        AdminPermission.TeamPay,
        AdminPermission.PlatformRead,
    ])("never gives the Account manager %s", (permission) => {
        expect(permissionsFor([AdminRole.AccountManager])).not.toContain(
            permission,
        );
    });

    it("scopes only the Account manager to its own", () => {
        expect(OWN_SCOPED_ROLES).toEqual([AdminRole.AccountManager]);
    });

    it("leaves Operations and Release manager out of the Team entirely", () => {
        const team = [
            AdminPermission.TeamRead,
            AdminPermission.TeamWrite,
            AdminPermission.AccountsRead,
            AdminPermission.AccountsAssign,
            AdminPermission.SarohLeadsRead,
            AdminPermission.SarohLeadsWrite,
            AdminPermission.TeamPay,
            AdminPermission.CommissionRates,
            AdminPermission.PeopleSignInHelp,
        ];
        for (const role of [AdminRole.Operations, AdminRole.ReleaseManager]) {
            for (const permission of team) {
                expect(permissionsFor([role])).not.toContain(permission);
            }
        }
    });
});
