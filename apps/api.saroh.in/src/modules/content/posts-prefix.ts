import { BadRequestException } from "@nestjs/common";

/**
 * Where a site's posts live: `/<prefix>/<slug>`, with an index at `/<prefix>`
 * (#232).
 *
 * The merchant chooses it, because "blog" is not what every business calls its
 * writing — a practice has updates, a studio has a journal, a shop has news.
 * A default that could not be changed would put a word in their mouth on their
 * own address bar.
 */

/** What a site uses when the merchant has not chosen. */
export const DEFAULT_POSTS_PREFIX = "blog";

/**
 * One lowercase path segment: letters, digits and interior hyphens. The same
 * shape a page slug takes, because it sits in the same position and a visitor
 * cannot tell them apart by looking.
 */
const PREFIX_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Reserved because the renderer owns them. `preview` is the draft-preview route
 * (#198) and `checkout` is the order route; a prefix matching either would put
 * a merchant's writing where the platform already serves something else.
 */
const RESERVED = new Set(["preview", "checkout", "api", "_next"]);

/** The prefix a site's posts live under, defaulted. */
export function postsPrefix(prefix: string | null | undefined): string {
    const value = prefix?.trim();
    // Not a nullish fallback: an empty string means "not chosen" too, and must
    // reach the default rather than becoming a prefix of nothing.
    return value === undefined || value === "" ? DEFAULT_POSTS_PREFIX : value;
}

/** The public path of a post, e.g. `/blog/warehouse-safety-basics`. */
export function postPath(
    prefix: string | null | undefined,
    slug: string,
): string {
    return `/${postsPrefix(prefix)}/${slug}`;
}

/** The public path of the index, e.g. `/blog`. */
export function postsIndexPath(prefix: string | null | undefined): string {
    return `/${postsPrefix(prefix)}`;
}

/**
 * Validate a merchant-chosen prefix, or throw. Returns the normalized value,
 * or null when they cleared it back to the default.
 *
 * `pagePaths` is every path the site's pages occupy: a prefix that matched one
 * would make the index unreachable and one of the two silently win, so it is
 * refused with the page named rather than discovered later as a missing page.
 */
export function parsePostsPrefix(
    input: string | null | undefined,
    pagePaths: string[] = [],
): string | null {
    const value = input?.trim().toLowerCase();
    if (!value) return null;

    if (!PREFIX_RE.test(value)) {
        throw new BadRequestException({
            message:
                "Use lowercase letters, numbers and hyphens — no slashes or spaces.",
            field: "postsPrefix",
        });
    }
    if (RESERVED.has(value)) {
        throw new BadRequestException({
            message: `"${value}" is reserved by Saroh. Pick another word.`,
            field: "postsPrefix",
        });
    }
    if (pagePaths.includes(`/${value}`)) {
        throw new BadRequestException({
            message: `This site already has a page at /${value}. Posts and a page cannot share an address.`,
            field: "postsPrefix",
        });
    }
    // Stored as null when it matches the default, so a site is not pinned to
    // today's default word by having once accepted it.
    return value === DEFAULT_POSTS_PREFIX ? null : value;
}
