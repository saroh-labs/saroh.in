import type { HelpSummary } from "./help";
import { helpHref, liveArticles } from "./help";
import type { PublishContext } from "./resources";
import { linkShown } from "./resources";
import type { FeatureSlug } from "./types";

/**
 * Each feature page's "How to … →" links to its Help articles (Resources
 * plan U7, internal links). A feature with no matching article has none:
 * Dashboard, Customers and Insights today.
 *
 * The label is the article's job as a "How to" line, in the article's own
 * words, so the link says where it goes.
 */
export const FEATURE_HELP: Readonly<
    Partial<Record<FeatureSlug, readonly { slug: string; label: string }[]>>
> = {
    products: [
        {
            slug: "add-your-first-product",
            label: "How to add your first product",
        },
    ],
    orders: [
        {
            slug: "take-your-first-order",
            label: "How to take your first order",
        },
    ],
    bookings: [
        { slug: "set-your-teams-hours", label: "How to set your team's hours" },
        {
            slug: "take-a-deposit-when-they-book",
            label: "How to take a deposit when they book",
        },
    ],
    subscriptions: [
        {
            slug: "set-up-a-monthly-plan",
            label: "How to set up a monthly plan",
        },
    ],
    billing: [{ slug: "add-your-gstin", label: "How to add your GSTIN" }],
};

export interface FeatureHelpLink {
    href: string;
    label: string;
}

/**
 * The links a feature page draws now: only to an article that is published
 * (its own `publishOn`), inside a Help that is shown with its article route
 * built (`linkShown`), so nothing links to a 404 before Help opens (KTD-2).
 */
export function featureHelpLinks(
    feature: FeatureSlug,
    articles: readonly HelpSummary[],
    ctx: PublishContext,
): FeatureHelpLink[] {
    const live = new Set(liveArticles(articles, ctx).map((a) => a.slug));
    return (FEATURE_HELP[feature] ?? [])
        .filter((h) => live.has(h.slug) && linkShown(helpHref(h.slug), ctx))
        .map((h) => ({ href: helpHref(h.slug), label: h.label }));
}
