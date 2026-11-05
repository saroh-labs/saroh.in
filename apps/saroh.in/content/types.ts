/**
 * The Marketing Site V2 content model (plan U18, KTD-13). Each file in
 * `content/` mirrors a data block from the designs, typed, so the page
 * templates only render and `content.test.ts` can check every cross-link.
 * The shape is shared with saroh.tech (`@saroh/marketing/content-types`);
 * the words and these question ids are this site's.
 *
 * Merchant copy rules (saroh-product.md): "location", never "storefront" or
 * "store", even where a design says it; nothing the product cannot back.
 */
export { FEATURE_SLUGS, SOLUTION_SLUGS } from "@saroh/marketing/content-types";
export type {
    FaqItem,
    Feature,
    FeatureSlug,
    FeatureStep,
    PlanId,
    PlanTeaser,
    Point,
    SearchWords,
    ShotKey,
    ShotRef,
    Solution,
    SolutionSegment,
    SolutionSlug,
} from "@saroh/marketing/content-types";

/** Every question on the site, by id (`faq.ts` holds the words). */
export const FAQ_IDS = [
    "start-free",
    "gst",
    "gst-solutions",
    "pay",
    "team",
    "medical-notes",
    "shops-counter-online",
    "gyms-pack-and-membership",
    "clinics-medical-notes",
    "salons-choose-stylist",
] as const;
export type FaqId = (typeof FAQ_IDS)[number];

/** The price shown when there is no catalogue to read. */
export const PRICE_PLACEHOLDER = "—";
/** The line beside a placeholder price. */
export const PRICE_NOTE = "Prices aren't available right now";
/** What a plan includes, when there is no catalogue to read. */
export const PLAN_DETAILS_PLACEHOLDER =
    "Plan details aren't available right now";
