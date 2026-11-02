import hreflang from "@saroh/edition/hreflang";

/**
 * Every page, as the site map and page-spec boards list them. Title,
 * description and H1 are the specs' own words. A page is `stub` until its
 * phase builds it: a stub is noindex and out of the sitemap. The pricing line
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
    stub?: boolean;
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
    stub: true,
});

const DOCUMENTS = [
    ["invoice", "Invoice"],
    ["estimate", "Estimate"],
    ["quote", "Quote"],
    ["receipt", "Receipt"],
    ["proforma-invoice", "Proforma invoice"],
    ["credit-note", "Credit note"],
    ["payment-reminder-letter", "Payment reminder letter"],
    ["price-list", "Price list"],
] as const;

const TRADES = [
    ["photographer", "Photographer"],
    ["graphic-designer", "Graphic designer"],
    ["web-developer", "Web developer"],
    ["cleaner", "Cleaner"],
    ["contractor", "Contractor"],
    ["plumber", "Plumber"],
    ["electrician", "Electrician"],
    ["tutor", "Tutor"],
    ["personal-trainer", "Personal trainer"],
    ["consultant", "Consultant"],
    ["makeup-artist", "Makeup artist"],
    ["event-planner", "Event planner"],
    ["landscaper", "Landscaper"],
    ["salon", "Salon"],
] as const;

const COUNTRIES = [
    ["uk", "UK"],
    ["us", "US"],
    ["canada", "Canada"],
    ["australia", "Australia"],
    ["uae", "UAE"],
    ["singapore", "Singapore"],
] as const;

const GUIDES = [
    ["how-to-write-an-invoice", "How to write an invoice"],
    ["quote-vs-estimate", "Quote vs estimate"],
    ["ask-client-for-payment", "How to ask a client for payment"],
    ["payment-terms", "Net 30 and other payment terms"],
    ["charge-a-deposit", "How to charge a deposit"],
    ["set-your-rate", "How to set your freelance rate"],
    ["vat-and-sales-tax-basics", "VAT and sales tax basics"],
] as const;

const ALTERNATIVES = [
    ["invoice-simple", "Invoice Simple"],
    ["joist", "Joist"],
    ["honeybook", "HoneyBook"],
    ["bonsai", "Bonsai"],
    ["invoice2go", "Invoice2go"],
    ["freshbooks", "FreshBooks"],
] as const;

const legal = (slug: string, name: string): SitePage => ({
    path: `/legal/${slug}`,
    type: "legal",
    title: `${name} | Saroh`,
    description: `${name} for Saroh, the global edition.`,
    h1: name,
    crumb: [{ name: "Home", path: "/" }, { name }],
    stub: true,
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
    stub: true,
});

export const PAGES: SitePage[] = [
    {
        path: "/",
        type: "home",
        title: "Quotes, invoices and client pages with 0% fees | Saroh",
        description:
            "Send quotes and invoices, get paid through your own Stripe, PayPal or bank link, and give every client one page. Free plan, no card needed.",
        h1: "Quotes, invoices and one page for every client.",
        stub: true,
    },
    hub(
        "/pricing",
        "pricing",
        "Pricing: price locked for 12 months, 0% fees | Saroh",
        "Five plans, Free included. Your price stays the same for 12 months. We never hold your money. Cancel any time.",
        "We never hold your money.",
        "Pricing",
    ),
    hub(
        "/changelog",
        "changelog",
        "What's new in Saroh | Changelog",
        "Every change to Saroh, newest first. Tagged Global or Both so you know what reached saroh.tech.",
        "What's new",
        "Changelog",
    ),
    hub(
        "/about",
        "about",
        "About Saroh: let's rise together",
        "Saroh (सारोह) means rising together. A small team building simple tools for freelancers and small businesses, with no fees on your money.",
        "Let's rise together.",
        "About",
    ),
    hub(
        "/referral",
        "referral",
        "Give a month, get a month | Saroh",
        "Share your link. When a friend starts a paid plan, you both get a month free.",
        "Give a month, get a month.",
        "Referral",
    ),
    hub(
        "/help",
        "help",
        "Saroh help",
        "Step by step answers for setting up and using Saroh.",
        "How can we help?",
        "Help",
    ),
    legal("terms", "Terms of service"),
    legal("privacy", "Privacy"),
    legal("cookies", "Cookies"),
    legal("billing", "Billing and cancelling"),
    hub(
        "/tools",
        "tools-hub",
        "Free invoice, quote and tax tools, no sign-up | Saroh",
        "Free tools that run in your browser: invoices, quotes, receipts, reminders, late fees and tax. No account, no watermark.",
        "Free tools for getting paid",
        "Tools",
    ),
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
        "Add VAT to a price or take it out, in your browser. No sign-up.",
        "VAT calculator",
    ),
    tool(
        "sales-tax-calculator",
        "Sales tax calculator",
        "Sales tax calculator: add or remove sales tax | Saroh",
        "Add sales tax to a price or take it out, in your browser. No sign-up.",
        "Sales tax calculator",
    ),
    tool(
        "gst-calculator",
        "GST calculator",
        "GST calculator: add or remove GST | Saroh",
        "Add GST to a price or take it out, in your browser. No sign-up.",
        "GST calculator",
    ),
    hub(
        "/templates",
        "templates",
        "Free invoice and quote templates: PDF, Word, Docs, Sheets | Saroh",
        "Free invoice, quote and receipt templates for your trade and country. Download them or fill them in online.",
        "Free templates for every trade",
        "Templates",
    ),
    ...DOCUMENTS.map(([slug, name]) => ({
        path: `/templates/${slug}`,
        type: "template" as const,
        title: `${name} template, with example items | Saroh`,
        description: `Free ${name.toLowerCase()} template with real example line items. Download as PDF, Word, Google Docs or Sheets, or fill it online.`,
        h1: `${name} template`,
        crumb: under("Templates", "/templates", name),
        stub: true,
    })),
    ...TRADES.map(([slug, name]) => ({
        path: `/templates/for/${slug}`,
        type: "templates" as const,
        title: `Free templates for ${name.toLowerCase()}s | Saroh`,
        description: `Free invoice, quote and receipt templates for ${name.toLowerCase()}s, with real example line items.`,
        h1: `Templates for ${name.toLowerCase()}s`,
        crumb: under("Templates", "/templates", name),
        stub: true,
    })),
    ...COUNTRIES.map(([slug, name]) => ({
        path: `/templates/in/${slug}`,
        type: "templates" as const,
        title: `Free ${name} invoice and quote templates | Saroh`,
        description: `Free invoice and quote templates for ${name}, in the local currency and format.`,
        h1: `Templates for ${name}`,
        crumb: under("Templates", "/templates", name),
        stub: true,
    })),
    hub(
        "/guides",
        "guides",
        "Guides to quotes, invoices and getting paid | Saroh",
        "Plain answers on writing invoices and quotes, asking for payment and setting your rate.",
        "Guides",
        "Guides",
    ),
    ...GUIDES.map(([slug, name]) => ({
        path: `/guides/${slug}`,
        type: "guide" as const,
        title: `${name} | Saroh`,
        description: `${name}, in plain words.`,
        h1: name,
        crumb: under("Guides", "/guides", name),
        stub: true,
    })),
    hub(
        "/compare",
        "compare",
        "Compare Saroh with other invoice apps | Saroh",
        "Honest comparisons of Saroh and other invoice apps: prices, fees and client pages.",
        "Compare Saroh",
        "Compare",
    ),
    ...ALTERNATIVES.map(([slug, name]) => ({
        path: `/compare/${slug}-alternative`,
        type: "alternative" as const,
        title: `${name} alternative with no payment fees | Saroh`,
        description: `An honest look at Saroh and ${name}: prices, fees, client pages and where ${name} is still the better pick.`,
        h1: `Looking for a ${name} alternative?`,
        crumb: under("Compare", "/compare", name),
        stub: true,
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
export const indexedPages = () => PAGES.filter((p) => !p.stub);

/** The saroh.in page that does the same job, or null. */
export function indiaPair(path: string): string | null {
    const pair = hreflang.pairs.find((p) => p.tech === path);
    return pair ? `${hreflang.in}${pair.in}` : null;
}
