import { describe, expect, it } from "vitest";

import { navFor } from "@/components/shared/navigation/nav-items";

import { buildMobileNav, TAB_SEATS } from "./mobile-nav";

/**
 * The phone's tab bar and its sheet (the "Saroh Tab Bar" design, DEC-263).
 * Built from `navFor`, as the rail is, so each test starts from what an
 * actor is offered there.
 */

const EVERYTHING = [
    "WEBSITE",
    "CRM",
    "APPOINTMENTS",
    "COURSES",
    "CLASS_PACKS",
    "COMMERCE",
    "PAYMENTS",
    "INSIGHTS",
];

const ownerNav = (moduleKeys: string[] | null = EVERYTHING) =>
    navFor({ role: "OWNER", moduleKeys });

const labels = (tabs: { label: string }[]) => tabs.map((t) => t.label);

describe("seats", () => {
    it("seats Home, Calendar, Orders and Insights, in the rail's order", () => {
        const nav = buildMobileNav({ groups: ownerNav(), pathname: "/" });
        expect(labels(nav.tabs)).toEqual([
            "Home",
            "Calendar",
            "Orders",
            "Insights",
        ]);
        expect(nav.tabs).toHaveLength(TAB_SEATS);
    });

    it("keeps one order on every page (DEC-263)", () => {
        for (const pathname of [
            "/",
            "/billing/invoices/inv_1",
            "/commerce/orders",
            "/calendar",
            "/services",
            "/settings/people",
        ]) {
            const nav = buildMobileNav({ groups: ownerNav(), pathname });
            expect(labels(nav.tabs)).toEqual([
                "Home",
                "Calendar",
                "Orders",
                "Insights",
            ]);
        }
    });

    it("leaves out a tab a gate removes, and the rest keep their order", () => {
        // Sell off: no Orders. Its seat goes to the rail's next row, and
        // the bar is still drawn in the rail's order.
        const nav = buildMobileNav({
            groups: ownerNav(EVERYTHING.filter((k) => k !== "COMMERCE")),
            pathname: "/bookings",
        });
        expect(labels(nav.tabs)).toEqual([
            "Home",
            "Calendar",
            "Bookings",
            "Insights",
        ]);
    });

    it("puts Invoices in More with Payments off, marked while you're on it (DEC-070)", () => {
        const withoutPayments = EVERYTHING.filter((k) => k !== "PAYMENTS");
        const home = buildMobileNav({
            groups: ownerNav(withoutPayments),
            pathname: "/",
        });
        expect(labels(home.tabs)).not.toContain("Invoices");
        const money = home.groups.find((g) => g.label === "Money");
        expect(money?.rows.map((r) => r.href)).toEqual(["/billing/invoices"]);
        const on = buildMobileNav({
            groups: ownerNav(withoutPayments),
            pathname: "/billing/invoices/inv_1",
        });
        const row = on.groups
            .flatMap((g) => g.rows)
            .find((r) => r.href === "/billing/invoices");
        expect(row?.current).toBe(true);
    });

    it("fills a seat the preference cannot, in rail order", () => {
        // A member has no Insights here.
        const nav = buildMobileNav({
            groups: navFor({
                role: "MEMBER",
                moduleKeys: ["WEBSITE", "APPOINTMENTS", "CRM", "COMMERCE"],
            }),
            pathname: "/",
        });
        expect(labels(nav.tabs)).toEqual([
            "Home",
            "Calendar",
            "Orders",
            "Bookings",
        ]);
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
    it("lists the rail's groups in its order, without the seated rows", () => {
        const nav = buildMobileNav({ groups: ownerNav(), pathname: "/" });
        expect(nav.groups.map((g) => g.label)).toEqual([
            "Today",
            "People",
            "Money",
            "What you offer",
            "Online",
            "Setup",
        ]);
        expect(
            nav.groups
                .find((g) => g.label === "Today")
                ?.rows.map((r) => r.label),
        ).toEqual(["Bookings"]);
        const all = nav.groups.flatMap((g) => g.rows.map((r) => r.label));
        for (const seated of [
            "Home",
            "Business calendar",
            "Orders",
            "Insights",
        ]) {
            expect(all).not.toContain(seated);
        }
    });

    it("draws each row with its own icon", () => {
        const groups = ownerNav();
        const nav = buildMobileNav({ groups, pathname: "/" });
        const settings = groups
            .flatMap((g) => g.items)
            .find((i) => i.label === "Settings");
        const row = nav.groups
            .find((g) => g.label === "Setup")
            ?.rows.find((r) => r.label === "Settings");
        expect(row?.icon).toBe(settings?.icon);
    });

    it("says how many tabs the bar holds", () => {
        const nav = buildMobileNav({ groups: ownerNav(), pathname: "/" });
        expect(nav.note).toBe(
            "Everything a role reaches is here. The bar holds the 4 opened most.",
        );
    });
});

describe("where you are", () => {
    it("marks the row you are on", () => {
        const nav = buildMobileNav({
            groups: ownerNav(),
            pathname: "/services",
        });
        expect(labels(nav.tabs.filter((t) => t.current))).toEqual([]);
        const rows = nav.groups.flatMap((g) => g.rows).filter((r) => r.current);
        expect(rows.map((r) => r.href)).toEqual(["/services"]);
    });

    it("marks only the deepest row: Hours and time off, not Bookings", () => {
        const nav = buildMobileNav({
            groups: ownerNav(),
            pathname: "/bookings/availability",
        });
        const rows = nav.groups.flatMap((g) => g.rows).filter((r) => r.current);
        expect(rows.map((r) => r.label)).toEqual(["Hours and time off"]);
    });

    it("marks Home only on Home", () => {
        const nav = buildMobileNav({
            groups: ownerNav(),
            pathname: "/analytics",
        });
        expect(labels(nav.tabs.filter((t) => t.current))).toEqual(["Insights"]);
    });
});

describe("counts", () => {
    it("badges a tab with what is waiting", () => {
        const nav = buildMobileNav({
            groups: ownerNav(),
            pathname: "/",
            counts: { "/commerce/orders": 3, "/commerce/products": 1 },
            unread: 5,
        });
        expect(nav.tabs.find((t) => t.label === "Orders")?.count).toBe(3);
        // Unread rides on the top bar's bell, not on a tab.
        expect(
            nav.tabs.find((t) => t.label === "Notifications"),
        ).toBeUndefined();
    });

    it("sums on More what is waiting only in the sheet", () => {
        const nav = buildMobileNav({
            groups: ownerNav(),
            pathname: "/",
            counts: {
                "/commerce/orders": 3,
                "/leads": 2,
                "/billing/invoices": 4,
            },
        });
        expect(nav.more?.count).toBe(6);
    });
});
