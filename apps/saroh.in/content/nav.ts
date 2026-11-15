/**
 * The nav's and footer's own words (the redesign, DEC-221): the five on the
 * nav (Solutions · How it works · Templates · Pricing · Developers; the
 * Templates and Developers pages bring their own names), and the footer's
 * groups, the Product group in the LOCKED order (WORLD.md).
 */
export const NAV_WORDS = {
    solutions: "Solutions",
    howItWorks: "How it works",
    /** The How it works menu's see-all: the /features page. */
    howItWorksAll: "How Saroh works",
    pricing: "Pricing",
    signIn: "Sign in",
} as const;

export const FOOTER_WORDS = {
    line: "Your site, orders, bookings and billing, for small businesses in India.",
    product: "Product",
    /** The shown features the Product group doesn't name. */
    more: "Also in Saroh",
    trades: "For your trade",
    resources: "Resources",
    tools: "Tools",
    saroh: "Saroh",
    questions: "Questions",
} as const;

/**
 * The footer's Product group, in this order everywhere (WORLD.md, LOCKED):
 * each entry a feature page by slug, or another page, and shown only when
 * that page is.
 */
export const PRODUCT_GROUP = [
    { name: "Website builder", feature: "website" },
    { name: "Orders", feature: "orders" },
    { name: "Bookings", feature: "bookings" },
    { name: "Billing", feature: "billing" },
    { name: "Share and posts", feature: "social" },
    // The add-on that posts and schedules for you: a claim (DEC-221).
    {
        name: "Saroh Social",
        feature: "social",
        hash: "saroh-social",
        claim: "social-posting",
    },
    { name: "Ask AI", feature: "ask-ai" },
    { name: "AI apps", feature: "ai-apps" },
    { name: "API and webhooks", page: "/developers" },
] as const;
