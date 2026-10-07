import { describe, expect, it } from "vitest";

import {
    anyoneHasExtras,
    beyondViewer,
    extraGroups,
    extraLabels,
    extrasBeyond,
    extrasLockedReason,
    extrasSummary,
    roleGrants,
    sameExtras,
} from "./extras";
import type { Role, RoleCatalogue } from "./roles";

const catalogue: RoleCatalogue = {
    groups: ["sell", "money", "contacts"],
    capabilities: [
        { action: "order:read", group: "sell", label: "See orders" },
        { action: "order:refund", group: "sell", label: "Refund orders" },
        { action: "payment:manage", group: "money", label: "Manage payments" },
        {
            action: "contact:read",
            group: "contacts",
            label: "See customers and contacts",
        },
    ],
};

const role = (over: Partial<Role>): Role => ({
    key: "clerk",
    label: "Clerk",
    actions: [],
    ringTone: "neutral",
    system: false,
    members: 0,
    ...over,
});

describe("extras on Team (F17)", () => {
    it("reads an invented role's resolved grants, else its list", () => {
        expect(
            roleGrants(
                role({
                    actions: ["contact:write"],
                    grants: ["contact:write", "contact:read"],
                }),
            ).has("contact:read"),
        ).toBe(true);
        expect(
            roleGrants(role({ actions: ["order:read"] })).has("order:read"),
        ).toBe(true);
        expect(roleGrants(undefined).size).toBe(0);
    });

    it("leaves out an extra the role already grants", () => {
        expect(
            extrasBeyond(
                ["order:refund", "contact:read"],
                new Set(["contact:read"]),
            ),
        ).toEqual(["order:refund"]);
        expect(extrasBeyond(undefined, new Set())).toEqual([]);
    });

    it("shows the column only once someone has an extra", () => {
        expect(anyoneHasExtras([{ extraActions: [] }, {}])).toBe(false);
        expect(anyoneHasExtras([{}, { extraActions: ["order:refund"] }])).toBe(
            true,
        );
    });

    it("compares lists whatever their order", () => {
        expect(sameExtras(["a", "b"], ["b", "a"])).toBe(true);
        expect(sameExtras(["a"], ["a", "b"])).toBe(false);
    });

    it("names extras, never showing a code it can't name", () => {
        expect(extraLabels(["order:refund", "gone:away"], catalogue)).toEqual([
            "Refund orders",
        ]);
        expect(extraLabels(["order:refund"], null)).toEqual([]);
    });

    it("offers only what the viewer holds, and locks what the role grants", () => {
        const groups = extraGroups({
            catalogue,
            grants: new Set(["contact:read"]),
            draft: ["order:read"],
            myActions: ["order:read", "contact:read"],
        });
        expect(
            groups.map((g) => [
                g.label,
                g.choices.map((c) => [c.capability.action, c.state]),
            ]),
        ).toEqual([
            ["Sell", [["order:read", "on"]]],
            ["Customers and contacts", [["contact:read", "role"]]],
        ]);
    });

    it("holds nothing back when the viewer is unknown", () => {
        const groups = extraGroups({
            catalogue,
            grants: new Set(),
            draft: [],
            myActions: null,
        });
        expect(groups.flatMap((g) => g.choices)).toHaveLength(4);
    });

    it("says why no switch can move", () => {
        const base = {
            isSelf: false,
            canEdit: true,
            reviewer: false,
            beyondViewer: false,
            name: "Ravi",
        };
        expect(extrasLockedReason(base)).toBeNull();
        expect(extrasLockedReason({ ...base, isSelf: true })).toMatch(
            /Nobody changes their own permissions/,
        );
        expect(extrasLockedReason({ ...base, beyondViewer: true })).toMatch(
            /Ravi can do more than you can/,
        );
        expect(extrasLockedReason({ ...base, reviewer: true })).toMatch(
            /reviewer/,
        );
        expect(extrasLockedReason({ ...base, canEdit: false })).toMatch(
            /change roles/,
        );
    });

    it("locks extras where the plan leaves roles of your own off (UX-030)", () => {
        const base = {
            isSelf: false,
            canEdit: true,
            reviewer: false,
            beyondViewer: false,
            name: "Ravi",
            planLocked: "Roles of your own come with Plan B.",
        };
        expect(extrasLockedReason(base)).toBe(
            "Roles of your own come with Plan B. Extra permissions for one person come with them.",
        );
        // Extras from before a move down can still be taken away.
        expect(extrasLockedReason({ ...base, holdsExtras: true })).toBeNull();
    });

    it("counts a person's extras when asking whether they are above the viewer", () => {
        const mine = ["order:read"];
        expect(beyondViewer(new Set(["order:read"]), [], mine)).toBe(false);
        expect(beyondViewer(new Set(), ["order:refund"], mine)).toBe(true);
        expect(beyondViewer(new Set(["x"]), ["y"], null)).toBe(false);
    });

    it("sums up the role plus what was added, in words", () => {
        expect(extrasSummary("Member", [])).toBeNull();
        expect(extrasSummary("Member", ["Refund orders", "See invoices"])).toBe(
            "Member plus refund orders and see invoices. Extras only ever add — they cannot take away what Member already allows.",
        );
    });
});
