import {
    CAPABILITIES,
    CAPABILITY_BY_ACTION,
    CAPABILITY_GROUPS,
    grantableCapabilities,
} from "./capability-catalogue";
import { ORG_ACTIONS } from "./organization-policy";

/**
 * The catalogue is what an owner picks permissions from, and `ORG_ACTIONS` is
 * what the server enforces. These tests exist to keep them the same list.
 *
 * The failure they prevent is silent: an action added to the policy but not
 * here simply never appears on the screen, so a role that should have been
 * able to do the new thing cannot, and nothing says why.
 */
describe("capability catalogue", () => {
    it("covers every action the policy can authorize", () => {
        const catalogued = new Set(CAPABILITIES.map((c) => c.action));
        const missing = ORG_ACTIONS.filter((a) => !catalogued.has(a));
        expect(missing).toEqual([]);
    });

    it("invents no permission the policy does not have", () => {
        const known = new Set<string>(ORG_ACTIONS);
        const invented = CAPABILITIES.map((c) => c.action).filter(
            (a) => !known.has(a),
        );
        expect(invented).toEqual([]);
    });

    it("lists each action exactly once", () => {
        const seen = CAPABILITIES.map((c) => c.action);
        expect(seen).toHaveLength(new Set(seen).size);
    });

    it("puts every capability in a known group", () => {
        const groups = new Set<string>(CAPABILITY_GROUPS);
        const stray = CAPABILITIES.filter((c) => !groups.has(c.group));
        expect(stray).toEqual([]);
    });

    it("gives every capability a label somebody could read", () => {
        // Not a label like "org:update". If the label is the action, nobody
        // learned anything by reading it.
        const bad = CAPABILITIES.filter(
            (c) => c.label.trim().length < 4 || c.label.includes(":"),
        );
        expect(bad).toEqual([]);
    });

    it("speaks to the owner, not to a developer", () => {
        // Labels and notes are rendered verbatim on Team. One note once told a
        // shop owner to "see the annotations spec"; this is what stops the
        // next one.
        const code =
            /\bspec\b|annotation|\bAPI\b|`|\bmodule[- ]gated\b|\bguard\b|\benum\b|\bDTO\b/i;
        const leaks = CAPABILITIES.flatMap((c) =>
            [c.label, c.note ?? ""]
                .filter((text) => code.test(text))
                .map((text) => `${c.action}: ${text}`),
        );
        expect(leaks).toEqual([]);
    });

    it("keeps closing the business off the grantable list", () => {
        // A role that could be granted `org:delete` would make "every business
        // has exactly one person who can always get back in" untrue.
        const grantable = grantableCapabilities().map((c) => c.action);
        expect(grantable).not.toContain("org:delete");
    });

    it("offers everything else", () => {
        const reserved = CAPABILITIES.filter(
            (c) => c.ownerOnly === true,
        ).length;
        expect(grantableCapabilities()).toHaveLength(
            CAPABILITIES.length - reserved,
        );
    });

    it("can turn a stored grant back into its label", () => {
        expect(CAPABILITY_BY_ACTION.get("order:read")?.label).toBe(
            "See orders",
        );
        expect(CAPABILITY_BY_ACTION.size).toBe(CAPABILITIES.length);
    });

    it("warns on the two powers that widen their own holder", () => {
        // Granting these is how a role escapes its own limits; the screen has
        // to say so, so the note is not optional.
        expect(
            CAPABILITY_BY_ACTION.get("member:role:update")?.note,
        ).toBeDefined();
        expect(CAPABILITY_BY_ACTION.get("module:manage")?.note).toBeDefined();
    });
});

describe("the split order powers (B16)", () => {
    it("labels each part in the owner's words, in Sell, grantable", () => {
        const grantable = grantableCapabilities().map((c) => c.action);
        for (const [action, label] of [
            ["order:create", "Take new orders"],
            ["order:edit", "Change orders after they're placed"],
            ["order:refund", "Refund and cancel orders"],
            ["order:export", "Export orders"],
        ] as const) {
            expect(CAPABILITY_BY_ACTION.get(action)?.label).toBe(label);
            expect(CAPABILITY_BY_ACTION.get(action)?.group).toBe("sell");
            expect(grantable).toContain(action);
        }
    });

    it("relabels the kitchen's power, keeping its key", () => {
        expect(CAPABILITY_BY_ACTION.get("order:stage")?.label).toBe(
            "Move orders through their steps and print",
        );
    });

    it("says what the old umbrella includes, for roles saved before the split", () => {
        const write = CAPABILITY_BY_ACTION.get("order:write");
        expect(write?.note).toContain("Take new orders");
        expect(write?.note).toContain("Change orders after they're placed");
        expect(write?.note).toContain("Export orders");
    });
});

describe("Count and move stock (#513)", () => {
    it("is on the list, grantable, with a label an owner reads", () => {
        const stock = CAPABILITY_BY_ACTION.get("inventory:write");
        expect(stock?.label).toBe("Count and move stock");
        expect(stock?.group).toBe("sell");
        expect(grantableCapabilities().map((c) => c.action)).toContain(
            "inventory:write",
        );
    });
});
