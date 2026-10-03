import type { OrganizationContext } from "../../common/types/organization-context";
import {
    allows,
    authorize,
    builtInActions,
    canWriteStock,
    extraActionsFor,
    isBuiltInRole,
    isNeverExtra,
    resolveCapabilities,
} from "./organization-policy";

const ctx = (over: Partial<OrganizationContext>): OrganizationContext => ({
    organizationId: "org_1",
    userId: "user_1",
    role: "MEMBER",
    ...over,
});

/**
 * Roles a business invents. The rule these tests protect is that a role can
 * never hold a power the server does not enforce, in either direction.
 */
describe("resolveCapabilities", () => {
    it("uses the business's own list when it has one", () => {
        const set = resolveCapabilities("stock-clerk", [
            "order:read",
            "contact:read",
        ]);
        expect([...set].sort()).toEqual(["contact:read", "order:read"]);
    });

    it("drops a stored action that does not exist", () => {
        // A role cannot gain a power by being saved with a typo — and cannot
        // be broken by one either.
        const set = resolveCapabilities("stock-clerk", [
            "order:read",
            "order:teleport",
        ]);
        expect([...set]).toEqual(["order:read"]);
    });

    it("does not hand a stored role powers added after it was saved", () => {
        // A business that invented "front desk" before invoices existed
        // granted it what it could see then. New powers reach the built-in
        // roles; an invented one gains them only when someone ticks them.
        const set = resolveCapabilities("front-desk", [
            "booking:read",
            "booking:write",
        ]);
        for (const action of [
            "subscription:read",
            "invoice:write",
            "course:write",
            "pack:write",
        ] as const) {
            expect(set.has(action)).toBe(false);
        }
    });

    it("lets a role grant nothing", () => {
        // A half-built role is not an invalid one.
        expect(resolveCapabilities("draft", []).size).toBe(0);
    });

    describe("when the business has stored nothing", () => {
        it.each(["OWNER", "ADMIN", "MEMBER", "REVIEWER"] as const)(
            "resolves %s from the shipped policy",
            (role) => {
                // This is why no backfill was needed: a business that has
                // invented nothing has no rows and behaves exactly as it did
                // before the table existed.
                expect([...resolveCapabilities(role)].sort()).toEqual(
                    [...builtInActions(role)].sort(),
                );
            },
        );

        it("gives an unknown role the read-only floor, not nothing", () => {
            // The membership outlives the role it names, so a renamed or
            // deleted role must leave someone seeing LESS than they expected
            // rather than locked out of a business they belong to.
            const set = resolveCapabilities("role-that-was-deleted");
            expect(set.has("org:read")).toBe(true);
            expect(set.has("member:read")).toBe(true);
            expect(set.has("org:update")).toBe(false);
            expect(set.has("org:delete")).toBe(false);
        });
    });

    it("knows which keys are built in", () => {
        expect(isBuiltInRole("OWNER")).toBe(true);
        expect(isBuiltInRole("stock-clerk")).toBe(false);
    });
});

describe("allows / authorize", () => {
    it("prefers the resolved set over the role name", () => {
        // The context says MEMBER — the floor — but the business granted this
        // invented role the power to change orders.
        const actor = ctx({
            role: "MEMBER",
            roleKey: "stock-clerk",
            actions: resolveCapabilities("stock-clerk", ["order:write"]),
        });
        expect(allows(actor, "order:write")).toBe(true);
        expect(() => authorize(actor, "order:write")).not.toThrow();
    });

    it("refuses what the resolved set leaves out, whatever the role says", () => {
        const actor = ctx({
            role: "OWNER",
            roleKey: "stock-clerk",
            actions: resolveCapabilities("stock-clerk", ["order:read"]),
        });
        expect(allows(actor, "org:delete")).toBe(false);
        expect(() => authorize(actor, "org:delete")).toThrow(/may not perform/);
    });

    it("falls back to the shipped map when nothing was resolved", () => {
        // Every context built before roles became rows — and every unit test —
        // has no `actions`, and must behave exactly as it always did.
        expect(allows(ctx({ role: "OWNER" }), "org:delete")).toBe(true);
        expect(allows(ctx({ role: "MEMBER" }), "org:delete")).toBe(false);
        expect(allows(ctx({ role: "REVIEWER" }), "site:comment")).toBe(true);
        expect(allows(ctx({ role: "REVIEWER" }), "member:read")).toBe(false);
    });

    it("names the invented role in the refusal, not the floor it maps to", () => {
        const actor = ctx({
            role: "MEMBER",
            roleKey: "stock-clerk",
            actions: new Set<never>(),
        });
        expect(() => authorize(actor, "order:read")).toThrow(/stock-clerk/);
    });
});

/**
 * The order split (DEC-039, B16; matrix §2). `order:write` implies
 * `order:create`, `order:edit` and `order:export`; `payment:manage` implies
 * `order:refund`; each of the four implies `order:read`. So a role saved
 * before the split keeps what it could do, and a power over an order shows
 * the whole order. `order:stage` stays apart until F18.
 */
describe("the split order powers (B16)", () => {
    const parts = [
        "order:create",
        "order:edit",
        "order:refund",
        "order:export",
    ] as const;

    it("a role saved with order:write before the split still takes, changes and exports", () => {
        const set = resolveCapabilities("senior", ["order:write"]);
        for (const action of [
            "order:create",
            "order:edit",
            "order:export",
            "order:read",
        ] as const) {
            expect(set.has(action)).toBe(true);
        }
        // Refunds were never order:write's.
        expect(set.has("order:refund")).toBe(false);
    });

    it("payment:manage keeps refunding orders, and sees them", () => {
        const set = resolveCapabilities("cashier", ["payment:manage"]);
        expect(set.has("order:refund")).toBe(true);
        expect(set.has("order:read")).toBe(true);
        expect(set.has("order:create")).toBe(false);
    });

    it.each(parts)("%s alone implies order:read and nothing else", (part) => {
        const set = resolveCapabilities("custom", [part]);
        expect([...set].sort()).toEqual([part, "order:read"].sort());
    });

    it("order:stage does not imply order:read yet (F18)", () => {
        const set = resolveCapabilities("kitchen", ["order:stage"]);
        expect(set.has("order:read")).toBe(false);
    });

    it("Owner and Admin hold every part; Member and Reviewer hold none", () => {
        for (const part of parts) {
            expect(resolveCapabilities("OWNER").has(part)).toBe(true);
            expect(resolveCapabilities("ADMIN").has(part)).toBe(true);
            expect(resolveCapabilities("MEMBER").has(part)).toBe(false);
            expect(resolveCapabilities("REVIEWER").has(part)).toBe(false);
        }
        // The Member bundle is unchanged here; F18 decides it.
        expect(resolveCapabilities("MEMBER").has("order:stage")).toBe(true);
        expect(resolveCapabilities("MEMBER").has("order:read")).toBe(false);
    });

    it("a role with order:create alone may take an order, but not edit or refund one", () => {
        const actor = ctx({
            roleKey: "counter",
            actions: resolveCapabilities("counter", ["order:create"]),
        });
        expect(allows(actor, "order:create")).toBe(true);
        expect(allows(actor, "order:read")).toBe(true);
        expect(() => authorize(actor, "order:edit")).toThrow(/may not perform/);
        expect(() => authorize(actor, "order:refund")).toThrow(
            /may not perform/,
        );
        expect(() => authorize(actor, "order:export")).toThrow(
            /may not perform/,
        );
    });
});

/**
 * "Count and move stock" (#513). `store:write` has always covered setting
 * stock, so every role holding it counts — including a role the business
 * saved before `inventory:write` existed — and `canWriteStock` is the one
 * question every stock write asks.
 */
describe("inventory:write", () => {
    it("is implied by store:write on a stored role", () => {
        const set = resolveCapabilities("shop-manager", [
            "store:read",
            "store:write",
        ]);
        expect(set.has("inventory:write")).toBe(true);
    });

    it("can be granted on its own", () => {
        const set = resolveCapabilities("stock-clerk", [
            "store:read",
            "inventory:write",
        ]);
        expect(set.has("inventory:write")).toBe(true);
        expect(set.has("store:write")).toBe(false);
    });

    it("is not held by a stored role with neither", () => {
        const set = resolveCapabilities("front-desk", ["store:read"]);
        expect(set.has("inventory:write")).toBe(false);
    });

    it("Owner and Admin hold it, Member and Reviewer do not", () => {
        expect(resolveCapabilities("OWNER").has("inventory:write")).toBe(true);
        expect(resolveCapabilities("ADMIN").has("inventory:write")).toBe(true);
        expect(resolveCapabilities("MEMBER").has("inventory:write")).toBe(
            false,
        );
        expect(resolveCapabilities("REVIEWER").has("inventory:write")).toBe(
            false,
        );
    });

    it("canWriteStock: inventory:write or store:write", () => {
        const withActions = (actions: string[]) =>
            ctx({
                roleKey: "custom",
                actions: resolveCapabilities("custom", actions),
            });
        expect(canWriteStock(withActions(["store:write"]))).toBe(true);
        expect(canWriteStock(withActions(["inventory:write"]))).toBe(true);
        expect(canWriteStock(withActions(["store:read"]))).toBe(false);
        // A context resolved before custom roles: the shipped map.
        expect(canWriteStock(ctx({ role: "OWNER" }))).toBe(true);
        expect(canWriteStock(ctx({ role: "ADMIN" }))).toBe(true);
        expect(canWriteStock(ctx({ role: "MEMBER" }))).toBe(false);
        // A hand-built context that holds store:write but was never resolved
        // still counts.
        expect(
            canWriteStock(ctx({ actions: new Set(["store:write"] as const) })),
        ).toBe(true);
    });
});

/**
 * A person's extra permissions (F17, DEC-039; matrix §5): the role's set and
 * the extras, united, filtered, then implied holds.
 */
describe("resolveCapabilities with a person's extras", () => {
    it("adds an extra to a built-in role, and it only adds", () => {
        const set = resolveCapabilities("MEMBER", null, ["order:refund"]);
        expect(set.has("order:refund")).toBe(true);
        // Everything the Member already held is still held.
        for (const a of builtInActions("MEMBER")) expect(set.has(a)).toBe(true);
        // A refund power does not bring editing an order with it.
        expect(set.has("order:edit")).toBe(false);
    });

    it("counts implied holds on the union", () => {
        // A refund shows the order it refunds.
        expect(
            resolveCapabilities("MEMBER", null, ["order:refund"]).has(
                "order:read",
            ),
        ).toBe(true);
        // Making packs sells them, and selling shows them.
        const packs = resolveCapabilities("MEMBER", null, ["pack:write"]);
        expect(packs.has("pack:sell")).toBe(true);
        expect(packs.has("pack:read")).toBe(true);
        // Payments manages refunds too.
        expect(
            resolveCapabilities("MEMBER", null, ["payment:manage"]).has(
                "order:refund",
            ),
        ).toBe(true);
    });

    it("adds to an invented role's own list", () => {
        const set = resolveCapabilities(
            "stock-clerk",
            ["store:read"],
            ["contact:write"],
        );
        expect([...set].sort()).toEqual([
            "contact:read",
            "contact:write",
            "store:read",
        ]);
    });

    it("drops unknown strings and owner-only powers", () => {
        const set = resolveCapabilities("MEMBER", null, [
            "order:teleport",
            "org:delete",
        ]);
        expect(set.has("org:delete")).toBe(false);
        expect([...set].sort()).toEqual([...builtInActions("MEMBER")].sort());
    });

    it("gives a Reviewer nothing beyond reviewing websites (DEC-006)", () => {
        const set = resolveCapabilities("REVIEWER", null, [
            "payment:read",
            "contact:read",
            "site:comment",
        ]);
        expect([...set].sort()).toEqual([
            "site:approve",
            "site:comment",
            "site:read",
        ]);
        expect(extraActionsFor("REVIEWER", ["payment:read"])).toEqual([]);
    });

    it("resolves exactly as before with no extras", () => {
        expect(resolveCapabilities("MEMBER", null, [])).toBe(
            resolveCapabilities("MEMBER"),
        );
        expect(resolveCapabilities("ADMIN", null, null)).toBe(
            resolveCapabilities("ADMIN"),
        );
    });

    it("lets an allows() check pass for an extra, and fail once it is gone", () => {
        const withExtra = ctx({
            roleKey: "MEMBER",
            actions: resolveCapabilities("MEMBER", null, ["order:refund"]),
        });
        expect(allows(withExtra, "order:refund")).toBe(true);
        expect(allows(withExtra, "order:edit")).toBe(false);
        const without = ctx({
            roleKey: "MEMBER",
            actions: resolveCapabilities("MEMBER", null, []),
        });
        expect(allows(without, "order:refund")).toBe(false);
    });

    it("never treats org:delete as an extra", () => {
        expect(isNeverExtra("org:delete")).toBe(true);
        // Nor changing the web address (DEC-069): the Owner's alone.
        expect(isNeverExtra("org:address:update")).toBe(true);
        expect(isNeverExtra("order:refund")).toBe(false);
    });
});
