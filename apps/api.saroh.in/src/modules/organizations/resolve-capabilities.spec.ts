import type { OrganizationContext } from "../../common/types/organization-context";
import {
    allows,
    authorize,
    builtInActions,
    isBuiltInRole,
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
            "order:write",
        ]);
        expect([...set].sort()).toEqual(["order:read", "order:write"]);
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
