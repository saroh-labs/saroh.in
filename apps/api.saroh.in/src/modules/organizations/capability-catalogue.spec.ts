import {
    CAPABILITIES,
    CAPABILITY_BY_ACTION,
    CAPABILITY_GROUPS,
    grantableCapabilities,
} from "./capability-catalogue";
import { isNeverExtra, ORG_ACTIONS } from "./organization-policy";

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
        // Changing the web address holds an address and moves every shared
        // link (DEC-069): the Owner's alone too.
        expect(grantable).not.toContain("org:address:update");
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

describe("the customer powers (C13)", () => {
    it("labels each in the owner's words, in one group, grantable", () => {
        const grantable = grantableCapabilities().map((c) => c.action);
        for (const [action, label] of [
            ["contact:read", "See customers and contacts"],
            ["contact:write", "Edit customers and contacts"],
            ["customer:sensitive", "See sensitive notes"],
            ["customer:merge", "Merge duplicate customers"],
            ["customer:remove", "Remove a customer's details"],
        ] as const) {
            expect(CAPABILITY_BY_ACTION.get(action)?.label).toBe(label);
            expect(CAPABILITY_BY_ACTION.get(action)?.group).toBe("contacts");
            expect(grantable).toContain(action);
        }
    });

    it("lists them together, reads before writes, the irreversible last", () => {
        const order = CAPABILITIES.filter((c) => c.group === "contacts")
            .map((c) => c.action)
            .slice(0, 5);
        expect(order).toEqual([
            "contact:read",
            "contact:write",
            "customer:sensitive",
            "customer:merge",
            "customer:remove",
        ]);
    });

    it("says that seeing a customer doesn't include their sensitive notes", () => {
        expect(CAPABILITY_BY_ACTION.get("contact:read")?.note).toMatch(
            /sensitive notes need their own permission/,
        );
        expect(CAPABILITY_BY_ACTION.get("customer:sensitive")?.note).toMatch(
            /Medical/,
        );
    });
});

describe("the booking and class-pack powers (E26)", () => {
    it("relabels service:write for the set-up it covers, keeping its key", () => {
        // One power, one key: no separate "booking settings" permission.
        expect(CAPABILITY_BY_ACTION.get("service:write")?.label).toBe(
            "Change services, hours, time off and booking rules",
        );
        expect(
            CAPABILITIES.some(
                (c) => (c.action as string) === "booking:settings",
            ),
        ).toBe(false);
    });

    it("labels selling a pack apart from changing one, in Schedule, grantable", () => {
        const grantable = grantableCapabilities().map((c) => c.action);
        for (const [action, label] of [
            ["pack:read", "See class packs and who bought them"],
            ["pack:sell", "Sell class packs and book with them"],
            ["pack:write", "Make and change class packs"],
        ] as const) {
            expect(CAPABILITY_BY_ACTION.get(action)?.label).toBe(label);
            expect(CAPABILITY_BY_ACTION.get(action)?.group).toBe("schedule");
            expect(grantable).toContain(action);
        }
    });

    it("lists the pack powers together, the read first", () => {
        const packs = CAPABILITIES.filter((c) =>
            c.action.startsWith("pack:"),
        ).map((c) => c.action);
        expect(packs).toEqual(["pack:read", "pack:sell", "pack:write"]);
    });

    it("says what each pack power includes", () => {
        // The whole pack, money included: there is no money-free read.
        expect(CAPABILITY_BY_ACTION.get("pack:read")?.note).toMatch(/prices/);
        expect(CAPABILITY_BY_ACTION.get("pack:sell")?.note).toContain(
            "Make and change class packs",
        );
        expect(CAPABILITY_BY_ACTION.get("pack:write")?.note).toMatch(
            /can also sell them/,
        );
    });
});

describe("extra permissions for one person (F17)", () => {
    it("never offers as an extra what only the Owner may hold", () => {
        // The policy's own list and the catalogue's `ownerOnly` agree, so
        // what the screen can't offer the gate can't resolve either.
        for (const c of CAPABILITIES) {
            expect(isNeverExtra(c.action)).toBe(c.ownerOnly === true);
        }
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
