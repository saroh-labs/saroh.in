import type { PlansFeed, PublicPlan } from "@saroh/site-blocks";

/**
 * The Plans block's plans, for a page that has one (G9).
 *
 * The block is bound to the business's plans on sale, so the page that
 * serves the site reads them and hands them in, with where the block's
 * button goes: the page holding the site's enquiry form ("Ask about
 * joining"), or nowhere when the site has none. Read on the server, so a
 * visitor gets the plans in the page, and only for a page that draws a Plans
 * block, so every other page costs nothing extra.
 *
 * Pure apart from `read`, so the rule is testable without the app's env.
 */
export function hasPlans(sections: readonly { type: string }[]): boolean {
    return sections.some((section) => section.type === "plans");
}

export async function plansFeed(
    sections: readonly { type: string }[],
    /** The page with the site's enquiry form, or null when it has none. */
    joinHref: string | null,
    read: () => Promise<PublicPlan[]>,
): Promise<PlansFeed | undefined> {
    if (!hasPlans(sections)) return undefined;
    // A failed read, Payments off or no plan on sale is an empty list (the
    // reader never throws), and an empty list draws nothing: the page still
    // serves.
    return { plans: await read(), joinHref };
}

/**
 * The enquiry page's path under a prefix: `/` → `/preview/tok`, `/contact`
 * → `/preview/tok/contact`. No prefix leaves it as it is.
 */
export function underPrefix(
    path: string | null,
    prefix: string,
): string | null {
    if (path === null || prefix === "") return path;
    return path === "/" ? prefix : `${prefix}${path}`;
}
