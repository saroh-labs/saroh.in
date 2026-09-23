import { describe, expect, it } from "vitest";

import { navFor } from "@/components/shared/nav-items";

import {
    buildMobileNav,
    seatPreference,
    TAB_SEATS,
    WORKSPACE_HEADING,
} from "./mobile-nav";

/**
 * The phone's tab bar and its sheet (the "Saroh Tab Bar" design). Built from
 * `navFor`, as the rail is, so each test starts from what an actor is offered
 * there.
 */

const EVERYTHING = [
    "WEBSITE",
    "CRM",
    "APPOINTMENTS",
    "COURSES",
    "COMMERCE",
    "PAYMENTS",
    "INSIGHTS",
];

const ownerNav = (moduleKeys: string[] | null = EVERYTHING) =>
    navFor({ role: "OWNER", moduleKeys });

const labels = (tabs: { label: string }[]) => tabs.map((t) => t.label);

describe("seats", () => {
    it("seats Home, Sell, Notifications and Insights by default", () => {
        const nav = buildMobileNav({ groups: ownerNav(), pathname: "/" });
        expect(labels(nav.tabs)).toEqual([
            "Home",
            "Sell",
            "Notifications",
            "Insights",
        ]);
        expect(nav.tabs).toHaveLength(TAB_SEATS);
    });

    it("gives the section you are in the second seat", () => {
        const nav = buildMobileNav({
            groups: ownerNav(),
            pathname: "/billing/invoices/inv_1",
        });
        expect(labels(nav.tabs)).toEqual([
            "Home",
            "Payments",
            "Sell",
            "Notifications",
        ]);
    });

    it("keeps Sell seated when you are in it, without seating it twice", () => {
        expect(seatPreference("Sell")).toEqual([
            "Home",
            "Sell",
            "Calendar",
            "Notifications",
        ]);
        const nav = buildMobileNav({
            groups: ownerNav(),
            pathname: "/commerce/orders",
        });
        const tabs = labels(nav.tabs);
        expect(tabs.slice(0, 2)).toEqual(["Home", "Sell"]);
        expect(new Set(tabs).size).toBe(tabs.length);
        // No Home › Calendar yet, so its seat falls through to rail order.
        expect(tabs).toHaveLength(TAB_SEATS);
    });

    it("fills a seat the preference cannot, in rail order, skipping sections", () => {
        // A member has no Notifications and no Insights here.
        const nav = buildMobileNav({
            groups: navFor({
                role: "MEMBER",
                moduleKeys: ["WEBSITE", "APPOINTMENTS", "CRM", "COMMERCE"],
            }),
            pathname: "/",
        });
        expect(labels(nav.tabs)).toEqual([
            "Home",
            "Sell",
            "Website",
            "Contacts",
        ]);
    });

    it("lets a section tab open its first page", () => {
        const nav = buildMobileNav({ groups: ownerNav(), pathname: "/" });
        const sell = nav.tabs.find((t) => t.label === "Sell");
        expect(sell?.section).toBe(true);
        expect(sell?.href).toBe("/commerce/orders");
        // A Member reads no orders: Sell opens on Products for them.
        const member = buildMobileNav({
            groups: navFor({ role: "MEMBER", moduleKeys: ["COMMERCE"] }),
            pathname: "/",
        });
        expect(member.tabs.find((t) => t.label === "Sell")?.href).toBe(
            "/commerce/products",
        );
    });

    it("gives a reviewer their two rows and no More", () => {
        const nav = buildMobileNav({
            groups: navFor({ role: "REVIEWER", moduleKeys: ["WEBSITE"] }),
            pathname: "/sites",
        });
        expect(labels(nav.tabs)).toEqual(["Home", "Website"]);
        expect(nav.more).toBeNull();
        expect(nav.groups).toEqual([]);
    });
});

describe("the sheet", () => {
    it("lists every section, seated or not, then Workspace", () => {
        const nav = buildMobileNav({ groups: ownerNav(), pathname: "/" });
        expect(nav.groups.map((g) => g.label)).toEqual([
            "Sell",
            "Bookings",
            "Payments",
            WORKSPACE_HEADING,
        ]);
        const sell = nav.groups.find((g) => g.label === "Sell");
        expect(sell?.rows.map((r) => r.href)).toContain("/commerce/orders");
    });

    it("draws a section's pages with the section's icon", () => {
        const groups = ownerNav();
        const bookingsIcon = groups
            .flatMap((g) => g.items)
            .find((i) => i.label === "Bookings")?.icon;
        const nav = buildMobileNav({ groups, pathname: "/" });
        const bookings = nav.groups.find((g) => g.label === "Bookings");
        expect(bookings?.rows.map((r) => r.label)).toEqual([
            "Calendar",
            "Services",
            "Courses",
            "Class packs",
        ]);
        for (const row of bookings?.rows ?? []) {
            expect(row.icon).toBe(bookingsIcon);
        }
    });

    it("puts under Workspace only the plain rows without a seat, each with its own icon", () => {
        const groups = ownerNav();
        const nav = buildMobileNav({ groups, pathname: "/" });
        const workspace = nav.groups.find(
            (g) => g.label === WORKSPACE_HEADING,
        );
        const rowLabels = workspace?.rows.map((r) => r.label) ?? [];
        expect(rowLabels).toContain("Website");
        expect(rowLabels).toContain("Team");
        for (const seated of labels(nav.tabs)) {
            expect(rowLabels).not.toContain(seated);
        }
        const team = groups
            .flatMap((g) => g.items)
            .find((i) => i.label === "Team");
        expect(workspace?.rows.find((r) => r.label === "Team")?.icon).toBe(
            team?.icon,
        );
    });

    it("says how many tabs the bar holds", () => {
        const nav = buildMobileNav({ groups: ownerNav(), pathname: "/" });
        expect(nav.note).toBe(
            "Everything a role reaches is here. The bar holds the 4 opened most.",
        );
    });

    it("hides a page whose module is off, and a section left with none", () => {
        const nav = buildMobileNav({
            groups: ownerNav(["COMMERCE", "COURSES"]),
            pathname: "/",
        });
        const bookings = nav.groups.find((g) => g.label === "Bookings");
        expect(bookings?.rows.map((r) => r.href)).toEqual(["/courses"]);
        expect(nav.groups.map((g) => g.label)).not.toContain("Payments");
    });
});

describe("where you are", () => {
    it("marks the section's tab and the page's row", () => {
        const nav = buildMobileNav({
            groups: ownerNav(),
            pathname: "/services",
        });
        const current = nav.tabs.filter((t) => t.current);
        expect(labels(current)).toEqual(["Bookings"]);
        const rows = nav.groups.flatMap((g) => g.rows).filter((r) => r.current);
        expect(rows.map((r) => r.href)).toEqual(["/services"]);
    });

    it("marks only the deepest page", () => {
        const nav = buildMobileNav({
            groups: ownerNav(),
            pathname: "/bookings",
        });
        const rows = nav.groups.flatMap((g) => g.rows).filter((r) => r.current);
        expect(rows.map((r) => r.label)).toEqual(["Calendar"]);
    });

    it("marks Home only on Home", () => {
        const nav = buildMobileNav({
            groups: ownerNav(),
            pathname: "/analytics",
        });
        expect(labels(nav.tabs.filter((t) => t.current))).toEqual([
            "Insights",
        ]);
    });
});

describe("counts", () => {
    it("badges a tab with what is waiting, and a section with its pages' sum", () => {
        const nav = buildMobileNav({
            groups: ownerNav(),
            pathname: "/",
            counts: { "/commerce/orders": 3, "/commerce/products": 1 },
            unread: 5,
        });
        expect(nav.tabs.find((t) => t.label === "Sell")?.count).toBe(4);
        expect(nav.tabs.find((t) => t.label === "Notifications")?.count).toBe(
            5,
        );
    });

    it("sums on More what is waiting only in the sheet", () => {
        const nav = buildMobileNav({
            groups: ownerNav(),
            pathname: "/",
            // Orders is seated with Sell; Leads and Invoices are not.
            counts: {
                "/commerce/orders": 3,
                "/leads": 2,
                "/billing/invoices": 4,
            },
        });
        expect(nav.more?.count).toBe(6);
        const orders = nav.groups
            .flatMap((g) => g.rows)
            .find((r) => r.href === "/commerce/orders");
        expect(orders?.count).toBe(3);
    });
});
