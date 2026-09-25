import { describe, expect, it } from "vitest";

import {
    SETTINGS_INDEX,
    isSettingsScreen,
    searchSettings,
    settingsEntryHref,
    tabFromParam,
} from "./search";

const owner = { role: "OWNER" as const };
const member = { role: "MEMBER" as const };

describe("searchSettings", () => {
    it("finds a Business setting on its tab", () => {
        expect(searchSettings("gstin", owner)).toEqual([
            {
                label: "GSTIN or tax ID",
                where: "Business",
                href: "/settings/organization?section=tax",
            },
        ]);
        expect(searchSettings("  Invoice PREFIX ", owner)[0]?.href).toBe(
            "/settings/organization?section=tax",
        );
        expect(searchSettings("pin code", owner)[0]?.href).toBe(
            "/settings/organization?section=address",
        );
        expect(
            searchSettings("number format", owner).map((h) => h.href),
        ).toEqual(["/settings/organization?section=tax"]);
        expect(searchSettings("hours", owner)).toEqual([
            {
                label: "Opening hours",
                where: "Business",
                href: "/settings/organization?section=hours",
            },
        ]);
        // The tab is "Address" now; the setting keeps its full name.
        expect(searchSettings("registered address", owner)[0]?.href).toBe(
            "/settings/organization?section=address",
        );
    });

    it("matches the page's name as well, as the design does", () => {
        const hits = searchSettings("team", owner);
        expect(hits.map((h) => h.label)).toEqual([
            "Roles and what they open",
            "People — invite or change a role",
        ]);
        expect(hits[0]?.href).toBe("/settings/people?view=roles");
    });

    it("leaves the page's name out when asked (the ⌘K menu)", () => {
        expect(searchSettings("business", owner, { byPage: false })).toEqual([
            expect.objectContaining({ label: "Business name" }),
            expect.objectContaining({ label: "Type of business" }),
        ]);
    });

    it("lists the first eight before anything is typed", () => {
        const hits = searchSettings("", owner);
        expect(hits).toHaveLength(8);
        expect(hits[0]?.label).toBe("Business name");
    });

    it("says nothing for what is not there", () => {
        expect(searchSettings("zebra", owner)).toEqual([]);
    });

    it("offers only the pages this person may open", () => {
        // A Member reads the roster and the modules, and their own profile —
        // not the business's details, its plan or its providers.
        const hits = searchSettings("", member, { limit: 99 });
        expect(new Set(hits.map((h) => h.where))).toEqual(
            new Set(["Team", "Modules", "Your profile"]),
        );
        expect(searchSettings("gstin", member)).toEqual([]);
    });

    it("finds the plan for the owner alone, and alerts for anyone", () => {
        expect(searchSettings("invoices from", owner)).toEqual([
            {
                label: "Invoices from Saroh",
                where: "Plan and billing",
                href: "/settings/billing",
            },
        ]);
        expect(searchSettings("plan", { role: "ADMIN" })).toEqual([]);
        for (const actor of [owner, member, { role: "REVIEWER" as const }]) {
            expect(searchSettings("alerts", actor)[0]?.href).toBe(
                "/settings/profile",
            );
        }
    });

    it("prefers the permissions the API resolved over the role's name", () => {
        const hits = searchSettings("gst", {
            role: "MEMBER",
            actions: ["org:settings:read"],
        });
        expect(hits.map((h) => h.where)).toContain("Business");
    });

    it("says invite only to someone who may invite", () => {
        const labels = (actor: Parameters<typeof searchSettings>[1]) =>
            searchSettings("people", actor, { byPage: false }).map(
                (h) => h.label,
            );
        expect(labels(owner)).toEqual(["People — invite or change a role"]);
        expect(labels(member)).toEqual(["People on the team"]);
        expect(labels({ role: null })).toEqual([
            "People — invite or change a role",
        ]);
    });

    it("points every entry at a settings page", () => {
        for (const entry of SETTINGS_INDEX) {
            expect(
                isSettingsScreen(settingsEntryHref(entry).split("?")[0]),
            ).toBe(true);
        }
    });
});

describe("isSettingsScreen", () => {
    it("is each settings tab and what is under it", () => {
        expect(isSettingsScreen("/settings/organization")).toBe(true);
        expect(isSettingsScreen("/settings/people")).toBe(true);
        expect(isSettingsScreen("/settings/providers/x")).toBe(true);
    });

    it("is nothing else", () => {
        expect(isSettingsScreen("/")).toBe(false);
        expect(isSettingsScreen("/sites/abc/settings")).toBe(false);
        expect(isSettingsScreen("/settings/organizations")).toBe(false);
        expect(isSettingsScreen("/settings/projects/p1/modules")).toBe(false);
    });
});

describe("tabFromParam", () => {
    const keys = ["identity", "contact", "tax", "hours", "address"] as const;
    it("reads a tab the page has", () => {
        expect(tabFromParam("tax", keys, "identity")).toBe("tax");
        expect(tabFromParam("hours", keys, "identity")).toBe("hours");
    });
    it("falls back on a missing or unknown one", () => {
        expect(tabFromParam(null, keys, "identity")).toBe("identity");
        expect(tabFromParam("billing", keys, "identity")).toBe("identity");
    });
});
