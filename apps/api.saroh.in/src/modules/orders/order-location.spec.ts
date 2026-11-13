import { Prisma } from "@saroh/database";

import { STOREFRONT_TEAM_ROLE_KEY } from "../organizations/storefront-team-role";
import {
    isLocationScoped,
    orderLocationSql,
    orderLocationWhere,
} from "./order-location";

/**
 * DEC-074, the pure half: a location's team (the Storefront team role) is
 * narrowed to the storefronts it works on. Everyone else is not narrowed. The db half is
 * `order-location.db.spec.ts`.
 */
describe("a location's team's orders", () => {
    const team = { roleKey: STOREFRONT_TEAM_ROLE_KEY, userId: "u_ravi" };

    it("only the Storefront team role is narrowed", () => {
        expect(isLocationScoped(STOREFRONT_TEAM_ROLE_KEY)).toBe(true);
        for (const key of ["OWNER", "ADMIN", "MEMBER", "counter-lead"]) {
            expect([key, isLocationScoped(key)]).toEqual([key, false]);
        }
        expect(isLocationScoped(undefined)).toBe(false);
        expect(isLocationScoped(null)).toBe(false);
    });

    it("its where keeps the orders of storefronts it works on", () => {
        expect(orderLocationWhere(team)).toEqual({
            store: { members: { some: { userId: "u_ravi" } } },
        });
        expect(orderLocationWhere({ roleKey: "MEMBER", userId: "u" })).toEqual(
            {},
        );
    });

    it("its SQL adds the same, and nothing for anyone else", () => {
        expect(orderLocationSql(team, "o").sql).toContain('"StoreMembers"');
        expect(orderLocationSql({ roleKey: "ADMIN", userId: "u" }, "o")).toBe(
            Prisma.empty,
        );
        expect(orderLocationSql(undefined, "o")).toBe(Prisma.empty);
    });
});
