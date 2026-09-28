import { ORG_ACTIONS } from "./organization-actions";
import { can, resolveCapabilities } from "./organization-policy";
import {
    STOREFRONT_TEAM_ACTIONS,
    STOREFRONT_TEAM_ROLE_KEY,
    storefrontTeamCapabilities,
} from "./storefront-team-role";

/**
 * The "Storefront team" role (F16, DEC-048 amended 2026-09-27): enough to
 * appear on Team and open the storefronts, and nothing about customers,
 * bookings, orders or money — narrower than Member and the read-only floor.
 */
describe("the Storefront team role", () => {
    it("holds exactly the six reads the matrix names", () => {
        expect([...STOREFRONT_TEAM_ACTIONS].sort()).toEqual(
            [
                "org:read",
                "member:read",
                "module:read",
                "media:read",
                "store:read",
                "product-review:read",
            ].sort(),
        );
    });

    it("names only actions the policy knows", () => {
        const known = new Set<string>(ORG_ACTIONS);
        for (const action of STOREFRONT_TEAM_ACTIONS) {
            expect(known.has(action)).toBe(true);
        }
    });

    it("reads no customers, bookings, orders or money", () => {
        const holds = storefrontTeamCapabilities(null);
        for (const action of ORG_ACTIONS) {
            if (
                /^(contact|booking|service|order|payment|invoice|subscription|pack|lead|pipeline|customer|message|audit):/.test(
                    action,
                )
            ) {
                expect([action, holds.has(action)]).toEqual([action, false]);
            }
        }
    });

    it("is narrower than Member: everything it holds, a Member holds", () => {
        for (const action of STOREFRONT_TEAM_ACTIONS) {
            expect(can("MEMBER", action)).toBe(true);
        }
        expect(can("MEMBER", "contact:read")).toBe(true);
        expect(storefrontTeamCapabilities(null).has("contact:read")).toBe(
            false,
        );
    });

    it("writes nothing", () => {
        for (const action of storefrontTeamCapabilities(null)) {
            expect(action.endsWith(":read")).toBe(true);
        }
    });

    it("resolves as the business stored it, once the owner has widened it", () => {
        const widened = storefrontTeamCapabilities([
            ...STOREFRONT_TEAM_ACTIONS,
            "store:write",
        ]);
        // store:write brings inventory:write with it, as for any role.
        expect(widened.has("inventory:write")).toBe(true);
        expect(
            resolveCapabilities(STOREFRONT_TEAM_ROLE_KEY, [
                ...STOREFRONT_TEAM_ACTIONS,
            ]),
        ).toEqual(storefrontTeamCapabilities(null));
    });
});
