import { describe, expect, it } from "vitest";

import { storefrontNoticeTitle } from "@/components/organizations/storefront-team-notice";

import { shownRoleLabel, storefrontRolesLine } from "./storefront-team";

describe("storefront roles under a person's name (F16)", () => {
    it("names each storefront with the role in words", () => {
        expect(
            storefrontRolesLine([
                { name: "Hill Road", role: "EDITOR" },
                { name: "Market", role: "VIEWER" },
            ]),
        ).toBe("Hill Road · Editor, Market · Viewer");
    });

    it("says nothing for someone on no storefront", () => {
        expect(storefrontRolesLine([])).toBe("");
    });
});

describe("the storefront people notice's title", () => {
    it("counts people, and says one person in the singular", () => {
        expect(storefrontNoticeTitle(3, "Location team")).toBe(
            "3 people from your locations are now on your team as Location team",
        );
        expect(storefrontNoticeTitle(1, "Location team")).toBe(
            "1 person from your locations is now on your team as Location team",
        );
    });

    it("uses the name the business gave the role", () => {
        expect(storefrontNoticeTitle(2, "Shop floor")).toMatch(
            /as Shop floor$/,
        );
    });
});

describe("the role's name on screen (DEC-069, L10)", () => {
    it("shows the stored default as Location team", () => {
        expect(shownRoleLabel("Storefront team")).toBe("Location team");
    });

    it("keeps a name the business chose, and nothing stays nothing", () => {
        expect(shownRoleLabel("Shop floor")).toBe("Shop floor");
        expect(shownRoleLabel("Admin")).toBe("Admin");
        expect(shownRoleLabel(null)).toBeNull();
        expect(shownRoleLabel(undefined)).toBeUndefined();
    });
});
