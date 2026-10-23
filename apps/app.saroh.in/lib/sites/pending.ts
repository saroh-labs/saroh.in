import { count } from "@/lib/format/plural";
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
    "icon",
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
    icon: "the site icon",
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
        parts.push(count(sections, "section"));
    }
    for (const kind of site ?? []) {
        if (isKind(kind)) parts.push(LABELS[kind]);
    }
    return parts.length > 0 ? joinList(parts) : null;
}

/** The same kinds in the fewest words, for the editor's status pill (G2). */
const SHORT_LABELS: Record<SiteChangeKind, string> = {
    name: "site name",
    search: "search",
    shareImage: "share image",
    icon: "site icon",
    posts: "blog address",
    // The style is edited in the rail's Brand tab (G2), so the pill uses the
    // word on that tab.
    style: "brand",
    footer: "footer",
    menu: "menu",
    pages: "pages",
};

/**
 * "2 blocks, brand, footer", or `null` when nothing is waiting: what follows
 * "Not published ·" in the editor's pill (G2). The long form above is for
 * sentences. This one sits in an uppercase pill, so it lists rather than
 * joining with "and", and says blocks, as the rest of the editor does.
 */
export function shortPendingChanges(
    sections: number | null | undefined,
    site: readonly string[] | null | undefined,
): string | null {
    const parts: string[] = [];
    if (sections && sections > 0) {
        parts.push(count(sections, "block"));
    }
    for (const kind of site ?? []) {
        if (isKind(kind)) parts.push(SHORT_LABELS[kind]);
    }
    return parts.length > 0 ? parts.join(", ") : null;
}

/** How many things publishing would change: sections plus site-level settings. */
export function pendingChangeCount(
    sections: number | null | undefined,
    site: readonly string[] | null | undefined,
): number {
    return (sections ?? 0) + (site ?? []).filter(isKind).length;
}

/** Each site-level area as a row of the Publish sheet: its name, what changed. */
const AREA_ROWS: Record<SiteChangeKind, { area: string; detail: string }> = {
    name: { area: "Site name", detail: "Changed" },
    search: { area: "Search", detail: "Search title or description changed" },
    shareImage: { area: "Share image", detail: "Changed" },
    icon: { area: "Site icon", detail: "Changed" },
    posts: { area: "Blog address", detail: "Changed" },
    style: { area: "Style", detail: "Look, colours and type" },
    footer: { area: "Footer", detail: "Changed" },
    menu: { area: "Menu", detail: "Changed" },
    pages: { area: "Pages", detail: "Added, removed or renamed" },
};

/**
 * What publishing puts live, one row per area (DEC-185): the blocks the
 * server counted, then each site-level setting. The API counts blocks for
 * the whole site, not per page, so blocks are one row.
 */
export function pendingAreas(
    sections: number | null | undefined,
    site: readonly string[] | null | undefined,
): { area: string; detail: string }[] {
    const rows: { area: string; detail: string }[] = [];
    if (sections && sections > 0) {
        rows.push({
            area: "Blocks",
            detail: `${count(sections, "block")} changed`,
        });
    }
    for (const kind of site ?? []) {
        if (isKind(kind)) rows.push(AREA_ROWS[kind]);
    }
    return rows;
}
