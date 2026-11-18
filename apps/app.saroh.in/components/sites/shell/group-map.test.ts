import { describe, expect, it } from "vitest";

import { SETTINGS_GROUPS } from "@/lib/sites/settings-page";

import type { SiteAccess } from "./group-map";
import { currentSection, siteGroups, switchHref } from "./group-map";

const owner: SiteAccess = {
    canEdit: true,
    mayReadForms: true,
    mayBusiness: true,
    mayTeam: true,
};
const reader: SiteAccess = {
    canEdit: false,
    mayReadForms: false,
    mayBusiness: false,
    mayTeam: false,
};
const hrefs = (access: SiteAccess) =>
    siteGroups("s1", access).flatMap((g) => g.sections.map((s) => s.href));

describe("the Website area's four groups (RULES §3)", () => {
    it("draws the four groups in order, and no Code group", () => {
        expect(siteGroups("s1", owner).map((g) => g.label)).toEqual([
            "Pages and posts",
            "Look",
            "Reach",
            "People and settings",
        ]);
    });

    /*
     * Structural (00-universal §15): every place today's tabs reach is one
     * press from the new list, so nothing is lost before its batch.
     */
    it("keeps every one of today's tabs reachable", () => {
        const all = hrefs(owner);
        for (const tab of ["pages", "writing", "forms", "settings"]) {
            expect(all).toContain(`/sites/s1/${tab}`);
        }
        // The editor (Open editor is also in the header) and the Team.
        expect(all).toContain("/sites/s1");
        expect(all).toContain("/settings/people");
    });

    it("keeps every Settings group reachable, three of them from Reach", () => {
        const all = hrefs(owner);
        const reach = siteGroups("s1", owner).find((g) => g.id === "reach");
        expect(reach?.sections.map((s) => s.href)).toEqual([
            "/sites/s1/settings?section=search-and-sharing",
            "/sites/s1/settings?section=address",
            "/sites/s1/settings?section=contact",
        ]);
        // The rest open from Settings itself, whose own list holds them all.
        expect(all).toContain("/sites/s1/settings");
        expect(SETTINGS_GROUPS.map((g) => g.id)).toEqual(
            expect.arrayContaining([
                "address",
                "search-and-sharing",
                "contact",
            ]),
        );
    });

    it("gives a reader only what they can read (DEC-200)", () => {
        expect(siteGroups("s1", reader).map((g) => g.id)).toEqual([
            "pages-and-posts",
        ]);
        expect(hrefs(reader)).toEqual(["/sites/s1/writing"]);
        expect(hrefs({ ...reader, mayReadForms: true, mayTeam: true })).toEqual(
            ["/sites/s1/writing", "/sites/s1/forms", "/settings/people"],
        );
    });

    it("leaves Forms out without form:read, and Logo without the business's settings", () => {
        const all = hrefs({
            ...owner,
            mayReadForms: false,
            mayBusiness: false,
        });
        expect(all).not.toContain("/sites/s1/forms");
        expect(all).not.toContain("/settings/organization");
    });
});

describe("currentSection", () => {
    const groups = siteGroups("s1", owner);
    const at = (path: string, q = "") =>
        currentSection(groups, "s1", path, new URLSearchParams(q));

    it("finds Overview, a section, and Settings' groups that moved to Reach", () => {
        expect(at("/sites/s1/overview").section).toBe("overview");
        expect(at("/sites/s1/pages")).toEqual({
            group: "pages-and-posts",
            section: "pages",
        });
        expect(at("/sites/s1/forms/f1").section).toBe("forms");
        expect(at("/sites/s1/settings", "section=address")).toEqual({
            group: "reach",
            section: "address",
        });
        expect(at("/sites/s1/settings", "section=tracking")).toEqual({
            group: "people-and-settings",
            section: "settings",
        });
    });

    it("is nowhere on a place a section leads to", () => {
        expect(at("/sites/s1/versions").section).toBeNull();
    });
});

describe("switchHref (the switcher keeps the screen)", () => {
    it("keeps the section, and Settings' open group", () => {
        expect(switchHref("/sites/a/pages", "", "a", "b")).toBe(
            "/sites/b/pages",
        );
        expect(
            switchHref("/sites/a/settings", "?section=contact", "a", "b"),
        ).toBe("/sites/b/settings?section=contact");
    });

    it("drops what belongs to one site alone", () => {
        expect(switchHref("/sites/a/forms/f1", "", "a", "b")).toBe(
            "/sites/b/forms",
        );
        expect(switchHref("/sites/a/posts/p1", "", "a", "b")).toBe(
            "/sites/b/overview",
        );
    });
});
