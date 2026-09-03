import { BadRequestException } from "@nestjs/common";

/**
 * The site menu (#206).
 *
 * There was no navigation model. A site had pages and no menu, so a visitor
 * who landed on the home page could reach /about only by typing it — and two
 * of the nine pre-publish flags sat unrunnable, disclosed on the check screen
 * as "Saroh does not manage your navigation yet".
 *
 * SITE-LEVEL, NOT A SECTION. A menu that were a section would have to be added
 * to every page and kept in step by hand; this lives on the Site, once.
 *
 * BY ID, NOT BY PATH. An item names a page by id, so renaming or moving the
 * page cannot orphan its entry. The path and the default label are resolved
 * into the snapshot at publish, over the pages that will actually be in it —
 * a hidden page resolves to nothing and the flag engine has already said so.
 */

export interface SiteNavigationItem {
    pageId: string;
    /** Absent means "use the page's title". */
    label?: string;
}

export interface SiteNavigation {
    items: SiteNavigationItem[];
}

/** Twelve is already more than a phone menu wants; beyond it is a sitemap. */
export const NAVIGATION_MAX_ITEMS = 12;

/**
 * Parse a stored or submitted menu, or null for "no menu".
 *
 * Duplicates collapse to their first occurrence rather than throwing — two
 * entries for one page is a slip, not a bug worth a 400 — but a malformed
 * shape or an over-long menu is rejected, on the same reasoning as style and
 * footer: quietly storing nothing would hide a client bug until a merchant
 * noticed their menu had never saved.
 */
export function parseSiteNavigation(input: unknown): SiteNavigation | null {
    if (input === null || input === undefined) return null;
    if (typeof input !== "object" || Array.isArray(input)) {
        throw new BadRequestException(
            "navigation must be an object with an items array, or null.",
        );
    }
    const raw = (input as { items?: unknown }).items;
    if (raw === undefined || raw === null) return null;
    if (!Array.isArray(raw)) {
        throw new BadRequestException("navigation.items must be an array.");
    }
    if (raw.length > NAVIGATION_MAX_ITEMS) {
        throw new BadRequestException(
            `A menu can hold at most ${NAVIGATION_MAX_ITEMS} entries.`,
        );
    }
    const seen = new Set<string>();
    const items: SiteNavigationItem[] = [];
    for (const entry of raw) {
        if (entry === null || typeof entry !== "object") {
            throw new BadRequestException("Each menu entry must name a page.");
        }
        const pageId = (entry as { pageId?: unknown }).pageId;
        if (typeof pageId !== "string" || pageId.trim() === "") {
            throw new BadRequestException("Each menu entry must name a page.");
        }
        if (seen.has(pageId)) continue;
        seen.add(pageId);
        const label = (entry as { label?: unknown }).label;
        if (
            label !== undefined &&
            label !== null &&
            typeof label !== "string"
        ) {
            throw new BadRequestException("A menu label must be text.");
        }
        const trimmed = typeof label === "string" ? label.trim() : "";
        if (trimmed.length > 60) {
            throw new BadRequestException(
                "A menu label must be at most 60 characters.",
            );
        }
        items.push(trimmed ? { pageId, label: trimmed } : { pageId });
    }
    return items.length ? { items } : null;
}

/** What the renderer draws: resolved, over the pages the snapshot holds. */
export interface PublishedNavigationItem {
    label: string;
    href: string;
}

/**
 * Resolve a menu against the pages being published. An entry whose page is
 * hidden or gone is dropped — the flag engine surfaced it before publish, and
 * a dead entry on a live menu is the failure this whole model exists to stop.
 */
export function resolveSiteNavigation(
    navigation: SiteNavigation | null,
    pages: readonly { id: string; path: string; title: string }[],
): PublishedNavigationItem[] {
    if (!navigation) return [];
    const byId = new Map(pages.map((p) => [p.id, p]));
    const out: PublishedNavigationItem[] = [];
    for (const item of navigation.items) {
        const page = byId.get(item.pageId);
        if (!page) continue;
        out.push({ label: item.label ?? page.title, href: page.path });
    }
    return out;
}
