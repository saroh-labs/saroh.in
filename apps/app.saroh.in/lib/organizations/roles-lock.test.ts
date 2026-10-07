import { describe, expect, it } from "vitest";

import { access, row } from "@/lib/billing/fixtures.test-data";

import { rolesLock } from "./roles-lock";

const roles = (state: "on" | "locked" | "hidden", withUp = true) =>
    row({
        moduleId: "roles",
        name: "Custom roles",
        state,
        limit: null,
        usage: null,
        menu: null,
        child: null,
        upgradeTo: withUp
            ? { planId: "b", name: "Plan B", pricePaise: 11_100 }
            : null,
    });

describe("rolesLock (UX-030)", () => {
    it("says where roles of your own come, for a hidden row too", () => {
        for (const state of ["locked", "hidden"] as const) {
            expect(rolesLock(access({ modules: [roles(state)] }))).toEqual({
                line: "Roles of your own come with Plan B.",
                cta: "See Plan B",
                href: "/settings/billing?plan=b#change-plan",
            });
        }
    });

    it("names the plan when there's no plan above to point at", () => {
        expect(
            rolesLock(access({ modules: [roles("hidden", false)] }))?.line,
        ).toBe("Roles of your own aren't in your Plan A plan.");
    });

    it("locks nothing when the plan has it, or nothing enforces it", () => {
        expect(rolesLock(access({ modules: [roles("on")] }))).toBeNull();
        expect(
            rolesLock(access({ enforced: false, modules: [roles("hidden")] })),
        ).toBeNull();
        expect(rolesLock(access({ source: "legacy" }))).toBeNull();
        expect(rolesLock(null)).toBeNull();
        // A version without the row: the API lets the write through.
        expect(rolesLock(access({ modules: [] }))).toBeNull();
    });
});
