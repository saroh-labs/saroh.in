// INTERNAL — strip before this branch leaves local. Prices and limits are not public.
//
// The first published catalogue (version 1): the design's Free, Grow and Pro
// from `saroh-catalog.js` DEFAULT, with the admin screen's offer defaults
// (yearly off at "pay for 10", prices shown before GST, no trials, no
// add-ons). Amounts are paise. This file is the only place the real
// catalogue lives: the migration creates empty tables, and version 1 is
// written from here (`writeCatalogueVersion` in @saroh/database).
//
// Exported only through `@saroh/pricing-catalog/seed`, never the package
// root, so stripping this file removes every real number at once.

import type { Catalog, CatalogInput } from "./schema";
import { parseCatalog } from "./schema";

const C = (
    text: string,
    card = "",
    limit: number | null = null,
    per: "" | "month" = "",
) => ({
    inc: true as const,
    text,
    card,
    limit,
    per,
});
const X = (off: "locked" | "hidden" = "locked") => ({
    inc: false as const,
    off,
});

export const SEED_VERSION = 1;
export const SEED_NOTE = "First published pricing: Free, Grow and Pro.";

const input: CatalogInput = {
    plans: [
        {
            id: "free",
            name: "Free",
            pricePaise: 0,
            tagline: "For getting your business online.",
            cta: "Start free",
            featured: false,
            retired: false,
        },
        {
            id: "grow",
            name: "Grow",
            pricePaise: 100_000,
            tagline: "For a business that sells, books and bills.",
            cta: "Choose Grow",
            featured: true,
            retired: false,
        },
        {
            id: "pro",
            name: "Pro",
            pricePaise: 500_000,
            tagline: "For your own look and a bigger team.",
            cta: "Choose Pro",
            featured: false,
            retired: false,
        },
    ],
    groups: [
        { id: "site", name: "Your site" },
        { id: "selling", name: "Selling" },
        { id: "money", name: "Money" },
        { id: "team", name: "Team" },
        { id: "connect", name: "Connections" },
    ],
    modules: [
        {
            id: "website",
            name: "Website",
            group: "site",
            pricing: "show",
            menu: "website",
            what: "Your site, with its pages and booking page.",
            cells: {
                free: C("1 site", "One website"),
                grow: C(
                    "1 site on your own domain",
                    "Your website on your own domain",
                ),
                pro: C(
                    "1 site on your own domain",
                    "Your website on your own domain",
                ),
            },
        },
        {
            id: "themes",
            name: "Themes, fonts and templates",
            group: "site",
            pricing: "show",
            what: "Change the site's theme and fonts, or pick another template.",
            cells: {
                free: X("hidden"),
                grow: X("hidden"),
                pro: C(
                    "Change the theme and fonts, or pick another template",
                    "Change your site's theme and fonts, or pick another template",
                ),
            },
        },
        {
            id: "review",
            name: "Review changes with your team",
            group: "site",
            pricing: "show",
            what: "Changes to the site wait for a teammate's review before they go live.",
            cells: {
                free: X("hidden"),
                grow: X("hidden"),
                pro: C(
                    "Included",
                    "Review changes with your team before they go live",
                ),
            },
        },
        {
            id: "blog",
            name: "Blog posts",
            group: "site",
            pricing: "show",
            what: "Posts on your site's journal.",
            cells: {
                free: C("5", "5 blog posts", 5),
                grow: C("50", "50 blog posts", 50),
                pro: C("Included", "Blog posts, no limit"),
            },
        },
        {
            id: "products",
            name: "Products",
            group: "selling",
            pricing: "show",
            menu: "sell",
            child: "Products",
            what: "Everything you sell, with sizes, prices and stock.",
            cells: {
                free: C("5", "5 products", 5),
                grow: C("100", "100 products", 100),
                pro: C("1,000", "1,000 products", 1000),
            },
        },
        {
            id: "orders",
            name: "Orders",
            group: "selling",
            pricing: "show",
            menu: "sell",
            child: "Orders",
            what: "Every order from your site and the counter, in one list.",
            cells: {
                free: C(
                    "Up to 10 a month, paid offline",
                    "Up to 10 orders a month, paid offline",
                    10,
                    "month",
                ),
                grow: C("Included", "Orders, paid online or offline"),
                pro: C("Included", "Orders, paid online or offline"),
            },
        },
        {
            id: "subscriptions",
            name: "Subscriptions",
            group: "selling",
            pricing: "show",
            what: "Plans and memberships that renew themselves.",
            cells: {
                free: X("locked"),
                grow: C("Included", "Subscriptions"),
                pro: C("Included", "Subscriptions"),
            },
        },
        {
            id: "bookings",
            name: "Bookings and appointments",
            group: "selling",
            pricing: "show",
            menu: "bookingsx",
            what: "Classes, sessions and appointments customers book themselves.",
            cells: {
                free: C(
                    "Up to 10 a month",
                    "Up to 10 bookings and appointments a month",
                    10,
                    "month",
                ),
                grow: C("Included", "Bookings and appointments"),
                pro: C("Included", "Bookings and appointments"),
            },
        },
        {
            id: "invoicing",
            name: "Billing and invoicing",
            group: "money",
            pricing: "show",
            menu: "paymentsx",
            what: "Payments, GST invoices and bills of supply, made for you.",
            cells: {
                free: X("locked"),
                grow: C("Included", "Billing and invoicing"),
                pro: C("Included", "Billing and invoicing"),
            },
        },
        {
            id: "members",
            name: "Team members",
            group: "team",
            pricing: "show",
            what: "People who can sign in to your dashboard.",
            cells: {
                free: C("1", "1 team member", 1),
                grow: C("3", "3 team members", 3),
                pro: C("10", "10 team members", 10),
            },
        },
        {
            id: "roles",
            name: "Custom roles",
            group: "team",
            pricing: "show",
            what: "Roles you define, beyond Owner, Admin, Member and Reviewer.",
            cells: {
                free: X("hidden"),
                grow: X("hidden"),
                pro: C("Included", "Custom roles"),
            },
        },
        {
            id: "integrations",
            name: "Third-party integrations",
            group: "connect",
            pricing: "show",
            what: "Connections to other tools.",
            cells: {
                free: X("hidden"),
                grow: C("Up to 5", "Up to 5 third-party connections", 5),
                pro: C("Up to 50", "Up to 50 third-party connections", 50),
            },
        },
    ],
    yearly: { on: false, paid: 10 },
    gst: { show: "excl" },
    addons: [],
};

/** Version 1, validated. */
export const SEED_CATALOG: Catalog = parseCatalog(input);
