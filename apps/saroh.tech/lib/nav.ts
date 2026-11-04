import type { MenuLink, NavItem } from "@saroh/marketing/nav-types";

import { featureHref, featureList } from "@/content/features";
import { solutionHref, solutionList } from "@/content/solutions";
import { COUNTRIES, DOCUMENTS, TRADES } from "@/content/templates";

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
}));

export const SOLUTIONS: NavItem[] = solutionList.map((s) => ({
    name: s.name,
    line: s.navLine,
    href: solutionHref(s.slug),
}));

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
        line: "Show a client they've paid",
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

export const ALL_TOOLS: MenuLink = { name: "All tools", href: "/tools" };

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
    name: "All templates",
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

/** The footer's columns, in the menus' order, with the Saroh column's own. */
export const FOOTER_COLUMNS: { title: string; links: MenuLink[] }[] = [
    { title: "Features", links: FEATURES },
    { title: "Solutions", links: SOLUTIONS },
    { title: "Tools", links: [...TOOLS.slice(0, 5), ALL_TOOLS] },
    {
        title: "Templates",
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
