import { formatList } from "@/lib/home/needs";
import { fixedAddress } from "@/lib/sites/page-menu";
import type {
    SiteOverview,
    SitePage,
    UpdatePageInput,
} from "@/lib/sites/service";

/**
 * What Pages and its page settings sheet say (plan 2026-11-18-001 U5,
 * WXPPages, WXPPageSheet, RULES §1). Pure, so the words are tested apart
 * from the screens that draw them.
 */

export type PageIssue = SiteOverview["needsDoing"][number]["issues"][number];

/** The To fix column (WXPPages), one issue per page in this order. */
export const ISSUE_WORDS: Record<PageIssue, string> = {
    googleText: "No text for Google",
    shareImage: "No share image",
    brokenLink: "Broken link",
};

/** Where Google cuts a title and a text (guidance, never a block). */
export const GOOGLE_TITLE_GUIDE = 60;
export const GOOGLE_TEXT_GUIDE = 160;

/** "43 of 60 · a good length"; over the guide, "Google may cut it". */
export function lengthHint(n: number, guide: number): string {
    if (n > guide) return `${n} of ${guide} · Google may cut it`;
    if (n >= Math.round(guide * 0.4)) return `${n} of ${guide} · a good length`;
    return `${n} of ${guide}`;
}

/** A module page's tag (WXPPages): its contents come from the business. */
export function madeFrom(page: Pick<SitePage, "kind">): string | null {
    switch (page.kind) {
        case "SHOP":
            return "From your products";
        case "JOURNAL":
            return "From your posts";
        case "BOOK":
            return "From your services";
        default:
            return null;
    }
}

/** The sheet's fields as typed. */
export interface PageDraft {
    title: string;
    path: string;
    seoTitle: string;
    seoDescription: string;
    shareImageMediaId: string | null;
    shareImageUrl: string | null;
    inMenu: boolean;
    hidden: boolean;
    /** "Show on Google": the inverse of `noindex`. */
    onGoogle: boolean;
}

export function draftOf(page: SitePage): PageDraft {
    return {
        title: page.title,
        path: page.path,
        seoTitle: page.seoTitle ?? "",
        seoDescription: page.seoDescription ?? "",
        shareImageMediaId: page.shareImageMediaId ?? null,
        shareImageUrl: page.shareImageUrl ?? null,
        inMenu: page.inMenu !== false,
        hidden: page.hidden,
        onGoogle: page.noindex !== true,
    };
}

/**
 * Only what changed, as the API takes it: an omitted field is left alone.
 * A blank title is not sent (the API refuses one); a blank Google title or
 * text clears it, so the site's own is used.
 */
export function pageChanges(page: SitePage, d: PageDraft): UpdatePageInput {
    const out: UpdatePageInput = {};
    const title = d.title.trim();
    if (title !== "" && title !== page.title) out.title = title;
    const path = d.path.trim();
    if (fixedAddress(page) === null && path !== "" && path !== page.path) {
        out.path = path;
    }
    const seoTitle = d.seoTitle.trim() || null;
    if (seoTitle !== (page.seoTitle ?? null)) out.seoTitle = seoTitle;
    const seoDescription = d.seoDescription.trim() || null;
    if (seoDescription !== (page.seoDescription ?? null)) {
        out.seoDescription = seoDescription;
    }
    if (
        d.shareImageMediaId !== (page.shareImageMediaId ?? null) ||
        d.shareImageUrl !== (page.shareImageUrl ?? null)
    ) {
        // The API takes the photo's address from the library itself.
        if (d.shareImageMediaId) out.shareImageMediaId = d.shareImageMediaId;
        else if (d.shareImageUrl) out.shareImageUrl = d.shareImageUrl;
        else out.shareImageMediaId = null;
    }
    if (!page.isHome) {
        if (d.inMenu !== (page.inMenu !== false)) out.inMenu = d.inMenu;
        if (d.hidden !== page.hidden) out.hidden = d.hidden;
    }
    if (d.onGoogle !== (page.noindex !== true)) out.noindex = !d.onGoogle;
    return out;
}

const CHANGE_NAMES: [keyof UpdatePageInput, string][] = [
    ["title", "the title"],
    ["path", "the page link"],
    ["seoTitle", "the title on Google"],
    ["seoDescription", "the text on Google"],
    ["shareImageMediaId", "the share image"],
    ["shareImageUrl", "the share image"],
    ["inMenu", "the menu"],
    ["hidden", "who can see it"],
    ["noindex", "Show on Google"],
];

/** "You changed the page link and the text on Google. They will be lost." */
export function lostWords(changes: UpdatePageInput): string {
    const names = CHANGE_NAMES.filter(([key]) => key in changes)
        .map(([, n]) => n)
        .filter((n, i, all) => all.indexOf(n) === i);
    if (names.length === 0) return "Your changes will be lost.";
    return `You changed ${formatList(names)}. ${
        names.length === 1 ? "It" : "They"
    } will be lost.`;
}

/** "gulmohar.saroh.app/bridal", or the link alone without an address. */
export function pageLink(host: string | null, path: string): string {
    if (!host) return path;
    return path === "/" ? host : `${host}${path}`;
}
