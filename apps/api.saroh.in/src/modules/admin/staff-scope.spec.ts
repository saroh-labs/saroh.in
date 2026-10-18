import { ForbiddenException } from "@nestjs/common";

import type { AdminRole } from "./admin-permissions";
import { AdminPermission, AdminRole as Roles } from "./admin-permissions";
import {
    assertMaySeeOrganization,
    mayOwnerSee,
    maySeeOrganization,
    ownerWhere,
    scopeForStaff,
} from "./staff-scope";

const staff = (
    roles: AdminRole[],
    platformAdminId: string | null = "pa_1",
) => ({
    platformAdminId,
    roles,
    viaBootstrap: false,
});

describe("scopeForStaff (DEC-169)", () => {
    it("gives an Account manager their own leads and businesses only", () => {
        const am = staff([Roles.AccountManager]);
        for (const permission of [
            AdminPermission.AccountsRead,
            AdminPermission.SarohLeadsRead,
            AdminPermission.SarohLeadsWrite,
        ]) {
            expect(scopeForStaff(am, permission)).toEqual({
                kind: "own",
                platformAdminId: "pa_1",
            });
        }
    });

    it("gives Support no filter", () => {
        expect(
            scopeForStaff(
                staff([Roles.Support]),
                AdminPermission.SarohLeadsRead,
            ),
        ).toEqual({ kind: "all" });
        expect(
            scopeForStaff(staff([Roles.Support]), AdminPermission.AccountsRead),
        ).toEqual({ kind: "all" });
    });

    it("gives a break-glass Platform owner no filter", () => {
        expect(
            scopeForStaff(
                {
                    platformAdminId: null,
                    roles: [Roles.PlatformOwner],
                    viaBootstrap: true,
                },
                AdminPermission.SarohLeadsWrite,
            ),
        ).toEqual({ kind: "all" });
    });

    it("scopes per permission when an Account manager holds another role", () => {
        const both = staff([Roles.AccountManager, Roles.Auditor]);
        // The Auditor reads every business…
        expect(scopeForStaff(both, AdminPermission.AccountsRead)).toEqual({
            kind: "all",
        });
        // …but only the Account manager role grants leads, scoped.
        expect(scopeForStaff(both, AdminPermission.SarohLeadsRead)).toEqual({
            kind: "own",
            platformAdminId: "pa_1",
        });
    });

    it("refuses a permission none of the roles grant", () => {
        expect(() =>
            scopeForStaff(
                staff([Roles.AccountManager]),
                AdminPermission.OrganizationRead,
            ),
        ).toThrow(ForbiddenException);
        expect(() =>
            scopeForStaff(
                staff([Roles.Operations]),
                AdminPermission.SarohLeadsRead,
            ),
        ).toThrow(ForbiddenException);
    });

    it("refuses own scope without a team record to own by", () => {
        expect(() =>
            scopeForStaff(
                staff([Roles.AccountManager], null),
                AdminPermission.SarohLeadsRead,
            ),
        ).toThrow(ForbiddenException);
    });
});

describe("scope helpers", () => {
    const own = { kind: "own", platformAdminId: "pa_1" } as const;
    const all = { kind: "all" } as const;

    it("lets own scope see only its own rows, and no unowned ones", () => {
        expect(mayOwnerSee(own, "pa_1")).toBe(true);
        expect(mayOwnerSee(own, "pa_2")).toBe(false);
        expect(mayOwnerSee(own, null)).toBe(false);
        expect(mayOwnerSee(all, null)).toBe(true);
        expect(mayOwnerSee(all, "pa_2")).toBe(true);
    });

    it("builds an owner filter only for own scope", () => {
        expect(ownerWhere(all, "ownerPlatformAdminId")).toEqual({});
        expect(ownerWhere(own, "ownerPlatformAdminId")).toEqual({
            ownerPlatformAdminId: "pa_1",
        });
    });

    it("lets all scope see any business", async () => {
        await expect(maySeeOrganization(all, "org_1")).resolves.toBe(true);
        await expect(
            assertMaySeeOrganization(all, "org_1"),
        ).resolves.toBeUndefined();
    });

    // Until the account-manager link lands (U19/U25), own scope sees no
    // business: the safe default.
    it("lets own scope see no business until the link table exists", async () => {
        await expect(maySeeOrganization(own, "org_1")).resolves.toBe(false);
        await expect(assertMaySeeOrganization(own, "org_1")).rejects.toThrow(
            ForbiddenException,
        );
    });
});
