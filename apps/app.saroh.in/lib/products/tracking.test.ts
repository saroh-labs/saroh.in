import { describe, expect, it } from "vitest";

import {
    canMarkSoldOut,
    countsStock,
    soldOutAction,
    soldOutFailed,
    soldOutSaid,
    stopTrackingConfirm,
    trackingControl,
    untrackedDetail,
    untrackedLine,
    untrackedShort,
} from "./tracking";

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
        // Untracked is no longer "always available": it can be marked.
        expect(c.description).not.toMatch(/always available/);
        expect(c.description).toMatch(/unless you mark it sold out/);
        expect(c.confirmLabel).toBe("Stop tracking");
    });
});

describe("Sold out by hand (#515)", () => {
    const hill = { storefrontId: "h", name: "Hill Road", soldOut: false };
    const online = { storefrontId: "o", name: "Online", soldOut: false };
    const market = { storefrontId: "m", name: "Market", soldOut: false };

    it("is for whoever may count and move stock", () => {
        expect(canMarkSoldOut({ canStock: true })).toBe(true);
        expect(canMarkSoldOut({ canStock: false })).toBe(false);
    });

    it("says available, never always available, when nowhere is marked", () => {
        expect(untrackedLine([hill])).toBe("Available on the shop.");
        expect(untrackedLine([])).toBe("Available on the shop.");
        expect(untrackedShort([hill])).toBe(
            "Not tracked — sells unless you mark it sold out.",
        );
    });

    it("says sold out by hand at one storefront, or at every one", () => {
        expect(untrackedLine([{ ...hill, soldOut: true }])).toBe(
            "Sold out — marked by hand",
        );
        expect(
            untrackedLine([
                { ...hill, soldOut: true },
                { ...online, soldOut: true },
            ]),
        ).toBe("Sold out — marked by hand");
        expect(untrackedShort([{ ...hill, soldOut: true }])).toBe(
            "Not tracked — sold out, marked by hand.",
        );
    });

    it("the Details row agrees with the Stock card", () => {
        expect(untrackedDetail([hill])).toBe("Not tracked · always available");
        // The seeded multigrain: sold out by hand at Hill Road.
        expect(untrackedDetail([{ ...hill, soldOut: true }])).toBe(
            "Not tracked · sold out, marked by hand",
        );
        expect(untrackedDetail([{ ...hill, soldOut: true }, online])).toBe(
            "Not tracked · sold out at Hill Road, marked by hand",
        );
    });

    it("names the storefronts when only some are marked", () => {
        expect(untrackedLine([{ ...hill, soldOut: true }, online])).toBe(
            "Sold out at Hill Road — marked by hand",
        );
        expect(
            untrackedLine([
                { ...hill, soldOut: true },
                online,
                { ...market, soldOut: true },
            ]),
        ).toBe("Sold out at Hill Road and Market — marked by hand");
    });

    it("words the action, the toast and the refusal", () => {
        expect(soldOutAction(false)).toBe("Mark sold out");
        expect(soldOutAction(true)).toBe("Mark available");
        expect(soldOutSaid("Hill Road", true)).toBe(
            "Marked sold out at Hill Road.",
        );
        expect(soldOutSaid("Hill Road", false)).toBe(
            "Available again at Hill Road.",
        );
        expect(soldOutFailed(true)).toBe("Not marked sold out");
        expect(soldOutFailed(false)).toBe("Still marked sold out");
    });
});
