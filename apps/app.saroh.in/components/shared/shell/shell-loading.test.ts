import { describe, expect, it } from "vitest";

import { shellLoadingWords } from "./shell-loading";

describe("the shell's loader names the page being opened", () => {
    it("says Home only on Home", () => {
        expect(shellLoadingWords("/")).toMatchObject({
            breadcrumb: ["Home"],
            // Home A's own shape (DEC-171, `HALoadingD`).
            shape: "home",
        });
    });

    it("names a section's page by the menu's own words", () => {
        expect(shellLoadingWords("/commerce/orders")).toMatchObject({
            breadcrumb: ["Orders"],
            title: "Orders",
            // The header only: Orders' own loader draws the body.
            shape: "none",
            label: "Loading Orders",
        });
        expect(shellLoadingWords("/leads")).toMatchObject({
            breadcrumb: ["Leads"],
            title: "Leads",
        });
        // Each row is its own (DEC-262): the deepest one names the page.
        expect(shellLoadingWords("/services").breadcrumb).toEqual(["Services"]);
        expect(shellLoadingWords("/bookings/availability").breadcrumb).toEqual([
            "Hours and time off",
        ]);
    });

    it("leaves a record's title as a bar, under its section", () => {
        const words = shellLoadingWords("/commerce/orders/ord_1");
        expect(words.breadcrumb).toEqual(["Orders"]);
        expect(words.title).toBeUndefined();
        expect(words.shape).toBe("none");
    });

    it("says Settings for any settings page, in Settings' own shape", () => {
        expect(shellLoadingWords("/settings/team")).toMatchObject({
            breadcrumb: ["Settings"],
            shape: "settings",
        });
    });

    it("draws no body grey outside Home and Settings", () => {
        for (const path of [
            "/commerce/orders",
            "/commerce/products",
            "/commerce/orders/ord_1",
            "/nowhere",
        ]) {
            expect(shellLoadingWords(path).shape).toBe("none");
        }
    });

    it("never says Home for an address it doesn't know", () => {
        for (const path of ["/commerce/orders", "/nowhere", "/analytics"]) {
            expect(shellLoadingWords(path).breadcrumb).not.toContain("Home");
        }
    });
});
