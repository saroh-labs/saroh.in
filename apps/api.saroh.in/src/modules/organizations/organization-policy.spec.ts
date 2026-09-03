import { ForbiddenException } from "@nestjs/common";

import type {
    OrganizationContext,
    OrgRole,
} from "../../common/types/organization-context";
import { ORG_ROLES } from "../../common/types/organization-context";
import type { OrgAction } from "./organization-policy";
import { authorize, can, ORG_ACTIONS } from "./organization-policy";

// The expected allow-set per role, written out independently of the
// implementation so this test actually pins behavior rather than mirroring it.
const EXPECTED: Record<OrgRole, OrgAction[]> = {
    OWNER: [...ORG_ACTIONS],
    ADMIN: ORG_ACTIONS.filter((action) => action !== "org:delete"),
    // audit:read is deliberately OWNER/ADMIN-only, so MEMBER (read-only floor)
    // does NOT include it. media:read IS in the floor; media:write is not.
    // site:read IS in the floor; site:create/update/delete are not.
    MEMBER: [
        "org:read",
        "member:read",
        "store:read",
        "site:read",
        "media:read",
        // ADR-003: every role may read effective module availability.
        "module:read",
    ],
    /*
     * REVIEWER is website-only (#193) and is NOT a narrower MEMBER: it holds
     * two actions MEMBER lacks (site:comment, site:approve) and lacks four
     * MEMBER has (org/member/store/media:read). Written out in full here for
     * the same reason as the rest of this table — so the test pins the
     * intended set rather than mirroring whatever the implementation does.
     */
    REVIEWER: ["site:read", "site:comment", "site:approve"],
};

function ctx(role: OrgRole): OrganizationContext {
    return { organizationId: "org_1", userId: "user_1", role };
}

describe("organization-policy: can()", () => {
    it("covers the full role x action matrix", () => {
        for (const role of ORG_ROLES) {
            const allowed = new Set(EXPECTED[role]);
            for (const action of ORG_ACTIONS) {
                expect(can(role, action)).toBe(allowed.has(action));
            }
        }
    });

    it("OWNER may perform every action", () => {
        for (const action of ORG_ACTIONS) {
            expect(can("OWNER", action)).toBe(true);
        }
    });

    it("ADMIN may do everything except org:delete", () => {
        expect(can("ADMIN", "org:delete")).toBe(false);
        for (const action of ORG_ACTIONS.filter((a) => a !== "org:delete")) {
            expect(can("ADMIN", action)).toBe(true);
        }
    });

    it("audit:read is OWNER/ADMIN-only (S1-009)", () => {
        expect(can("OWNER", "audit:read")).toBe(true);
        expect(can("ADMIN", "audit:read")).toBe(true);
        expect(can("MEMBER", "audit:read")).toBe(false);
    });

    it("project:access:manage is OWNER/ADMIN-only (S1-010)", () => {
        expect(can("OWNER", "project:access:manage")).toBe(true);
        expect(can("ADMIN", "project:access:manage")).toBe(true);
        expect(can("MEMBER", "project:access:manage")).toBe(false);
    });

    it("media:read is on the floor; media:write is OWNER/ADMIN-only (S2-008)", () => {
        for (const role of ORG_ROLES) {
            // REVIEWER is off the floor entirely: someone brought in to check
            // one site's copy is not handed the org's media library.
            expect(can(role, "media:read")).toBe(role !== "REVIEWER");
        }
        expect(can("OWNER", "media:write")).toBe(true);
        expect(can("ADMIN", "media:write")).toBe(true);
        expect(can("MEMBER", "media:write")).toBe(false);
    });

    it("site:read is on the floor; site create/update/delete are OWNER/ADMIN-only (S2-003)", () => {
        for (const role of ORG_ROLES) {
            expect(can(role, "site:read")).toBe(true);
        }
        for (const action of [
            "site:create",
            "site:update",
            "site:delete",
        ] as const) {
            expect(can("OWNER", action)).toBe(true);
            expect(can("ADMIN", action)).toBe(true);
            expect(can("MEMBER", action)).toBe(false);
        }
    });

    it("MEMBER is read-only", () => {
        const writeActions = ORG_ACTIONS.filter(
            (a) => !EXPECTED.MEMBER.includes(a),
        );
        for (const action of EXPECTED.MEMBER) {
            expect(can("MEMBER", action)).toBe(true);
        }
        for (const action of writeActions) {
            expect(can("MEMBER", action)).toBe(false);
        }
    });
});

describe("organization-policy: authorize()", () => {
    it("returns silently when the role permits the action", () => {
        expect(() => authorize(ctx("MEMBER"), "org:read")).not.toThrow();
        expect(() => authorize(ctx("ADMIN"), "store:write")).not.toThrow();
        expect(() => authorize(ctx("OWNER"), "org:delete")).not.toThrow();
    });

    it("throws ForbiddenException for every denied role/action pair", () => {
        for (const role of ORG_ROLES) {
            const allowed = new Set(EXPECTED[role]);
            for (const action of ORG_ACTIONS) {
                if (allowed.has(action)) continue;
                expect(() => authorize(ctx(role), action)).toThrow(
                    ForbiddenException,
                );
            }
        }
    });

    it("names the role and action in the thrown message", () => {
        expect(() => authorize(ctx("MEMBER"), "org:delete")).toThrow(
            /MEMBER.*org:delete/,
        );
    });
});
