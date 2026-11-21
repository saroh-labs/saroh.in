import { reservedPathFor } from "./page-kinds";
import { checkSite } from "./site-flags";

/**
 * What a page still needs before it shows well on Google and in a share
 * (plan 2026-11-18-001 U4, shared with U5's "To fix" column). Pure.
 *
 * - `googleText`: no text of its own for Google, so Google picks a line.
 *   A page kept off Google (`noindex`) needs none.
 * - `shareImage`: no share image, its own or the site's, so a WhatsApp or
 *   Instagram share shows no picture.
 * - `brokenLink`: a button or link on it opens no page of this site, the
 *   same rule the pre-publish check uses (`site-flags.ts`).
 * - `hiddenByRoute`: it sits at a built-in route's link (/book, /checkout,
 *   …), so the route answers there and visitors never see the page; the
 *   pre-publish check's `reservedAddress`. `hiddenBehind` says which.
 *
 * A hidden page is not on the live site, so it raises nothing, as in
 * `checkSite`. Slow photos join in batch 5.
 */
export const PAGE_HEALTH_ISSUES = [
    "googleText",
    "shareImage",
    "brokenLink",
    "hiddenByRoute",
] as const;
export type PageHealthIssue = (typeof PAGE_HEALTH_ISSUES)[number];

export interface PageHealthPage {
    id: string;
    title: string;
    path: string;
    hidden: boolean;
    kind?: string;
    inMenu?: boolean;
    noindex: boolean;
    seoDescription: string | null;
    shareImageUrl: string | null;
    shareImageMediaId: string | null;
    /** The latest draft's sections. */
    sections: { type: string; content: unknown; hidden: boolean }[];
}

export interface PageHealth {
    pageId: string;
    title: string;
    path: string;
    issues: PageHealthIssue[];
    /** With `hiddenByRoute`: the route the page is hidden behind. */
    hiddenBehind?: { root: string; name: string; purpose: string };
}

/** Every visible page with something to fix, in the order given. */
export function pageHealth(
    pages: readonly PageHealthPage[],
    site: { socialImageUrl: string | null },
): PageHealth[] {
    const flags = checkSite({
        pages: [...pages],
        // Only the link and address checks are read here; the rest are not asked.
        navigation: null,
        seoDescription: "-",
        published: false,
        hasUnpublishedChanges: false,
    });
    const flagged = (type: string) =>
        new Set(
            flags
                .filter((f) => f.type === type && f.pageId !== null)
                .map((f) => f.pageId),
        );
    const broken = flagged("brokenLink");
    const hidden = flagged("reservedAddress");
    const siteImage = (site.socialImageUrl ?? "").trim() !== "";
    return pages
        .filter((page) => !page.hidden)
        .map((page) => {
            const issues: PageHealthIssue[] = [];
            if (!page.noindex && (page.seoDescription ?? "").trim() === "") {
                issues.push("googleText");
            }
            const ownImage =
                (page.shareImageUrl ?? "").trim() !== "" ||
                page.shareImageMediaId !== null;
            if (!ownImage && !siteImage) issues.push("shareImage");
            if (broken.has(page.id)) issues.push("brokenLink");
            const behind = hidden.has(page.id)
                ? reservedPathFor(page.path)
                : null;
            if (behind) issues.push("hiddenByRoute");
            return {
                pageId: page.id,
                title: page.title,
                path: page.path,
                issues,
                ...(behind
                    ? {
                          hiddenBehind: {
                              root: behind.root,
                              name: behind.name,
                              purpose: behind.purpose,
                          },
                      }
                    : {}),
            };
        })
        .filter((p) => p.issues.length > 0);
}
