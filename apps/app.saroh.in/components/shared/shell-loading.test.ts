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
            breadcrumb: ["Sell", "Orders"],
            title: "Orders",
            shape: "list",
            label: "Loading Orders",
        });
        expect(shellLoadingWords("/leads")).toMatchObject({
            breadcrumb: ["Leads"],
            title: "Leads",
        });
        // Bookings' pages don't live under its address.
        expect(shellLoadingWords("/services").breadcrumb).toEqual([
            "Bookings",
            "Services",
        ]);
    });

    it("leaves a record's title as a bar, under its section", () => {
        const words = shellLoadingWords("/commerce/orders/ord_1");
        expect(words.breadcrumb).toEqual(["Sell", "Orders"]);
        expect(words.title).toBeUndefined();
        expect(words.shape).toBe("detail");
    });

    it("says Settings for any settings page", () => {
        expect(shellLoadingWords("/settings/team").breadcrumb).toEqual([
            "Settings",
        ]);
    });

    it("never says Home for an address it doesn't know", () => {
        for (const path of ["/commerce/orders", "/nowhere", "/analytics"]) {
            expect(shellLoadingWords(path).breadcrumb).not.toContain("Home");
        }
    });
});
