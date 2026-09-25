import { describe, expect, it } from "vitest";

import { countsStock, stopTrackingConfirm, trackingControl } from "./tracking";

describe("trackingControl", () => {
    it("lets Owner and Admin (store:write) change it", () => {
        expect(trackingControl({ canWrite: true, canStock: true })).toBe(
            "change",
        );
        expect(trackingControl({ canWrite: true, canStock: false })).toBe(
            "change",
        );
    });

    it("shows a stock-only role the switch, locked", () => {
        expect(trackingControl({ canWrite: false, canStock: true })).toBe(
            "locked",
        );
    });

    it("shows anyone else no switch", () => {
        expect(trackingControl({ canWrite: false, canStock: false })).toBe(
            "hidden",
        );
    });
});

describe("countsStock", () => {
    it("counts only while the product and the business both track stock", () => {
        expect(countsStock(true, true)).toBe(true);
        expect(countsStock(false, true)).toBe(false);
        expect(countsStock(true, false)).toBe(false);
        expect(countsStock(false, false)).toBe(false);
    });

    it("lets the product's switch decide when the business's is unknown", () => {
        expect(countsStock(true, null)).toBe(true);
        expect(countsStock(false, null)).toBe(false);
    });
});

describe("stopTrackingConfirm", () => {
    it("names the product, the count going to 0 and the verb", () => {
        const c = stopTrackingConfirm("Rye loaf");
        expect(c.title).toBe("Stop tracking Rye loaf?");
        expect(c.description).toMatch(/goes to 0 at every storefront/);
        expect(c.description).toMatch(/starts from 0/);
        expect(c.confirmLabel).toBe("Stop tracking");
    });
});
