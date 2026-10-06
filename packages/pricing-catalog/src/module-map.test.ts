import { describe, expect, it } from "vitest";

import {
    catalogPlanIdForKey,
    catalogueModulesFor,
    MODULE_MAP,
    moduleForLegacyKey,
} from "./module-map";

describe("module map (KTD-8)", () => {
    it("lists the catalogue rows under a registry module", () => {
        expect(catalogueModulesFor("COMMERCE")).toEqual([
            "products",
            "orders",
            "reviews",
        ]);
        // Taking money online, and memberships that renew, both need Payments.
        expect(catalogueModulesFor("PAYMENTS")).toEqual([
            "payments",
            "subscriptions",
        ]);
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

    it("counts places customers visit, websites, storage and visits", () => {
        expect(MODULE_MAP.locations.limitKey).toBe("shopLocations");
        expect(MODULE_MAP.sites.limitKey).toBe("sites");
        expect(MODULE_MAP.storage.limitKey).toBe("storageGb");
        expect(MODULE_MAP.visits.limitKey).toBe("visitsPerMonth");
        // Reviewers use no team seat, but have their own cap.
        expect(MODULE_MAP.reviewers.limitKey).toBe("reviewers");
        // Invoicing needs no module (DEC-070), so nothing it governs can lock.
        expect(MODULE_MAP.invoicing.registry).toBeNull();
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
