import { describe, expect, it } from "vitest";

import {
    catalogPlanIdForKey,
    catalogueModulesFor,
    MODULE_MAP,
    moduleForLegacyKey,
    RETIRED_MODULE_IDS,
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
        // Everyone uses a team seat (DEC-155): no row of their own for
        // people who only look, and the old one reads as retired.
        expect(MODULE_MAP.members.limitKey).toBe("teamMembers");
        expect(MODULE_MAP.reviewers).toBeUndefined();
        expect(RETIRED_MODULE_IDS.has("reviewers")).toBe(true);
        for (const id of Array.from(RETIRED_MODULE_IDS))
            expect(MODULE_MAP[id]).toBeUndefined();
        // Invoicing needs no module (DEC-070), so nothing it governs can lock.
        expect(MODULE_MAP.invoicing.registry).toBeNull();
        // Saroh's emails (DEC-086) count, but never gate Communications.
        expect(MODULE_MAP["saroh-emails"]).toEqual({
            registry: null,
            limitKey: "sarohEmailsPerMonth",
            legacyEntitlementKey: null,
        });
        expect(catalogueModulesFor("COMMUNICATIONS")).toEqual([]);
        // A merchant's own trackers (DEC-108) are a switch under no module.
        expect(MODULE_MAP["site-trackers"]).toEqual({
            registry: null,
            limitKey: null,
            legacyEntitlementKey: null,
        });
        expect(catalogueModulesFor("WEBSITE")).not.toContain("site-trackers");
        // A branded QR code is a switch under no module, as trackers are.
        expect(MODULE_MAP["qr-branding"]).toEqual({
            registry: null,
            limitKey: null,
            legacyEntitlementKey: null,
        });
        expect(catalogueModulesFor("WEBSITE")).not.toContain("qr-branding");
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
