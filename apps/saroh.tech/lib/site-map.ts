import hreflang from "@saroh/edition/hreflang";

import { templateEntries } from "./templates/pages";

import { ABOUT } from "@/content/about";

import { CHANGELOG, changelogPath } from "@/content/changelog";

import { CONTACT } from "@/content/contact";

import {
    featureHref,
    featureList,
    UPDATED as FEATURES_UPDATED,
} from "@/content/features";

import { HELP } from "@/content/help";

import { DEVELOPERS } from "@/content/developers";
import { INTEGRATIONS } from "@/content/integrations";
import {
    galleryTemplates,
    WEBSITE_TEMPLATES_PATH,
    websiteTemplatesPage,
} from "@/content/website-templates";
import { featuresOff } from "@/lib/feature-switches";

import { LEGAL_UPDATED } from "@/content/legal";

import { home, UPDATED as HOME_UPDATED } from "@/content/home";
import {
    UPDATED as HOW_IT_WORKS_UPDATED,
    howItWorksWords,
} from "@/content/how-it-works";

import {
    solutionHref,
    solutionList,
    UPDATED as SOLUTIONS_UPDATED,
} from "@/content/solutions";

import { HUB_PATH, HUB_WORDS } from "@/content/solutions-hub";
import { TRADE_PAGES, UPDATED as TRADES_UPDATED } from "@/content/trades";

/** How it works' h1; it doesn't follow the paid-plans switch. */
const { title: howTitle } = howItWorksWords(false);
const HOW_TITLE = `${howTitle.before}${howTitle.mark}${howTitle.after}`;

/**
 * Every page, as the site map and page-spec boards list them. Title,
 * description and H1 are the specs' own words. An `unreviewed` page is noindex
 * and out of the sitemap; every hand-listed page was released on 22 Nov 2026,
 * so only document templates whose data isn't `reviewed` use it today. The pricing line
 * names no price until the USD catalogue reads them in (stage 9).
 */
export type PageType =
    | "home"
    | "feature"
    | "features"
    | "solution"
    | "solutions"
    | "pricing"
    | "changelog"
    | "about"
    | "contact"
    | "integrations"
    | "developers"
    | "referral"
    | "help"
    | "legal"
    | "tools-hub"
    | "tool"
    | "templates"
    | "template"
    | "website-templates"
    | "website-template"
    | "guides"
    | "guide"
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

const CONTENT_BUILT = { updated: "2026-11-02" };

const legal = (slug: string, name: string, description: string): SitePage => ({
    path: `/legal/${slug}`,
    type: "legal",
    title: `${name} | Saroh`,
    description,
    h1: name,
    crumb: [{ name: "Home", path: "/" }, { name }],
    updated: LEGAL_UPDATED,
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
        title: `${home.seoTitle} | Saroh`,
        description: home.seoDescription,
        h1: home.titleLabel,
        updated: HOME_UPDATED,
    },
    // Features (DEC-221; "Features" in the nav, owner 17 Nov): How it works, drawn and indexed.
    {
        ...hub(
            "/features",
            "features",
            "Features: how Saroh works | Saroh",
            "How Saroh keeps your records, reaches your customers and answers your questions, and how the money moves.",
            HOW_TITLE,
            "Features",
        ),
        updated: HOW_IT_WORKS_UPDATED,
    },
    ...featureList.map((f): SitePage => ({
        path: featureHref(f.slug),
        type: "feature",
        title: `${f.seoTitle} | Saroh`,
        description: f.seoDescription,
        h1: f.headline,
        crumb: [{ name: "Features", path: "/features" }, { name: f.name }],
        updated: FEATURES_UPDATED,
    })),
    // The Solutions hub (DEC-221): saroh.in's /for hub over saroh.tech's trades.
    {
        ...hub(
            HUB_PATH,
            "solutions",
            "Software for your trade, from bakeries to plumbers | Saroh",
            "Software for shops, salons, studios, clinics and trades: pick yours to see what Saroh does for a business like yours.",
            `${HUB_WORDS.h1Before} ${HUB_WORDS.h1Mark}`,
            HUB_WORDS.crumb,
        ),
        updated: SOLUTIONS_UPDATED,
    },
    ...solutionList.map((s): SitePage => ({
        path: solutionHref(s.slug),
        type: "solution",
        title: `${s.seoTitle} | Saroh`,
        description: s.seoDescription,
        h1: s.headline,
        crumb: [{ name: "Solutions", path: HUB_PATH }, { name: s.name }],
        updated: SOLUTIONS_UPDATED,
    })),
    // The other trades (owner, 16 Nov 2026); released with every page on 22 Nov 2026.
    ...TRADE_PAGES.map((t): SitePage => ({
        path: `/solutions/${t.slug}`,
        type: "solution",
        title: `${t.seoTitle} | Saroh`,
        description: t.seoDescription,
        h1: t.headline,
        crumb: [{ name: "Solutions", path: HUB_PATH }, { name: t.name }],
        updated: TRADES_UPDATED,
    })),
    {
        ...hub(
            "/pricing",
            "pricing",
            "Pricing and plans | Saroh",
            // True whether or not paid plans are on sale; the page's own title follows the switch.
            "Start free with no card, and see what each plan includes.",
            "Start free.",
            "Pricing",
        ),
        updated: "2026-11-04",
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
            "Saroh (सारोह) means rising together. Who Saroh is for, what the name means and the company that makes it.",
            ABOUT.title,
            "About",
        ),
        updated: "2026-11-04",
    },
    {
        ...hub(
            "/contact",
            "contact",
            "Contact us: questions, help and ideas | Saroh",
            "Write to the Saroh team with a question before you sign up, something not working or an idea. A person reads every message.",
            CONTACT.title,
            "Contact",
        ),
        updated: "2026-11-04",
    },
    // The website templates gallery, only while templates are on (DEC-135),
    // at /website-templates (/templates is the document templates).
    ...(featuresOff().includes("templates")
        ? []
        : [
              {
                  ...hub(
                      WEBSITE_TEMPLATES_PATH,
                      "website-templates",
                      "Website templates for small businesses | Saroh",
                      websiteTemplatesPage.description,
                      websiteTemplatesPage.title,
                      websiteTemplatesPage.name,
                  ),
                  updated: "2026-11-16",
              },
              ...galleryTemplates().map((t): SitePage => ({
                  path: t.href,
                  type: "website-template",
                  title: `${t.name} website template | Saroh`,
                  description: t.description,
                  h1: `${t.name}: ${t.idea}.`,
                  crumb: under(
                      websiteTemplatesPage.name,
                      WEBSITE_TEMPLATES_PATH,
                      t.name,
                  ),
                  updated: "2026-11-16",
              })),
          ]),
    // Only while its switch is on: the page 404s without it (#13).
    ...(featuresOff().includes("developers")
        ? []
        : [
              {
                  ...hub(
                      "/developers",
                      "developers",
                      "Saroh API and webhooks for developers | Saroh",
                      "The Saroh API and webhooks: read and change a business's products, bookings, orders and customers, show its catalogue on your site, and hear when an order is paid.",
                      DEVELOPERS.headline,
                      DEVELOPERS.name,
                  ),
                  updated: "2026-11-16",
              },
          ]),
    {
        ...hub(
            "/integrations",
            "integrations",
            "Integrations: what Saroh works with | Saroh",
            "What Saroh works with today, and what isn't built yet.",
            INTEGRATIONS.title,
            "Integrations",
        ),
        updated: "2026-11-04",
    },
    {
        ...hub(
            "/referral",
            "referral",
            "Refer a friend | Saroh",
            "Send a friend the link from your site. It records who sent them, and there's no reward today.",
            "Refer a friend",
            "Referral",
        ),
        updated: "2026-11-04",
    },
    {
        ...hub(
            "/help",
            "help",
            "Saroh help",
            "Step by step help with setting up your business, products, orders, bookings, your website and invoices, and the free tools.",
            "How can we help?",
            "Help",
        ),
        updated: "2026-11-04",
    },
    ...HELP.map(({ slug, task, minutes }): SitePage => ({
        path: `/help/${slug}`,
        type: "help",
        title: `${task} | Saroh help`,
        description: `Step by step: ${task[0].toLowerCase()}${task.slice(1)}. Takes about ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
        h1: task,
        crumb: under("Help", "/help", task),
        updated: "2026-11-04",
    })),
    legal(
        "terms",
        "Terms of service",
        "The terms for using Saroh and its free tools.",
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
        "Billing",
        "How paying for Saroh works, what happens to your customers' money, and how to leave.",
    ),
    {
        ...hub(
            "/customers",
            "legal",
            "For customers: your order, or report a business | Saroh",
            "For customers of a business that uses Saroh: who is responsible for your order or booking, how to reach them, and how to report a business.",
            "Bought from a business that uses Saroh?",
            "For customers",
        ),
        updated: "2026-11-04",
    },
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
        "Make an invoice in your browser and download a clean PDF. No sign-up, no watermark. Nine currencies, your own tax lines.",
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
            "Free document templates for every trade",
            "Document templates",
        ),
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
