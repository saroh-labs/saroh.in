// A SAMPLE catalogue for development, tests and the seed. These are not
// Saroh's prices or limits: those live only in the database, entered and
// published through the admin console's Plans screen. The numbers here are
// made up, in the same shape (Free, Grow and Pro, amounts in paise), with
// Pro's limits set high so no seeded demo business ever meets one.
//
// Exported only through `@saroh/pricing-catalog/seed`, never the package root.

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
export const SEED_NOTE = "Sample catalogue for development and tests.";

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
            pricePaise: 20_000,
            tagline: "For a business that sells, books and bills.",
            cta: "Choose Grow",
            featured: true,
            retired: false,
        },
        {
            id: "pro",
            name: "Pro",
            pricePaise: 60_000,
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
                free: C("3", "3 blog posts", 3),
                grow: C("30", "30 blog posts", 30),
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
                free: C("3", "3 products", 3),
                grow: C("60", "60 products", 60),
                pro: C("2,000", "2,000 products", 2000),
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
                    "Up to 8 a month, paid offline",
                    "Up to 8 orders a month, paid offline",
                    8,
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
                    "Up to 8 a month",
                    "Up to 8 bookings and appointments a month",
                    8,
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
                grow: C("2", "2 team members", 2),
                pro: C("20", "20 team members", 20),
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
                grow: C("Up to 3", "Up to 3 third-party connections", 3),
                pro: C("Up to 100", "Up to 100 third-party connections", 100),
            },
        },
    ],
    yearly: { on: false, paid: 10 },
    gst: { show: "excl" },
    addons: [],
};

/** Version 1, validated. */
export const SEED_CATALOG: Catalog = parseCatalog(input);
