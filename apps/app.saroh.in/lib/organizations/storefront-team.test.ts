import { describe, expect, it } from "vitest";

import { storefrontNoticeTitle } from "@/components/organizations/storefront-team-notice";

import { storefrontRolesLine } from "./storefront-team";

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
        expect(storefrontNoticeTitle(3, "Storefront team")).toBe(
            "3 people from your storefronts are now on your team as Storefront team",
        );
        expect(storefrontNoticeTitle(1, "Storefront team")).toBe(
            "1 person from your storefronts is now on your team as Storefront team",
        );
    });

    it("uses the name the business gave the role", () => {
        expect(storefrontNoticeTitle(2, "Shop floor")).toMatch(
            /as Shop floor$/,
        );
    });
});
