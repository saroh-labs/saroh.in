import { describe, expect, it } from "vitest";

import { edit, fixture } from "./catalog.fixture";
import {
    catalogPlanIdForKey,
    catalogPlanKey,
    LEGACY_PLAN_KEYS,
    MODULE_MAP,
} from "./module-map";
import { entitlementsFor, planRows } from "./plan-rows";

describe("planRows", () => {
    it("makes one row per plan and cycle, keyed catalog.<id>", () => {
        const rows = planRows(fixture(), 7);
        expect(rows.map((r) => `${r.key}@${r.version}/${r.interval}`)).toEqual([
            "catalog.a@7/month",
            "catalog.a@7/year",
            "catalog.b@7/month",
            "catalog.b@7/year",
            "catalog.c@7/month",
            "catalog.c@7/year",
        ]);
        const b = rows.filter((r) => r.key === "catalog.b");
        expect(b.map((r) => r.priceCents)).toEqual([11_100, 99_900]);
        expect(new Set(rows.map((r) => r.currency))).toEqual(new Set(["INR"]));
    });

    it("marks a retired plan's rows not offerable", () => {
        const rows = planRows(
            edit(fixture(), (c) => (c.plans[2].retired = true)),
            1,
        );
        expect(rows.filter((r) => !r.active).map((r) => r.key)).toEqual([
            "catalog.c",
            "catalog.c",
        ]);
    });

    it("derives entitlements from the cells", () => {
        expect(entitlementsFor(fixture(), "a")).toEqual({
            site: true,
            products: 11,
            orders: 11,
            invoicing: false,
            roles: false,
            members: 1,
        });
    });
});

describe("plan keys", () => {
    it("maps catalogue and legacy keys to catalogue plans", () => {
        expect(catalogPlanKey("b")).toBe("catalog.b");
        expect(catalogPlanIdForKey("catalog.b")).toBe("b");
        expect(catalogPlanIdForKey("catalog.")).toBeNull();
        expect(catalogPlanIdForKey("mystery")).toBeNull();
    });

    it("never resolves a paying legacy plan as Free (OQ-3)", () => {
        expect(catalogPlanIdForKey("business")).toBe("grow");
        expect(catalogPlanIdForKey("pro")).toBe("grow");
        expect(catalogPlanIdForKey("free")).toBe("free");
        expect(Object.keys(LEGACY_PLAN_KEYS).sort()).toEqual([
            "business",
            "free",
            "pro",
        ]);
    });

    it("maps every design row to the product", () => {
        expect(Object.keys(MODULE_MAP).sort()).toEqual(
            [
                "blog",
                "bookings",
                "integrations",
                "invoicing",
                "locations",
                "members",
                "orders",
                "payments",
                "products",
                "review",
                "reviewers",
                "reviews",
                "roles",
                "sites",
                "storage",
                "subscriptions",
                "themes",
                "visits",
                "website",
            ].sort(),
        );
    });
});
