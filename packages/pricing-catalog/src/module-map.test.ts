import { describe, expect, it } from "vitest";

import {
    catalogPlanIdForKey,
    catalogueModulesFor,
    MODULE_MAP,
    moduleForLegacyKey,
} from "./module-map";

describe("module map (KTD-8)", () => {
    it("lists the catalogue rows under a registry module", () => {
        expect(catalogueModulesFor("COMMERCE")).toEqual(["products", "orders"]);
        expect(catalogueModulesFor("APPOINTMENTS")).toEqual(["bookings"]);
        // A registry module no row sits under is not the catalogue's to lock.
        expect(catalogueModulesFor("CRM")).toEqual([]);
    });

    it("names every row's registry module, or none", () => {
        for (const [id, e] of Object.entries(MODULE_MAP)) {
            if (e.registry)
                expect(catalogueModulesFor(e.registry)).toContain(id);
        }
    });

    it("reads a legacy raise's key as its row", () => {
        expect(moduleForLegacyKey("teamMembers")).toBe("members");
        expect(moduleForLegacyKey("sites")).toBeNull();
    });

    it("maps legacy plan keys so a paying business is never Free (OQ-3)", () => {
        expect(catalogPlanIdForKey("business")).toBe("grow");
        expect(catalogPlanIdForKey("pro")).toBe("grow");
        expect(catalogPlanIdForKey("free")).toBe("free");
        expect(catalogPlanIdForKey("catalog.b")).toBe("b");
        expect(catalogPlanIdForKey("custom")).toBeNull();
    });
});
