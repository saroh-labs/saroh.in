import {
    AdminPermission,
    AdminRole,
    permissionsFor,
} from "./admin-permissions";
import {
    hashStaffInviteToken,
    newStaffInviteToken,
    normaliseInviteEmail,
    rolesBeyondReach,
    STAFF_INVITE_TOKEN_PATTERN,
    staffInviteExpiry,
    staffInviteState,
} from "./staff-invite";

/** The rules of a staff invite that need no database (admin console U24). */
describe("staff invite rules", () => {
    it("draws a fresh, unguessable token each time, stored only as its sha256", () => {
        const a = newStaffInviteToken();
        const b = newStaffInviteToken();
        expect(a).toMatch(STAFF_INVITE_TOKEN_PATTERN);
        expect(a).not.toBe(b);
        expect(hashStaffInviteToken(a)).toMatch(/^[0-9a-f]{64}$/);
        expect(hashStaffInviteToken(a)).not.toContain(a);
        expect(hashStaffInviteToken(a)).toBe(hashStaffInviteToken(a));
    });

    it("lasts 7 days from when it was sent", () => {
        const sent = new Date("2026-10-18T10:00:00.000Z");
        expect(staffInviteExpiry(sent).toISOString()).toBe(
            "2026-10-25T10:00:00.000Z",
        );
    });

    it("compares addresses trimmed and lower-cased", () => {
        expect(normaliseInviteEmail("  Asha.Rao@Example.COM ")).toBe(
            "asha.rao@example.com",
        );
    });

    it("tells an invite's state", () => {
        const now = new Date("2026-10-18T10:00:00.000Z");
        const later = new Date("2026-10-19T10:00:00.000Z");
        const base = { acceptedAt: null, withdrawnAt: null, expiresAt: later };
        expect(staffInviteState(base, now)).toBe("waiting");
        expect(staffInviteState({ ...base, expiresAt: now }, now)).toBe(
            "expired",
        );
        expect(staffInviteState({ ...base, acceptedAt: now }, now)).toBe(
            "accepted",
        );
        expect(staffInviteState({ ...base, withdrawnAt: now }, now)).toBe(
            "withdrawn",
        );
    });

    it("lets a Platform owner invite any role", () => {
        const owner = permissionsFor([AdminRole.PlatformOwner]);
        expect(rolesBeyondReach(Object.values(AdminRole), owner)).toEqual([]);
    });

    it("names the roles that can do more than the sender can", () => {
        const narrow = [
            ...permissionsFor([AdminRole.Support]),
            AdminPermission.StaffGrant,
        ];
        expect(
            rolesBeyondReach(
                [
                    AdminRole.Support,
                    AdminRole.Billing,
                    AdminRole.PlatformOwner,
                    AdminRole.AccountManager,
                ],
                narrow,
            ),
        ).toEqual([AdminRole.Billing, AdminRole.PlatformOwner]);
    });
});
