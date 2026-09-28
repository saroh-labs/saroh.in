import type { PlansFeed, PublicPlan } from "@saroh/site-blocks";

/**
 * The Plans block's plans, for a page that has one (G9).
 *
 * The block is bound to the business's plans on sale, so the page that
 * serves the site reads them and hands them in, with where the block's
 * "Ask about joining" goes (the page holding the site's enquiry form, or
 * nowhere when the site has none) and whether Join can be paid online now
 * (G20). Read on the server, so a visitor gets the plans in the page, and
 * only for a page that draws a Plans block, so every other page costs
 * nothing extra.
 *
 * Pure apart from `read`, so the rule is testable without the app's env.
 */
export function hasPlans(sections: readonly { type: string }[]): boolean {
    return sections.some((section) => section.type === "plans");
}

/** The plans on sale, and whether Join can be paid online now. */
export interface PlansRead {
    plans: PublicPlan[];
    payOnline: boolean;
}

export async function plansFeed(
    sections: readonly { type: string }[],
    /** The page with the site's enquiry form, or null when it has none. */
    joinHref: string | null,
    read: () => Promise<PlansRead>,
): Promise<PlansFeed | undefined> {
    if (!hasPlans(sections)) return undefined;
    // A failed read, Payments off or no plan on sale is an empty list (the
    // reader never throws), and an empty list draws nothing: the page still
    // serves.
    const { plans, payOnline } = await read();
    return { plans, joinHref, payOnline };
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
