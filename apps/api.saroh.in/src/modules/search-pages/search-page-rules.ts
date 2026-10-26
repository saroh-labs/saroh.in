/**
 * What each admin action does to a search page's publish record (DEC-193).
 * Pure: no database, so the rules are pinned by a spec without one.
 *
 * A path with no record has never been published and reads as DRAFT, the
 * same place a page restored from the archive goes back to.
 */

export const SEARCH_PAGE_ACTIONS = [
    "publish",
    "unpublish",
    "archive",
    "restore",
] as const;
export type SearchPageAction = (typeof SEARCH_PAGE_ACTIONS)[number];

export type SearchPageStatus = "LIVE" | "UNPUBLISHED" | "ARCHIVED" | "DRAFT";

/** `/for/<slug>`; other kinds join this when they get pages. */
export const SEARCH_PAGE_PATH = /^\/for\/[a-z0-9-]+$/;

/** At most this many paths in one action. */
export const MAX_PATHS_PER_ACTION = 100;

/**
 * The status the action leaves, or null when it can't be done from `from`
 * (null `from` = no record yet). Archived pages can't be published until
 * restored; archiving a live page takes it off in the same change.
 */
export function nextStatus(
    action: SearchPageAction,
    from: SearchPageStatus | null,
): SearchPageStatus | null {
    const current = from ?? "DRAFT";
    switch (action) {
        case "publish":
            return current === "DRAFT" || current === "UNPUBLISHED"
                ? "LIVE"
                : null;
        case "unpublish":
            return current === "LIVE" ? "UNPUBLISHED" : null;
        case "archive":
            return current === "ARCHIVED" ? null : "ARCHIVED";
        case "restore":
            return current === "ARCHIVED" ? "DRAFT" : null;
    }
}

/** True when the change puts a page on the site or takes it off. */
export function changesLive(
    from: SearchPageStatus | null,
    to: SearchPageStatus,
): boolean {
    return (from === "LIVE") !== (to === "LIVE");
}
