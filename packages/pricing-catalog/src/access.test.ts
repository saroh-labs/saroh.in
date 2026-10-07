import { describe, expect, it } from "vitest";

import type { AccessInput } from "./access";
import {
    businessPricePaise,
    menuState,
    resolveAccess,
    resolveAllAccess,
} from "./access";
import { fixture } from "./catalog.fixture";
import type { Override } from "./overrides";

const now = new Date("2026-10-03T06:00:00Z");
const t = (min: number) => new Date(now.getTime() - (100 - min) * 60_000);

const on = (
    planId: string,
    overrides: Override[] = [],
    addons: AccessInput["addons"] = [],
): AccessInput => ({
    catalog: fixture(),
    planId,
    overrides,
    addons,
    now,
});

describe("resolveAccess", () => {
    it("locks a module the plan leaves out and names the plan above", () => {
        const r = resolveAccess(on("a"), "invoicing");
        expect(r).toMatchObject({
            state: "locked",
            inc: false,
            plan: "Plan A",
            upgradeTo: "Plan B",
            upgradePlanId: "b",
            upgradePricePaise: 11_100,
        });
    });

    it("hides what the plan hides, and gives the plan's limit and period", () => {
        expect(resolveAccess(on("a"), "roles").state).toBe("hidden");
        expect(resolveAccess(on("a"), "orders")).toMatchObject({
            state: "on",
            limit: 11,
            per: "month",
        });
        expect(resolveAccess(on("b"), "orders")).toMatchObject({
            state: "on",
            limit: null,
        });
    });

    it("says when the plan above has no cap on a row (UX-083)", () => {
        expect(resolveAccess(on("a"), "orders")).toMatchObject({
            upgradeTo: "Plan B",
            upgradeUncapped: true,
        });
        expect(resolveAccess(on("a"), "invoicing").upgradeUncapped).toBe(true);
    });

    it("leaves a module the catalogue doesn't list on", () => {
        expect(resolveAccess(on("a"), "unknown").state).toBe("on");
    });

    it("skips retired plans when naming an upgrade", () => {
        const input = on("a");
        input.catalog.plans[1].retired = true;
        expect(resolveAccess(input, "invoicing").upgradeTo).toBe("Plan C");
    });

    describe("overrides, in the agreed order", () => {
        it("puts the business on another plan first", () => {
            const r = resolveAccess(
                on("a", [
                    {
                        kind: "plan",
                        key: "plan",
                        planKey: "b",
                        createdAt: t(1),
                    },
                ]),
                "products",
            );
            expect(r).toMatchObject({
                plan: "Plan B",
                planId: "b",
                limit: 111,
            });
        });

        it("ignores a plan override naming a plan the version doesn't have", () => {
            const r = resolveAccess(
                on("a", [
                    {
                        kind: "plan",
                        key: "plan",
                        planKey: "zz",
                        createdAt: t(1),
                    },
                ]),
                "products",
            );
            expect(r.planId).toBe("a");
        });

        it("applies remove before grant, whatever their dates (RECOMMENDATIONS 3)", () => {
            const grantThenRemove = resolveAccess(
                on("a", [
                    {
                        kind: "grant",
                        key: "invoicing",
                        moduleKey: "invoicing",
                        createdAt: t(1),
                    },
                    {
                        kind: "remove",
                        key: "invoicing",
                        moduleKey: "invoicing",
                        createdAt: t(2),
                    },
                ]),
                "invoicing",
            );
            expect(grantThenRemove).toMatchObject({
                state: "on",
                override: "Granted by Saroh",
            });

            const removeOnly = resolveAccess(
                on("b", [
                    {
                        kind: "remove",
                        key: "invoicing",
                        moduleKey: "invoicing",
                        createdAt: t(1),
                    },
                ]),
                "invoicing",
            );
            expect(removeOnly).toMatchObject({
                state: "hidden",
                override: "Removed by Saroh",
            });
        });

        it("sets a limit up or down and keeps the period", () => {
            const down = resolveAccess(
                on("a", [
                    {
                        kind: "limit",
                        key: "orders",
                        moduleKey: "orders",
                        value: 5,
                        createdAt: t(1),
                    },
                ]),
                "orders",
            );
            expect(down).toMatchObject({
                limit: 5,
                per: "month",
                text: "5 a month",
                override: "Limit set by Saroh",
            });
        });

        it("applies limits oldest first, so the newest wins", () => {
            const r = resolveAccess(
                on("b", [
                    {
                        kind: "limit",
                        key: "products",
                        moduleKey: "products",
                        value: 222,
                        createdAt: t(5),
                    },
                    {
                        kind: "limit",
                        key: "products",
                        moduleKey: "products",
                        value: 22,
                        createdAt: t(1),
                    },
                ]),
                "products",
            );
            expect(r.limit).toBe(222);
        });

        it("never lets a raise lower a limit, and applies it after a limit", () => {
            const lower = resolveAccess(
                on("b", [
                    {
                        kind: "raise",
                        key: "products",
                        moduleKey: "products",
                        value: 22,
                        createdAt: t(1),
                    },
                ]),
                "products",
            );
            expect(lower.limit).toBe(111);
            const raised = resolveAccess(
                on("b", [
                    {
                        kind: "raise",
                        key: "products",
                        moduleKey: "products",
                        value: 150,
                        createdAt: t(1),
                    },
                    {
                        kind: "limit",
                        key: "products",
                        moduleKey: "products",
                        value: 22,
                        createdAt: t(2),
                    },
                ]),
                "products",
            );
            expect(raised.limit).toBe(150);
        });

        it("reads a legacy raise by its entitlement key", () => {
            const r = resolveAccess(
                on("a", [
                    {
                        kind: "raise",
                        key: "teamMembers",
                        value: 4,
                        createdAt: t(1),
                    },
                ]),
                "members",
            );
            expect(r.limit).toBe(4);
        });

        it("ignores expired and revoked overrides; null expiry lasts", () => {
            const r = resolveAccess(
                on("a", [
                    {
                        kind: "grant",
                        key: "invoicing",
                        moduleKey: "invoicing",
                        createdAt: t(1),
                        expiresAt: t(50),
                    },
                    {
                        kind: "grant",
                        key: "invoicing",
                        moduleKey: "invoicing",
                        createdAt: t(1),
                        revokedAt: t(60),
                    },
                ]),
                "invoicing",
            );
            expect(r.state).toBe("locked");
            const lasting = resolveAccess(
                on("a", [
                    {
                        kind: "grant",
                        key: "invoicing",
                        moduleKey: "invoicing",
                        createdAt: t(1),
                        expiresAt: null,
                    },
                ]),
                "invoicing",
            );
            expect(lasting.state).toBe("on");
        });
    });

    describe("add-ons from the business's version", () => {
        it("raises a limit by packs bought", () => {
            const r = resolveAccess(
                on("b", [], [{ addonId: "more-things", quantity: 2 }]),
                "products",
            );
            expect(r).toMatchObject({
                limit: 133,
                override: "Raised by an add-on",
            });
        });

        it("raises by one per unit", () => {
            expect(
                resolveAccess(
                    on("b", [], [{ addonId: "one-person", quantity: 2 }]),
                    "members",
                ).limit,
            ).toBe(5);
        });

        it("switches a module on, and leaves an uncapped module uncapped", () => {
            expect(
                resolveAccess(
                    on("a", [], [{ addonId: "invoices-alone", quantity: 1 }]),
                    "invoicing",
                ),
            ).toMatchObject({
                state: "on",
                override: "Bought as an add-on",
            });
            expect(
                resolveAccess(
                    on("c", [], [{ addonId: "more-things", quantity: 1 }]),
                    "orders",
                ).limit,
            ).toBeNull();
        });

        it("ignores an add-on its version doesn't have", () => {
            expect(
                resolveAccess(
                    on("b", [], [{ addonId: "gone", quantity: 3 }]),
                    "products",
                ).limit,
            ).toBe(111);
        });
    });
});

describe("menuState, resolveAllAccess and businessPricePaise", () => {
    it("finds the module that locks a rail row", () => {
        expect(menuState(on("a"), "money").state).toBe("locked");
        expect(menuState(on("a"), "sell", "Things").state).toBe("on");
        expect(menuState(on("a"), "nowhere")).toEqual({ state: "on" });
    });

    it("resolves every module of the version", () => {
        expect(resolveAllAccess(on("a")).map((m) => m.moduleId)).toEqual(
            fixture().modules.map((m) => m.id),
        );
    });

    it("uses a custom price, else the plan's after a plan override", () => {
        expect(businessPricePaise(on("a"))).toBe(0);
        expect(
            businessPricePaise(
                on("a", [
                    {
                        kind: "plan",
                        key: "plan",
                        planKey: "c",
                        createdAt: t(1),
                    },
                ]),
            ),
        ).toBe(22_200);
        expect(
            businessPricePaise(
                on("b", [
                    {
                        kind: "price",
                        key: "price",
                        value: 9_900,
                        createdAt: t(1),
                    },
                ]),
            ),
        ).toBe(9_900);
    });
});
