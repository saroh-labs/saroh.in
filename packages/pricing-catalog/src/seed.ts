// A SAMPLE catalogue for development, tests and the seed. These are not
// Saroh's prices or limits: those live only in the database, entered and
// published through the admin console's Plans screen. The numbers here are
// made up, in the same shape (Free, Grow and Pro, amounts in paise, the plan
// shape decided on 5 Oct 2026), with Pro's limits set high so no seeded demo
// business ever meets one.
//
// Exported only through `@saroh/pricing-catalog/seed`, never the package root.

import type { Catalog, CatalogInput } from "./schema";
import { parseCatalog } from "./schema";

const C = (
    text: string,
    card = "",
    limit: number | null = null,
    per: "" | "month" = "",
    soft = false,
) => ({
    inc: true as const,
    text,
    card,
    limit,
    per,
    soft,
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
            tagline: "For one place that sells, books and bills.",
            cta: "Choose Grow",
            featured: true,
            retired: false,
            trial: { on: true, days: 30 },
        },
        {
            id: "pro",
            name: "Pro",
            pricePaise: 60_000,
            tagline: "For a business with more than one place.",
            cta: "Choose Pro",
            featured: false,
            retired: false,
            trial: { on: true, days: 30 },
        },
    ],
    groups: [
        { id: "site", name: "Your site" },
        { id: "selling", name: "Selling" },
        { id: "money", name: "Money" },
        { id: "team", name: "Team" },
        { id: "usage", name: "Space and traffic" },
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
                free: C("On name.saroh.app", "One website"),
                grow: C(
                    "On your own domain",
                    "Your website on your own domain",
                ),
                pro: C(
                    "On your own domains",
                    "Your websites on your own domains",
                ),
            },
        },
        {
            id: "sites",
            name: "Websites",
            group: "site",
            pricing: "show",
            what: "How many websites the business can run.",
            cells: {
                free: C("1", "", 1),
                grow: C("1", "", 1),
                pro: C("Up to 30", "Up to 30 websites", 30),
            },
        },
        {
            id: "locations",
            name: "Places customers visit",
            group: "selling",
            pricing: "show",
            what: "Shops, studios or clinics with an address. Each one's online shop comes with it.",
            cells: {
                free: C("1, plus your online shop", "", 1),
                grow: C("1, plus your online shop", "", 1),
                pro: C(
                    "Up to 30, each with its online shop",
                    "Up to 30 places",
                    30,
                ),
            },
        },
        {
            id: "themes",
            name: "Themes, fonts and templates",
            group: "site",
            pricing: "hidden",
            what: "Change the site's theme and fonts, or pick another template.",
            cells: { free: X("hidden"), grow: X("hidden"), pro: X("hidden") },
        },
        {
            id: "review",
            name: "Required approval before changes go live",
            group: "site",
            pricing: "hidden",
            what: "Changes to the site wait for a teammate's approval before they go live.",
            cells: { free: X("hidden"), grow: X("hidden"), pro: X("hidden") },
        },
        {
            id: "blog",
            name: "Blog posts",
            group: "site",
            pricing: "show",
            what: "Posts on your site's journal.",
            cells: {
                free: C("3", "3 blog posts", 3),
                grow: C("No limit", ""),
                pro: C("No limit", ""),
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
                pro: C("20,000", "20,000 products", 20000),
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
                    "Up to 8 a month, at the counter",
                    "Up to 8 orders a month",
                    8,
                    "month",
                ),
                grow: C("No monthly cap", "Orders with no monthly cap"),
                pro: C("No monthly cap", "Orders with no monthly cap"),
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
                    "Up to 8 bookings a month",
                    8,
                    "month",
                ),
                grow: C("No monthly cap", "Bookings with no monthly cap"),
                pro: C("No monthly cap", "Bookings with no monthly cap"),
            },
        },
        {
            id: "reviews",
            name: "Product reviews",
            group: "selling",
            pricing: "show",
            what: "Customers who bought something are invited to review it.",
            cells: {
                free: C("Included"),
                grow: C("Included"),
                pro: C("Included"),
            },
        },
        {
            id: "payments",
            name: "Online payments",
            group: "money",
            pricing: "show",
            what: "Customers pay online through your own Razorpay or Cashfree account. The money goes straight to you.",
            cells: {
                free: X("locked"),
                grow: C("Included", "Online payments to your own account"),
                pro: C("Included", "Online payments to your own account"),
            },
        },
        {
            id: "subscriptions",
            name: "Memberships that renew",
            group: "money",
            pricing: "show",
            what: "Plans and memberships that renew themselves.",
            cells: {
                free: X("locked"),
                grow: C("Included", "Memberships that renew"),
                pro: C("Included", "Memberships that renew"),
            },
        },
        {
            id: "invoicing",
            name: "Invoices and GST",
            group: "money",
            pricing: "show",
            menu: "paymentsx",
            what: "GST tax invoices and bills of supply, numbered for you.",
            cells: {
                free: C("Made by hand; orders invoiced for you"),
                grow: C("Made for you: orders, renewals, packs and courses"),
                pro: C("Made for you: orders, renewals, packs and courses"),
            },
        },
        {
            id: "members",
            name: "Team members",
            group: "team",
            pricing: "show",
            what: "People who sign in to your dashboard. Everyone on your calendar is one. Reviewers are free.",
            cells: {
                free: C("2", "2 team members", 2),
                grow: C("4", "4 team members", 4),
                pro: C("200", "200 team members", 200),
            },
        },
        {
            id: "reviewers",
            name: "Reviewers",
            group: "team",
            pricing: "show",
            what: "People who only approve your website's pages. They use no team seat.",
            cells: {
                free: C("1", "", 1),
                grow: C("3", "", 3),
                pro: C("100", "", 100),
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
                grow: C("Included", "Custom roles"),
                pro: C("Included", "Custom roles"),
            },
        },
        {
            id: "storage",
            name: "Photos and videos",
            group: "usage",
            pricing: "show",
            what: "Space for your media. Nothing is blocked past it; we get in touch.",
            cells: {
                free: C("1 GB", "", 1, "", true),
                grow: C("4 GB", "", 4, "", true),
                pro: C("500 GB", "", 500, "", true),
            },
        },
        {
            id: "visits",
            name: "Site visits",
            group: "usage",
            pricing: "show",
            what: "Visits to your site in a month. Your site never goes down; past it, we get in touch.",
            cells: {
                free: C("3,000 a month", "", 3000, "month", true),
                grow: C("40,000 a month", "", 40000, "month", true),
                pro: C("90,00,000 a month", "", 9000000, "month", true),
            },
        },
        {
            id: "integrations",
            name: "Third-party connections",
            group: "team",
            pricing: "hidden",
            what: "Connections to other tools.",
            cells: { free: X("hidden"), grow: X("hidden"), pro: X("hidden") },
        },
    ],
    yearly: { on: true, paid: 10 },
    gst: { show: "excl" },
    addons: [],
};

/** Version 1, validated. */
export const SEED_CATALOG: Catalog = parseCatalog(input);
