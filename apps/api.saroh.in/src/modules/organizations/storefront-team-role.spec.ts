import { ORG_ACTIONS } from "./organization-actions";
import { can, resolveCapabilities } from "./organization-policy";
import {
    STOREFRONT_TEAM_ACTIONS,
    STOREFRONT_TEAM_ROLE_KEY,
    storefrontTeamCapabilities,
} from "./storefront-team-role";

/**
 * The "Storefront team" role (F16, DEC-048 amended 2026-09-27): enough to
 * appear on Team and open the storefronts, and to take, change and move
 * their storefronts' orders and take their payments (DEC-074; owner 13 Nov
 * 2026), which reads them whole. No customers or bookings, no refunds or
 * cancels, no export, no payment settings. The narrowing to their own
 * storefronts is `orders/order-location.ts`'s (its spec and the db specs).
 */
describe("the Storefront team role", () => {
    /** What it holds of orders: taking, changing, moving, and the read they imply. */
    const ORDER_HOLDS = new Set([
        "order:stage",
        "order:create",
        "order:edit",
        "order:read",
    ]);

    it("holds exactly the six reads the matrix names, and taking, changing and moving orders", () => {
        expect([...STOREFRONT_TEAM_ACTIONS].sort()).toEqual(
            [
                "org:read",
                "member:read",
                "module:read",
                "media:read",
                "store:read",
                "product-review:read",
                "order:stage",
                "order:create",
                "order:edit",
            ].sort(),
        );
    });

    it("names only actions the policy knows", () => {
        const known = new Set<string>(ORG_ACTIONS);
        for (const action of STOREFRONT_TEAM_ACTIONS) {
            expect(known.has(action)).toBe(true);
        }
    });

    it("no customers, bookings, invoices or payment settings; no refunds, cancels or export", () => {
        const holds = storefrontTeamCapabilities(null);
        for (const action of ORG_ACTIONS) {
            if (ORDER_HOLDS.has(action)) continue;
            if (
                /^(contact|booking|service|order|payment|invoice|subscription|pack|lead|pipeline|customer|message|audit):/.test(
                    action,
                )
            ) {
                expect([action, holds.has(action)]).toEqual([action, false]);
            }
        }
        for (const action of ORDER_HOLDS) {
            expect([action, holds.has(action as never)]).toEqual([
                action,
                true,
            ]);
        }
        expect(holds.has("order:refund")).toBe(false);
        expect(holds.has("order:export")).toBe(false);
    });

    it("beyond taking and changing orders, holds nothing a Member doesn't", () => {
        for (const action of STOREFRONT_TEAM_ACTIONS) {
            if (action === "order:create" || action === "order:edit") continue;
            expect(can("MEMBER", action)).toBe(true);
        }
        expect(can("MEMBER", "contact:read")).toBe(true);
        expect(storefrontTeamCapabilities(null).has("contact:read")).toBe(
            false,
        );
    });

    it("writes nothing but its orders", () => {
        for (const action of storefrontTeamCapabilities(null)) {
            if (ORDER_HOLDS.has(action)) continue;
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

    it("a business's role made before 13 Nov, without order-taking, still reads no money", () => {
        const before = storefrontTeamCapabilities(
            STOREFRONT_TEAM_ACTIONS.filter(
                (a) => a !== "order:create" && a !== "order:edit",
            ),
        );
        expect(before.has("order:stage")).toBe(true);
        expect(before.has("order:read")).toBe(false);
    });
});
