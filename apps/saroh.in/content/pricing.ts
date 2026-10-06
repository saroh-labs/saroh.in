/**
 * Pricing's own words (the Pricing design), apart from the page so the share
 * card and the metadata can read them without the page's client parts.
 * Everything about a plan comes from the catalogue (`lib/pricing.ts`), and
 * what each plan includes is set in the admin (DEC-075, D3): these lines
 * name no plan's contents.
 */
export const PRICING_COPY = {
    eyebrow: "Pricing",
    title: "Start free. Move up when you need more.",
    intro: "Put your site up for nothing, and move to a paid plan when you need more. Each plan below says what it includes.",
    closer: "Start your site for free.",
} as const;

/** The search-result line: what each plan is for, never what it costs. */
export const PRICING_DESCRIPTION =
    "Start free with your site, and move to a paid plan when you need more.";
