import hreflang from "@saroh/edition/hreflang";

import { templateEntries } from "./templates/pages";

import { CHANGELOG, changelogPath } from "@/content/changelog";

import { HELP } from "@/content/help";

/**
 * Every page, as the site map and page-spec boards list them. Title,
 * description and H1 are the specs' own words. An `unreviewed` page is noindex
 * and out of the sitemap. The pricing line
 * names no price until the USD catalogue reads them in (phase 3).
 */
export type PageType =
    | "home"
    | "pricing"
    | "changelog"
    | "about"
    | "referral"
    | "help"
    | "legal"
    | "tools-hub"
    | "tool"
    | "templates"
    | "template"
    | "guides"
    | "guide"
    | "compare"
    | "alternative"
    | "not-found";

export interface SitePage {
    path: string;
    type: PageType;
    title: string;
    description: string;
    h1: string;
    /** Trail above the H1; the page itself is last and has no link. */
    crumb?: { name: string; path?: string }[];
    /** Built, but no person has read it yet: noindex and out of the sitemap. */
    unreviewed?: boolean;
    /** The day the words really changed: the sitemap's lastmod. */
    updated?: string;
}

const under = (name: string, path: string, self: string) => [
    { name: "Home", path: "/" },
    { name, path },
    { name: self },
];

const tool = (
    slug: string,
    name: string,
    title: string,
    description: string,
    h1: string,
): SitePage => ({
    path: `/tools/${slug}`,
    type: "tool",
    title,
    description,
    h1,
    crumb: under("Tools", "/tools", name),
    updated: "2026-11-02",
});

const GUIDES = [
    [
        "how-to-write-an-invoice",
        "How to write an invoice",
        "How to write an invoice: 8 steps and an example | Saroh",
        "Put your details, your client's, the dates, the items, any tax, the total and how to pay. Plus 8 steps, an example and mistakes to avoid.",
    ],
    [
        "quote-vs-estimate",
        "Quote vs estimate",
        "Quote vs estimate: which one to send | Saroh",
        "A quote is a set price. An estimate is your best guess. Plus when to send each one, and an example of both.",
    ],
    [
        "ask-client-for-payment",
        "How to ask a client for payment",
        "How to ask a client for payment: with examples | Saroh",
        "Ask early, ask clearly and make paying easy. Plus four messages you can copy, from a friendly nudge to a final notice.",
    ],
    [
        "payment-terms",
        "Net 30 and other payment terms",
        "Net 30 and other payment terms, explained | Saroh",
        "Net 30 means the invoice is due 30 days after its date. Plus other common terms and how to pick yours.",
    ],
    [
        "charge-a-deposit",
        "How to charge a deposit",
        "How to charge a deposit: what to ask and when | Saroh",
        "Agree it in your quote, ask for it before you start and take it off the final invoice. Plus 5 steps and an example.",
    ],
    [
        "set-your-rate",
        "How to set your freelance rate",
        "How to set your freelance rate: a simple sum | Saroh",
        "Add the pay you need, your costs and tax, then divide by the hours you can really bill. Plus a worked example.",
    ],
    [
        "vat-and-sales-tax-basics",
        "VAT and sales tax basics",
        "VAT and sales tax basics, in plain words | Saroh",
        "VAT is generally charged at each step of a sale, sales tax once at the end. Plus where to find the rules for your country.",
    ],
] as const;

export const ALTERNATIVES = [
    ["invoice-simple", "Invoice Simple"],
    ["joist", "Joist"],
    ["honeybook", "HoneyBook"],
    ["bonsai", "Bonsai"],
    ["invoice2go", "Invoice2go"],
    ["freshbooks", "FreshBooks"],
] as const;

const CONTENT_BUILT = { unreviewed: true, updated: "2026-11-02" };

const legal = (slug: string, name: string, description: string): SitePage => ({
    path: `/legal/${slug}`,
    type: "legal",
    title: `${name} | Saroh`,
    description,
    h1: name,
    crumb: [{ name: "Home", path: "/" }, { name }],
    unreviewed: true,
    updated: "2026-11-02",
});

const hub = (
    path: string,
    type: PageType,
    title: string,
    description: string,
    h1: string,
    name: string,
): SitePage => ({
    path,
    type,
    title,
    description,
    h1,
    crumb: [{ name: "Home", path: "/" }, { name }],
});

export const PAGES: SitePage[] = [
    {
        path: "/",
        type: "home",
        title: "Quotes, invoices and client pages with 0% fees | Saroh",
        description:
            "Send quotes and invoices, get paid through your own Stripe, PayPal or bank link, and give every client one page. Free plan, no card needed.",
        h1: "Quotes, invoices and one page for every client.",
        updated: "2026-11-02",
    },
    {
        ...hub(
            "/pricing",
            "pricing",
            "Pricing and plans, with 0% fees | Saroh",
            "See Saroh's plans. Start free, no card needed. We never hold your money. Cancel any time.",
            "We never hold your money.",
            "Pricing",
        ),
        unreviewed: true,
        updated: "2026-11-02",
    },
    {
        ...hub(
            "/changelog",
            "changelog",
            "What's new in Saroh | Changelog",
            "Every change to Saroh, newest first. Tagged Global or Both so you know what reached saroh.tech.",
            "What's new",
            "Changelog",
        ),
        ...CONTENT_BUILT,
    },
    ...CHANGELOG.map((e) => ({
        path: changelogPath(e),
        type: "changelog" as const,
        title: `${e.title} (${new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(e.date))}) | Saroh changelog`,
        description: `${e.title}: what changed in Saroh, and how to try it.`,
        h1: e.title,
        crumb: under("Changelog", "/changelog", e.title),
        ...CONTENT_BUILT,
    })),
    {
        ...hub(
            "/about",
            "about",
            "About Saroh: let's rise together",
            "Saroh (सारोह) means rising together. A small team building simple tools for freelancers and small businesses, with no fees on your money.",
            "Let's rise together.",
            "About",
        ),
        unreviewed: true,
        updated: "2026-11-02",
    },
    {
        ...hub(
            "/referral",
            "referral",
            "Refer a friend | Saroh",
            "Share Saroh with a friend. The rules are on this page.",
            "Refer a friend",
            "Referral",
        ),
        unreviewed: true,
        updated: "2026-11-02",
    },
    {
        ...hub(
            "/help",
            "help",
            "Saroh help",
            "Step by step answers for setting up and using Saroh.",
            "How can we help?",
            "Help",
        ),
        unreviewed: true,
        updated: "2026-11-02",
    },
    ...HELP.map(({ slug, task, minutes }): SitePage => ({
        path: `/help/${slug}`,
        type: "help",
        title: `${task} | Saroh help`,
        description: `Step by step: ${task[0].toLowerCase()}${task.slice(1)}. Takes about ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
        h1: task,
        crumb: under("Help", "/help", task),
        unreviewed: true,
        updated: "2026-11-02",
    })),
    legal(
        "terms",
        "Terms of service",
        "The terms for using Saroh and its free tools. We never hold or move your clients' money.",
    ),
    legal(
        "privacy",
        "Privacy",
        "What Saroh collects, where it is stored, and what stays in your browser.",
    ),
    legal(
        "cookies",
        "Cookies",
        "The cookies and browser storage saroh.tech uses. No analytics cookies.",
    ),
    legal(
        "billing",
        "Billing and cancelling",
        "How paying for Saroh works: prepaid plans, tax, cancelling and refunds.",
    ),
    {
        ...hub(
            "/tools",
            "tools-hub",
            "Free invoice, quote and tax tools, no sign-up | Saroh",
            "Eight free tools that run in your browser: invoices, quotes, receipts, reminders, late fees and tax. No account, no watermark.",
            "Free tools for getting paid",
            "Tools",
        ),
        updated: "2026-11-02",
    },
    tool(
        "invoice-generator",
        "Invoice generator",
        "Free invoice generator: no sign-up, no watermark | Saroh",
        "Make an invoice in your browser and download a clean PDF. No sign-up, no watermark. Any currency, your own tax lines.",
        "Free invoice generator",
    ),
    tool(
        "quote-maker",
        "Quote maker",
        "Free quote and estimate maker, ready in 2 minutes | Saroh",
        "Make a quote or estimate in your browser and download a clean PDF. No sign-up, no watermark.",
        "Free quote and estimate maker",
    ),
    tool(
        "receipt-maker",
        "Receipt maker",
        "Free receipt maker: make a payment receipt online | Saroh",
        "Make a payment receipt in your browser and download a clean PDF. No sign-up, no watermark.",
        "Free receipt maker",
    ),
    tool(
        "payment-reminder",
        "Payment reminder",
        "Payment reminder email writer, polite to firm | Saroh",
        "Write a payment reminder in your browser, from polite to firm, then copy it into your own email or WhatsApp.",
        "Write a payment reminder that gets paid",
    ),
    tool(
        "late-fee-calculator",
        "Late fee calculator",
        "Late fee calculator for overdue invoices | Saroh",
        "Work out the late fee on an overdue invoice in your browser. No sign-up.",
        "Late fee calculator",
    ),
    tool(
        "vat-calculator",
        "VAT calculator",
        "VAT calculator: add or remove VAT | Saroh",
        "Add VAT to a price or take it out of a total, in your browser. No sign-up. Rates are examples you can change.",
        "VAT calculator",
    ),
    tool(
        "sales-tax-calculator",
        "Sales tax calculator",
        "Sales tax calculator: add or remove sales tax | Saroh",
        "Add sales tax to a price or take it out of a total, in your browser. No sign-up. Enter your own combined rate.",
        "Sales tax calculator",
    ),
    tool(
        "gst-calculator",
        "GST calculator",
        "GST calculator: add or remove GST | Saroh",
        "Add GST to a price or take it out of a total, in your browser. No sign-up. Rates are examples you can change.",
        "GST calculator",
    ),
    {
        ...hub(
            "/templates",
            "templates",
            "Free invoice and quote templates: PDF, Word, Docs, Sheets | Saroh",
            "Free invoice, quote and receipt templates for your trade and country. Download them or fill them in online.",
            "Free templates for every trade",
            "Templates",
        ),
        unreviewed: true,
        updated: "2026-11-02",
    },
    ...templateEntries(),
    {
        ...hub(
            "/guides",
            "guides",
            "Guides to quotes, invoices and getting paid | Saroh",
            "Plain answers on writing invoices and quotes, asking for payment and setting your rate.",
            "Guides",
            "Guides",
        ),
        ...CONTENT_BUILT,
    },
    ...GUIDES.map(([slug, name, title, description]) => ({
        path: `/guides/${slug}`,
        type: "guide" as const,
        title,
        description,
        h1: name,
        crumb: under("Guides", "/guides", name),
        ...CONTENT_BUILT,
    })),
    {
        ...hub(
            "/compare",
            "compare",
            "Compare Saroh with other invoice apps | Saroh",
            "Honest comparisons of Saroh and other invoice apps: prices, fees and client pages.",
            "Compare Saroh",
            "Compare",
        ),
        ...CONTENT_BUILT,
    },
    ...ALTERNATIVES.map(([slug, name]) => ({
        path: `/compare/${slug}-alternative`,
        type: "alternative" as const,
        title: `${name} alternative with no payment fees | Saroh`,
        description: `An honest look at Saroh and ${name}: prices, fees, client pages and where ${name} is still the better pick.`,
        h1: `Looking for ${/^[aeiou]/i.test(name) ? "an" : "a"} ${name} alternative?`,
        crumb: under("Compare", "/compare", `${name} alternative`),
        ...CONTENT_BUILT,
    })),
];

export const pageAt = (path: string) => PAGES.find((p) => p.path === path);

/** For a page's own route: a missing entry should fail the build. */
export function pageOf(path: string): SitePage {
    const page = pageAt(path);
    if (!page) throw new Error(`${path} is missing from the site map`);
    return page;
}

/** Only pages that are built go in the sitemap. */
export const indexedPages = () => PAGES.filter((p) => !p.unreviewed);

/** The saroh.in page that does the same job, or null. */
export function indiaPair(path: string): string | null {
    const pair = hreflang.pairs.find((p) => p.tech === path);
    return pair ? `${hreflang.in}${pair.in}` : null;
}
