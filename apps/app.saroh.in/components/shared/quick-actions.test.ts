/**
 * The command palette's quick actions, by permission (UX audit, 10 Oct
 * 2026). "New service" and "New location" named no permission, so a
 * Member, a location's own people and a calendar-only person were offered
 * both and then refused.
 */
import { describe, expect, it } from "vitest";

import { NAV_GROUPS, navGroupsWithSites } from "./nav-items";
import { QUICK_ACTIONS, quickActionsFor } from "./quick-actions";

/** What the API resolves for each narrow role (`organization-policy.ts`). */
const MEMBER = [
    "org:read",
    "member:read",
    "store:read",
    "site:read",
    "media:read",
    "module:read",
    "booking:read",
    "service:read",
    "contact:read",
    "order:stage",
];
const CALENDAR_ONLY = [
    "org:read",
    "module:read",
    "booking:read",
    "booking:write",
    "service:read",
];
const STOREFRONT_TEAM = [
    "org:read",
    "member:read",
    "module:read",
    "media:read",
    "store:read",
    "product-review:read",
    "order:stage",
];

const EVERY_MODULE = [
    "APPOINTMENTS",
    "COURSES",
    "CLASS_PACKS",
    "WEBSITE",
    "PAYMENTS",
    "COMMERCE",
];

const labels = (
    actions: string[] | null,
    role: "MEMBER" | "OWNER" = "MEMBER",
) =>
    quickActionsFor({
        moduleKeys: EVERY_MODULE,
        role,
        actions,
        siteCount: 0,
        storefronts: null,
    }).map((a) => a.label);

describe("the quick actions table", () => {
    it("every row names the permission its write asks", () => {
        expect(QUICK_ACTIONS.length).toBeGreaterThan(0);
        for (const row of QUICK_ACTIONS) {
            const asked =
                typeof row.action === "string" ? [row.action] : row.action;
            expect(asked.length, row.label).toBeGreaterThan(0);
            for (const action of asked) {
                expect(action, row.label).toMatch(/^[a-z-]+(:[a-z-]+)+$/);
            }
        }
    });

    it("no row asks only a read: each of them makes something", () => {
        for (const row of QUICK_ACTIONS) {
            const asked =
                typeof row.action === "string" ? [row.action] : row.action;
            expect(
                asked.every((a) => !a.endsWith(":read")),
                row.label,
            ).toBe(true);
        }
    });

    it("New service asks service:write and New location store:create", () => {
        const by = Object.fromEntries(
            QUICK_ACTIONS.map((a) => [a.label, a.action]),
        );
        expect(by["New service"]).toBe("service:write");
        expect(by["New location"]).toBe("store:create");
    });
});

describe("quickActionsFor", () => {
    it.each([
        ["a Member", MEMBER],
        ["a calendar-only person", CALENDAR_ONLY],
        ["a location's own people", STOREFRONT_TEAM],
    ])("offers %s nothing that makes something", (_, actions) => {
        expect(labels(actions)).toEqual([]);
    });

    it("offers a role each row it was given, and no other", () => {
        expect(labels([...MEMBER, "service:write"])).toEqual(["New service"]);
        expect(labels([...MEMBER, "store:create"])).toEqual(["New location"]);
        expect(labels([...MEMBER, "pack:sell"])).toEqual(["Sell a pack"]);
        expect(labels([...MEMBER, "invoice:write"])).toEqual(["New invoice"]);
    });

    it("offers an owner every row", () => {
        const owner = QUICK_ACTIONS.flatMap((a) =>
            typeof a.action === "string" ? [a.action] : [...a.action],
        );
        expect(labels(owner, "OWNER")).toEqual(
            QUICK_ACTIONS.map((a) => a.label),
        );
    });

    it("judges an Owner or Admin with no permissions loaded by the role", () => {
        expect(labels(null, "OWNER")).toEqual(
            QUICK_ACTIONS.map((a) => a.label),
        );
        expect(labels(null, "MEMBER")).toEqual([]);
    });

    it("still follows the module and the business's limits", () => {
        const all = QUICK_ACTIONS.flatMap((a) =>
            typeof a.action === "string" ? [a.action] : [...a.action],
        );
        const offered = quickActionsFor({
            moduleKeys: ["APPOINTMENTS"],
            role: "OWNER",
            actions: all,
            siteCount: 1,
            storefronts: { used: 3, limit: 3 },
        }).map((a) => a.label);
        // Invoicing needs no module (DEC-070).
        expect(offered).toEqual(["New service", "New invoice"]);
    });
});

describe("the palette's site rows, by permission and never by role name", () => {
    const sites = [{ id: "site_1", name: "Rye" }];
    const websiteRows = (
        role: "OWNER" | "ADMIN" | "MEMBER",
        actions: string[] | null,
        has = sites,
    ) =>
        navGroupsWithSites(NAV_GROUPS, has, role, actions)
            .flatMap((g) => g.items)
            .filter((i) => i.href === "/sites")
            .flatMap((i) => i.children ?? []);

    it("offers New site to a role the business made with site:create", () => {
        const rows = websiteRows("MEMBER", ["site:read", "site:create"], []);
        expect(rows.map((r) => r.label)).toContain("New site");
    });

    it("doesn't offer New site to a role without it, whatever it maps to", () => {
        // A made role can map to any built-in. Only what was ticked counts.
        const rows = websiteRows("ADMIN", ["site:read"], []);
        expect(rows.map((r) => r.label)).not.toContain("New site");
    });

    it("gives the authoring rows to section:write alone", () => {
        const author = websiteRows("MEMBER", ["site:read", "section:write"]);
        const reader = websiteRows("ADMIN", ["site:read"]);
        const under = (rows: typeof author) =>
            rows.flatMap((r) => r.children ?? []).map((c) => c.label);
        expect(under(author)).toContain("Pages");
        expect(under(reader)).not.toContain("Pages");
    });

    it("falls back to the role when no permissions were loaded", () => {
        expect(websiteRows("OWNER", null, []).map((r) => r.label)).toContain(
            "New site",
        );
        expect(
            websiteRows("MEMBER", null, []).map((r) => r.label),
        ).not.toContain("New site");
    });
});
