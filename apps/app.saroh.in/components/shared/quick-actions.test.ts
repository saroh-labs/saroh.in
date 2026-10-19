/**
 * The command palette's quick actions, by permission (UX audit, 10 Oct
 * 2026). "New service" and "New location" named no permission, so a
 * Member, a location's own people and a calendar-only person were offered
 * both and then refused.
 */
import { describe, expect, it } from "vitest";

import { NAV_GROUPS, navGroupsWithSites } from "./nav-items";
import {
    HOME_NEW,
    homeNewFor,
    QUICK_ACTIONS,
    quickActionsFor,
} from "./quick-actions";

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

describe("the daily starts (10 Oct 2026)", () => {
    const row = (label: string) => {
        const found = QUICK_ACTIONS.find((a) => a.label === label);
        if (!found) throw new Error(`no "${label}" row`);
        return found;
    };

    it.each([
        ["New order", "/commerce/orders?new=1", "order:create", "COMMERCE"],
        ["New booking", "/bookings?new=1", "booking:write", "APPOINTMENTS"],
        ["New product", "/commerce/products/new", "store:write", "COMMERCE"],
        ["New customer", "/commerce/customers/new", "contact:write", undefined],
        [
            "New discount code",
            "/commerce/discounts/new",
            "discount:write",
            "COMMERCE",
        ],
    ])("%s starts at %s, for whoever holds %s", (label, href, action, mod) => {
        expect(row(label)).toMatchObject({ href, action });
        expect(row(label).moduleKey).toBe(mod);
    });

    it("come first: what a shop does forty times a day", () => {
        expect(QUICK_ACTIONS.slice(0, 5).map((a) => a.label)).toEqual([
            "New order",
            "New booking",
            "New product",
            "New customer",
            "New discount code",
        ]);
    });

    it("each is offered to its permission alone", () => {
        expect(labels([...MEMBER, "order:create"])).toEqual(["New order"]);
        expect(labels([...MEMBER, "store:write"])).toEqual(["New product"]);
        expect(labels([...MEMBER, "contact:write"])).toEqual(["New customer"]);
        expect(labels([...MEMBER, "discount:write"])).toEqual([
            "New discount code",
        ]);
    });

    it("a calendar-only person, who books, is offered New booking and nothing else", () => {
        expect(labels(CALENDAR_ONLY)).toEqual(["New booking"]);
    });

    it("there is no Take payment: it has no page of its own to open", () => {
        expect(QUICK_ACTIONS.some((a) => /take payment/i.test(a.label))).toBe(
            false,
        );
    });

    it("says code, never discount, for the thing made", () => {
        expect(QUICK_ACTIONS.map((a) => a.label)).not.toContain("New discount");
    });
});

describe("quickActionsFor", () => {
    it.each([
        ["a Member", MEMBER],
        ["a calendar-only person", CALENDAR_ONLY],
        ["a location's own people", STOREFRONT_TEAM],
    ])("offers %s nothing it can't make", (_, actions) => {
        // A calendar-only person books (`booking:write`): New booking alone.
        expect(labels(actions)).toEqual(
            actions.includes("booking:write") ? ["New booking"] : [],
        );
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
        // Invoicing needs no module (DEC-070), and a customer is a
        // contact, whatever is switched on.
        expect(offered).toEqual([
            "New booking",
            "New customer",
            "New service",
            "New invoice",
        ]);
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

/*
 * Home's New menu (DEC-171, plan U5, A17): the three daily starts, by the
 * permissions the API resolved, never by the role's name.
 */
describe("Home's New menu", () => {
    /** `organization-policy.ts`: an Owner and an Admin hold every start. */
    const OWNER = [...MEMBER, "order:create", "invoice:write", "booking:write"];
    const ADMIN = OWNER;
    /** A Member: the floor, the kitchen and the front desk (DEC-170). */
    const MEMBER_NOW = [...MEMBER, "booking:write", "hours:write"];
    const REVIEWER = ["site:read", "site:comment", "site:approve"];
    /** A role the business made: the till and the bills, no diary. */
    const TILL = [...MEMBER, "order:create", "invoice:write"];

    const offered = (
        actions: readonly string[] | null,
        moduleKeys: readonly string[] | null = EVERY_MODULE,
    ) => homeNewFor({ moduleKeys, actions });
    const labelsOf = (actions: readonly string[] | null) =>
        offered(actions).items.map((i) => i.label);

    it("is three quick actions, in the board's words and order", () => {
        expect(HOME_NEW.map((r) => [r.label, r.hint])).toEqual([
            ["Take an order", "In the shop or on the phone"],
            ["Book someone", "A class, a visit or a time"],
            ["Send an invoice", "For a client or a trade customer"],
        ]);
        for (const row of HOME_NEW) {
            const quick = QUICK_ACTIONS.find((a) => a.href === row.href);
            expect(quick, row.label).toBeDefined();
            expect(quick?.action).toBe(row.action);
            expect(quick?.moduleKey).toBe(row.moduleKey);
        }
    });

    it("opens each flow where it lives, never a page of its own", () => {
        expect(HOME_NEW.map((r) => r.href)).toEqual([
            "/commerce/orders?new=1",
            "/bookings?new=1",
            "/billing/invoices/new",
        ]);
    });

    it("offers an Owner all three, and says nothing about the role", () => {
        expect(offered(OWNER)).toEqual({
            items: HOME_NEW.map(({ key, href, label, hint }) => ({
                key,
                href,
                label,
                hint,
            })),
            roleLine: null,
        });
    });

    it("offers an Admin all three", () => {
        expect(labelsOf(ADMIN)).toEqual([
            "Take an order",
            "Book someone",
            "Send an invoice",
        ]);
        expect(offered(ADMIN).roleLine).toBeNull();
    });

    it("offers a Member Book someone, and names the other two once", () => {
        // The rail's role mirror has no booking:write for a Member; the
        // API does (DEC-170). The menu follows the API.
        const member = offered(MEMBER_NOW);
        expect(member.items.map((i) => i.label)).toEqual(["Book someone"]);
        expect(member.roleLine).toBe(
            "Taking orders and sending invoices aren't part of your role. An owner or admin can change this in Settings › Team.",
        );
    });

    it("offers a Reviewer nothing, so no New is drawn and nothing is said", () => {
        expect(offered(REVIEWER)).toEqual({ items: [], roleLine: null });
    });

    it("offers a role the business made what was ticked, and names the rest", () => {
        const till = offered(TILL);
        expect(till.items.map((i) => i.label)).toEqual([
            "Take an order",
            "Send an invoice",
        ]);
        expect(till.roleLine).toBe(
            "Booking people isn't part of your role. An owner or admin can change this in Settings › Team.",
        );
        expect(labelsOf(CALENDAR_ONLY)).toEqual(["Book someone"]);
        expect(labelsOf(STOREFRONT_TEAM)).toEqual([]);
    });

    it("never judges by the role's name: no permissions loaded offers nothing", () => {
        expect(offered(null)).toEqual({ items: [], roleLine: null });
    });

    it("leaves out a start whose module is off, and doesn't name it", () => {
        const noShop = offered(MEMBER_NOW, ["APPOINTMENTS"]);
        expect(noShop.items.map((i) => i.label)).toEqual(["Book someone"]);
        // Invoicing needs no module (DEC-070), so it is still named.
        expect(noShop.roleLine).toBe(
            "Sending invoices isn't part of your role. An owner or admin can change this in Settings › Team.",
        );
        expect(offered(OWNER, ["COMMERCE"]).items.map((i) => i.label)).toEqual([
            "Take an order",
            "Send an invoice",
        ]);
        expect(offered(OWNER, []).items.map((i) => i.label)).toEqual([
            "Send an invoice",
        ]);
    });

    it("offers by permission alone while the modules aren't known", () => {
        expect(offered(OWNER, null).items).toHaveLength(3);
    });
});
