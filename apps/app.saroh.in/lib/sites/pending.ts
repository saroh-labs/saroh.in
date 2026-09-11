/**
 * What is waiting to go live, in words (#282).
 *
 * The API counts two things publishing would change: how many sections, and
 * which site-level settings, such as search, share image, style, menu, footer
 * and page names. Three surfaces read them: the editor bar, the settings
 * screen and the sites list. They all describe them through here, so a
 * merchant never reads "Nothing waiting" on one screen and "2 changes" on
 * another.
 */

/** Mirrors `SITE_CHANGE_KINDS` in the API's `pending-changes.ts`. */
export const SITE_CHANGE_KINDS = [
    "name",
    "search",
    "shareImage",
    "posts",
    "style",
    "footer",
    "menu",
    "pages",
] as const;
export type SiteChangeKind = (typeof SITE_CHANGE_KINDS)[number];

const LABELS: Record<SiteChangeKind, string> = {
    name: "the site name",
    search: "search settings",
    shareImage: "the share image",
    posts: "the blog address",
    style: "the style",
    footer: "the footer",
    menu: "the menu",
    pages: "the page list",
};

function isKind(value: string): value is SiteChangeKind {
    return (SITE_CHANGE_KINDS as readonly string[]).includes(value);
}

/** "a", "a and b", "a, b and c". */
function joinList(parts: string[]): string {
    if (parts.length <= 1) return parts.join("");
    return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * "3 sections, the style and the menu", or `null` when nothing is waiting.
 *
 * A kind this build does not know, sent by a newer API, is left out rather
 * than printed raw.
 */
export function describePendingChanges(
    sections: number | null | undefined,
    site: readonly string[] | null | undefined,
): string | null {
    const parts: string[] = [];
    if (sections && sections > 0) {
        parts.push(sections === 1 ? "1 section" : `${sections} sections`);
    }
    for (const kind of site ?? []) {
        if (isKind(kind)) parts.push(LABELS[kind]);
    }
    return parts.length > 0 ? joinList(parts) : null;
}

/** How many things publishing would change: sections plus site-level settings. */
export function pendingChangeCount(
    sections: number | null | undefined,
    site: readonly string[] | null | undefined,
): number {
    return (sections ?? 0) + (site ?? []).filter(isKind).length;
}
