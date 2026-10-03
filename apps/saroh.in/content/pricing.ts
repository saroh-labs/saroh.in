/**
 * Pricing's own words (the Pricing design), apart from the page so the share
 * card and the metadata can read them without the page's client parts.
 * Everything about a plan comes from the catalogue (`lib/pricing.ts`).
 */
export const PRICING_COPY = {
    eyebrow: "Pricing",
    title: "Start free. Pay when you start selling.",
    intro: "Put your site up and take your first bookings for nothing. Move to Grow when you want orders, subscriptions and invoices, and to Pro when you want your own look and a bigger team.",
    closer: "Your site can be up tonight, for free.",
} as const;

/** The search-result line: what each plan is for, never what it costs. */
export const PRICING_DESCRIPTION =
    "Start free with your site and your first bookings. Move to Grow for orders, subscriptions and invoices, and to Pro for your own look and a bigger team.";
