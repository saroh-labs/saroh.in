import { PLAN_TEASERS } from "@/content/home";
import type { PlanId } from "@/content/types";
import {
    PLAN_DETAILS_PLACEHOLDER,
    PRICE_NOTE,
    PRICE_PLACEHOLDER,
} from "@/content/types";

/**
 * One plan as a teaser card draws it: everything `<PlanTeaserCard>` shows,
 * already worded. The card never looks anything up, so where the words come
 * from can change without touching a page or the card.
 *
 * Today they come from the placeholder (the public-repo rule: no prices, no
 * plan limits in the repo). When the catalogue feeds the site (U24), only
 * `planTeaser` below changes: the price, its note and what the plan includes
 * then come from the published catalogue.
 */
export interface PlanTeaserView {
    plan: PlanId;
    /** "Free", "Grow", "Pro". */
    name: string;
    /** The big figure; `PRICE_PLACEHOLDER` until the catalogue is wired. */
    price: string;
    /** The small words after the price ("a month", or the launch note). */
    priceNote: string;
    /** What the plan includes, one line. */
    what: string;
    /** The Ink card with the Saffron button. */
    featured: boolean;
    /** The page's own line under a featured plan ("For a shop, that means…"). */
    fit?: string;
}

const NAMES = new Map(PLAN_TEASERS.map((t) => [t.plan, t.name]));

/** One plan's teaser, from the placeholder. */
export function planTeaser(
    plan: PlanId,
    { featured = false, fit }: { featured?: boolean; fit?: string } = {},
): PlanTeaserView {
    return {
        plan,
        name: NAMES.get(plan) ?? plan,
        price: PRICE_PLACEHOLDER,
        priceNote: PRICE_NOTE,
        what: PLAN_DETAILS_PLACEHOLDER,
        featured,
        fit,
    };
}

/**
 * The note under a solution page's two cards. The design's "Billed monthly.
 * Prices before GST." says something about prices that are not announced
 * yet, so until the catalogue is wired there is none and only "Compare every
 * plan" shows.
 */
export const PLAN_TEASER_FOOTNOTE: string | null = null;

/** A solution page's two cards: its featured plan with the fit line, then the second. */
export function solutionPlanTeasers(pricing: {
    featured: PlanId;
    fit: string;
    second: PlanId;
}): [PlanTeaserView, PlanTeaserView] {
    return [
        planTeaser(pricing.featured, { featured: true, fit: pricing.fit }),
        planTeaser(pricing.second),
    ];
}
