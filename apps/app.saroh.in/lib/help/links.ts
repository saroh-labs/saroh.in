/**
 * Where help lives, in one place.
 *
 * Two reasons this is a module rather than a string typed at each call site.
 *
 * The audit's Help and Documentation finding scored 1/10 not because writing an
 * article is hard but because nothing in the product pointed at one. Links added
 * ad hoc across a dozen screens drift the moment a page is renamed, and a help
 * link that 404s is worse than none — it teaches a stuck merchant that asking
 * for help does not work.
 *
 * `pnpm check:routes` cannot help here: these are absolute URLs to a different
 * app, so nothing verifies them at build time. Keeping every topic in this table
 * at least makes the set reviewable in one screenful when help.saroh.in changes.
 * The slugs correspond to files in `apps/help.saroh.in/content/`.
 */
export const HELP_URL = "https://help.saroh.in";

/**
 * Article slugs, checked against `apps/help.saroh.in/content/*.mdx`.
 *
 * Named rather than free strings so a typo is a type error instead of a 404
 * someone finds while already frustrated.
 */
export const HELP_TOPICS = {
    gettingStarted: "getting-started",
    findingYourWay: "finding-your-way-around",
    customers: "customers",
    selling: "selling",
    bookings: "bookings",
    website: "website",
    organisation: "organisation",
    capabilities: "what-your-business-needs",
} as const;

export type HelpTopic = (typeof HELP_TOPICS)[keyof typeof HELP_TOPICS];

/**
 * `HelpTopic` only — deliberately not `HelpTopic | string`, which collapses to
 * `string` and throws away the whole point of naming the slugs.
 */
export function helpUrl(topic: HelpTopic): string {
    return `${HELP_URL}/${topic}`;
}

/** Developer documentation — a different audience and a different site. */
export const DOCS_URL = "https://docs.saroh.in";
