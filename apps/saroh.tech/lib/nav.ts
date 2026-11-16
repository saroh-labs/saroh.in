import { featuresOff } from "@/lib/feature-switches";
import { NEW_FEATURES } from "@saroh/marketing/feature-switches";
import type { MenuLink, NavItem } from "@saroh/marketing/nav-types";

import { featureHref, featureList } from "@/content/features";
import { ALL_TRADES, HUB_GROUPS, HUB_PATH } from "@/content/solutions-hub";
import { COUNTRIES, DOCUMENTS, TRADES } from "@/content/templates";
import { claimsOff } from "@/lib/feature-switches";

/** The site's menus, worked out on the server and handed to the header. */
export interface NavMenus {
    features: NavItem[];
    solutions: NavItem[];
    resources: NavItem[];
    tools: NavItem[];
    templates: NavItem[];
    allTools: MenuLink;
    allTemplates: MenuLink;
}

/** saroh.in's nine and four, in its order, in this site's words. */
export const FEATURES: NavItem[] = featureList.map((f) => ({
    name: f.name,
    line: f.navLine,
    href: featureHref(f.slug),
    // The same "New" tags as saroh.in's (#23).
    isNew: NEW_FEATURES.includes(f.slug),
}));

/**
 * Every trade, in a column per hub group (owner, 16 Nov 2026). No line under
 * a name: with every trade listed, the name says it all.
 */
export const SOLUTIONS: NavItem[] = ALL_TRADES.map((t) => ({
    group: HUB_GROUPS.find((g) => g.id === t.group)?.title,
    name: t.name,
    line: "",
    href: t.href,
}));

/** The footer's trades: a group per hub group, the last ending on the hub. */
/**
 * One Solutions column, as saroh.in's footer has (owner, 16 Nov 2026, #6,
 * #17): each family's first trade, then all of them on /solutions. Six
 * columns of every trade made the footer about 1,430px tall.
 */
const SOLUTIONS_COLUMN = {
    title: "Solutions",
    links: [
        ...HUB_GROUPS.flatMap((g) =>
            SOLUTIONS.filter((s) => s.group === g.title).slice(0, 1),
        ),
        { name: "See all trades", href: HUB_PATH },
    ],
};

const LEARN = "Learn";
const SAROH = "Saroh";

export const RESOURCES: NavItem[] = [
    {
        group: LEARN,
        name: "Guides",
        line: "Plain answers on invoices and getting paid",
        href: "/guides",
    },
    {
        group: LEARN,
        name: "Help",
        line: "Step by step, for setting up and using Saroh",
        href: "/help",
    },
    {
        group: LEARN,
        name: "Changelog",
        line: "What's new in Saroh",
        href: "/changelog",
    },
    // The API and webhooks, while their switch is on (owner, 16 Nov 2026, #13).
    ...(featuresOff().includes("developers")
        ? []
        : [
              {
                  group: LEARN,
                  name: "Developers",
                  line: "The Saroh API and webhooks",
                  href: "/developers",
              },
          ]),
    {
        group: SAROH,
        name: "Integrations",
        line: "What Saroh works with",
        href: "/integrations",
    },
    {
        group: SAROH,
        name: "About",
        line: "Who makes Saroh, and why",
        href: "/about",
    },
    {
        group: SAROH,
        name: "Contact",
        line: "Write to the Saroh team",
        href: "/contact",
    },
];

const MAKE = "Make a document";
const CHASE = "Chase a payment";
const WORK_OUT = "Work out a number";

/** The hub's groups (`app/tools/page.tsx`), built tools only. */
export const TOOLS: NavItem[] = [
    {
        group: MAKE,
        name: "Invoice generator",
        line: "A clean PDF in two minutes",
        href: "/tools/invoice-generator",
    },
    {
        group: MAKE,
        name: "Quote maker",
        line: "A clear price before you start",
        href: "/tools/quote-maker",
    },
    {
        group: MAKE,
        name: "Receipt maker",
        line: "Show a customer they've paid",
        href: "/tools/receipt-maker",
    },
    {
        group: CHASE,
        name: "Payment reminder",
        line: "Friendly, firm or final",
        href: "/tools/payment-reminder",
    },
    {
        group: CHASE,
        name: "Late fee calculator",
        line: "The fee on an overdue invoice",
        href: "/tools/late-fee-calculator",
    },
    {
        group: WORK_OUT,
        name: "VAT calculator",
        line: "Add VAT or take it out",
        href: "/tools/vat-calculator",
    },
    {
        group: WORK_OUT,
        name: "Sales tax calculator",
        line: "For US prices and totals",
        href: "/tools/sales-tax-calculator",
    },
    {
        group: WORK_OUT,
        name: "GST calculator",
        line: "Australia, Canada, NZ, Singapore",
        href: "/tools/gst-calculator",
    },
];

export const ALL_TOOLS: MenuLink = {
    name: "See all free tools",
    href: "/tools",
};

/** The first six are the gallery's most asked-for trades. */
const POPULAR_TRADES = TRADES.slice(0, 6);

export const TEMPLATES: NavItem[] = [
    ...DOCUMENTS.map((d) => ({
        group: "Documents",
        name: d.name,
        line: "",
        href: `/templates/${d.slug}`,
    })),
    ...COUNTRIES.map((c) => ({
        group: "Countries",
        name: c.name,
        line: "",
        href: `/templates/in/${c.slug}`,
    })),
    ...POPULAR_TRADES.map((t) => ({
        group: "Trades",
        name: t.name,
        line: "",
        href: `/templates/for/${t.slug}`,
    })),
];

export const ALL_TEMPLATES: MenuLink = {
    name: "All document templates",
    href: "/templates",
};

export const MENUS: NavMenus = {
    features: FEATURES,
    solutions: SOLUTIONS,
    resources: RESOURCES,
    tools: TOOLS,
    templates: TEMPLATES,
    allTools: ALL_TOOLS,
    allTemplates: ALL_TEMPLATES,
};

/** The nav's own words (the redesign, DEC-221). */
export const NAV_WORDS = {
    solutions: "Solutions",
    /** The Solutions menu's see-all: the /solutions hub. */
    allTrades: "See all trades",
    /** The nav entry for /features (owner, 17 Nov 2026: "Features"). */
    howItWorks: "Features",
    // "Document templates": saroh.in's are website templates (owner, 16 Nov 2026, #1).
    templates: "Document templates",
    pricing: "Pricing",
    resources: "Resources",
    tools: "Tools",
    signIn: "Sign in",
} as const;

/** The Features menu's see-all: the /features page. */
export const HOW_IT_WORKS_ALL: MenuLink = {
    name: "All features",
    href: "/features",
};

/**
 * The footer's Product group, in the LOCKED order (WORLD.md), each only when
 * its page is shown here: no API page on Global yet, and Saroh Social only
 * while its claim is on (DEC-221).
 */
const PRODUCT_ORDER = [
    { name: "Website builder", slug: "website" },
    { name: "Orders", slug: "orders" },
    { name: "Bookings", slug: "bookings" },
    { name: "Billing", slug: "billing" },
    { name: "Share and posts", slug: "social" },
    { name: "Saroh Social", slug: "social", claim: "social-posting" },
    { name: "Ask AI", slug: "ask-ai" },
    { name: "AI apps", slug: "ai-apps" },
] as const;

const shownSlugs = new Set<string>(featureList.map((f) => f.slug));
const claimsHidden = claimsOff();

export const PRODUCT: MenuLink[] = [
    ...PRODUCT_ORDER.filter(
        (p) =>
            shownSlugs.has(p.slug) &&
            !("claim" in p && claimsHidden.includes(p.claim)),
    ).map((p) => ({
        name: p.name,
        href: `${featureHref(p.slug)}${"claim" in p ? "#saroh-social" : ""}`,
    })),
    // Last in the LOCKED order, as on saroh.in: API and webhooks.
    ...(featuresOff().includes("developers")
        ? []
        : [{ name: "API and webhooks", href: "/developers" }]),
];

/**
 * The footer's groups: Product first, then everything else this site links
 * (the features Product doesn't name, the trades by group, tools,
 * templates, resources and Saroh's own pages), folded on a phone.
 */
export const FOOTER_COLUMNS: { title: string; links: MenuLink[] }[] = [
    { title: "Product", links: PRODUCT },
    {
        title: "Also in Saroh",
        links: FEATURES.filter((f) => !PRODUCT.some((p) => p.href === f.href)),
    },
    SOLUTIONS_COLUMN,
    { title: "Tools", links: [...TOOLS.slice(0, 5), ALL_TOOLS] },
    {
        title: NAV_WORDS.templates,
        links: [
            ...TEMPLATES.filter((t) => t.group === "Documents").slice(0, 4),
            ALL_TEMPLATES,
        ],
    },
    {
        title: "Resources",
        links: RESOURCES.filter((r) => r.group === LEARN),
    },
    {
        title: "Saroh",
        links: [
            { name: "Pricing", href: "/pricing" },
            ...RESOURCES.filter((r) => r.group === SAROH),
        ],
    },
];

/** The legal line. Only drafts already published here; no Billing page yet. */
export const LEGAL_LINKS: MenuLink[] = [
    { name: "Bought from a business on Saroh?", href: "/customers" },
    { name: "Terms", href: "/legal/terms" },
    { name: "Privacy", href: "/legal/privacy" },
    { name: "Cookies", href: "/legal/cookies" },
];
