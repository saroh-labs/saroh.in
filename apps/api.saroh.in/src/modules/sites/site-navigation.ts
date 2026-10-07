import { BadRequestException } from "@nestjs/common";
import { inPageNavigation, mergeInPageNavigation } from "@saroh/database";

import type { ModulePageKind } from "./page-kinds";
import { isModulePageKind, MODULE_PAGE_KINDS } from "./page-kinds";

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
    /**
     * The module page this entry opens (G14), so the site can take it out of
     * the menu while its module is off (G15, G19) without a republish.
     * Absent for a free-form page, so a menu without module pages is exactly
     * what it was.
     */
    kind?: ModulePageKind;
}

/** A page as the menu needs it. `kind` and `inMenu` absent: FREE and shown. */
export interface NavigablePage {
    id: string;
    path: string;
    title: string;
    kind?: string;
    inMenu?: boolean;
}

/**
 * Resolve a menu against the pages being published.
 *
 * - An entry whose page is hidden or gone is dropped — the flag engine
 *   surfaced it before publish, and a dead entry on a live menu is the
 *   failure this whole model exists to stop.
 * - A page with "Show in menu" off is dropped too (G14): reachable by link,
 *   never listed.
 * - A module page is in the menu while it is shown there (G14), where the
 *   menu puts it, else after the menu's own entries in the kinds' order
 *   (Shop, Book, Prices, Journal, Contact). Its title is its menu name.
 *
 * A site with no module pages resolves exactly as it did before them.
 *
 * **Whether a module is on is not decided here (G19).** Every module page
 * is resolved with its `kind`, whether its module is on or off at publish,
 * and the site drops the entry at view time while the public read says the
 * module is off (`siteMenu` in site-blocks, from `publicModulePageStates`).
 * Dropping it here would freeze the menu at publish: a module turned off
 * would keep its entry until the next publish, and one turned back on would
 * stay missing. A hand-made entry to a free-form page carries no kind, so
 * no module ever takes it out.
 */
export function resolveSiteNavigation(
    navigation: SiteNavigation | null,
    pages: readonly NavigablePage[],
): PublishedNavigationItem[] {
    const byId = new Map(pages.map((p) => [p.id, p]));
    const out: PublishedNavigationItem[] = [];
    const listed = new Set<string>();
    for (const item of navigation?.items ?? []) {
        const page = byId.get(item.pageId);
        if (!page) continue;
        listed.add(page.id);
        if (page.inMenu === false) continue;
        out.push(
            isModulePageKind(page.kind)
                ? { label: page.title, href: page.path, kind: page.kind }
                : { label: item.label ?? page.title, href: page.path },
        );
    }
    const modulePages = pages
        .filter(
            (p): p is NavigablePage & { kind: ModulePageKind } =>
                isModulePageKind(p.kind) &&
                p.inMenu !== false &&
                !listed.has(p.id),
        )
        .sort(
            (a, b) =>
                MODULE_PAGE_KINDS.indexOf(a.kind) -
                MODULE_PAGE_KINDS.indexOf(b.kind),
        );
    for (const page of modulePages) {
        out.push({ label: page.title, href: page.path, kind: page.kind });
    }
    return out;
}

/**
 * The menu with the home page's own sections in front (industry templates,
 * polish pass): each home-page section with a link name and a menu label is
 * an entry, `/#anchor`, in page order — "Today's bread · Visit · Journal",
 * as a one-page design's header reads. The page entries follow, so a site
 * keeps every page it listed. Resolved at publish over the sections being
 * written, like the rest of the menu: a hidden section is not in them, so
 * its entry is simply absent.
 *
 * A section's label is the merchant's (or their template's) choice, made
 * in the section's own inspector, so there is no separate switch for this.
 *
 * A section entry with the same label as a page entry is left out: the
 * page is the fuller version, and "Timetable · … · Timetable" reads as a
 * mistake (`mergeInPageNavigation`). A module page shadows its section only
 * in the header, at view time, since its entry leaves the menu while its
 * module is off.
 */
export function withInPageNavigation(
    menu: readonly PublishedNavigationItem[],
    homeSections: readonly { content: unknown }[],
): PublishedNavigationItem[] {
    return mergeInPageNavigation(inPageNavigation(homeSections), menu, {
        shadowsOnlyAlways: true,
    });
}
