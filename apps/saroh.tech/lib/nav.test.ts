import { describe, expect, it } from "vitest";

import {
    FEATURES,
    FOOTER_COLUMNS,
    LEGAL_LINKS,
    MENUS,
    SOLUTIONS,
    TEMPLATES,
} from "./nav";
import { sectionOf } from "./nav-section";
import { PAGES } from "./site-map";

/** Linked but not built yet. None now: a new link adds its page in the same change. */
const PENDING = new Set<string>();

const menuLinks = [
    ...MENUS.features,
    ...MENUS.solutions,
    ...MENUS.resources,
    ...MENUS.tools,
    ...MENUS.templates,
    MENUS.allTools,
    MENUS.allTemplates,
];
const allLinks = [
    ...menuLinks,
    ...FOOTER_COLUMNS.flatMap((c) => c.links),
    ...LEGAL_LINKS,
];

describe("the nav", () => {
    it("has saroh.in's nine features and four solutions, in its order", () => {
        expect(FEATURES.map((f) => f.href.split("/").pop())).toEqual([
            "dashboard",
            "products",
            "orders",
            "customers",
            "bookings",
            "subscriptions",
            "billing",
            "website",
            "insights",
        ]);
        expect(SOLUTIONS.map((s) => s.href.split("/").pop())).toEqual([
            "shops",
            "salons",
            "gyms",
            "clinics",
        ]);
    });

    it("links only to pages of the site, or to ones named as still coming", () => {
        const paths = new Set(PAGES.map((p) => p.path));
        for (const { href } of allLinks) {
            expect(paths.has(href) || PENDING.has(href), href).toBe(true);
        }
        for (const href of PENDING) {
            expect(paths.has(href), `${href} is built now`).toBe(false);
        }
    });

    it("has no compare or referral page, in the site map or a menu", () => {
        const gone = /^\/(compare|referral)/;
        expect(allLinks.filter((l) => gone.test(l.href))).toEqual([]);
        expect(PAGES.filter((p) => gone.test(p.path))).toEqual([]);
    });

    it("groups Templates as documents, countries and six trades", () => {
        const count = (group: string) =>
            TEMPLATES.filter((t) => t.group === group).length;
        expect([
            count("Documents"),
            count("Countries"),
            count("Trades"),
        ]).toEqual([8, 6, 6]);
    });

    it("marks the section a page is in", () => {
        expect(sectionOf("/features/billing")).toBe("features");
        expect(sectionOf("/solutions/gyms")).toBe("solutions");
        expect(sectionOf("/templates/invoice/uk")).toBe("templates");
        expect(sectionOf("/tools/vat-calculator")).toBe("tools");
        expect(sectionOf("/help/some-task")).toBe("resources");
        expect(sectionOf("/pricing")).toBe("pricing");
        expect(sectionOf("/")).toBeNull();
        expect(sectionOf("/toolsmith")).toBeNull();
    });

    it("names neither payment provider, a price nor an India detail", () => {
        const words = JSON.stringify(
            [...allLinks].filter((l) => !l.href.endsWith("gst-calculator")),
        );
        expect(words).not.toMatch(
            /stripe|paypal|razorpay|cashfree|UPI|GSTIN|GST|India|₹|\$\d/i,
        );
    });
});
