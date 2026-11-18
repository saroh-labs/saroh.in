import { reservedPathFor } from "./page-kinds";

/**
 * Old page links that forward (KTD-3). Pure: what the database holds goes in,
 * what to write comes out, so every rule here is tested without Postgres.
 *
 * Invariants the rules keep: an old link is never also a page (the page
 * wins), every forward lands on a page (so no chain and no loop can form),
 * and a page link changed before it ever went live leaves nothing behind
 * (nobody has that link).
 */

/** A forward as the draft holds it. */
export interface RedirectRow {
    id: string;
    fromPath: string;
    toPath: string;
}

/** A forward as a Publication snapshot carries it (`snapshot.redirects`). */
export interface SnapshotRedirect {
    from: string;
    to: string;
}

/** What a page's link change does to the site's forwards. */
export interface PageMovePlan {
    /** The old link to start forwarding, when it was live. */
    create: SnapshotRedirect | null;
    /** Forwards that pointed at the old link, now pointed at the new one. */
    retarget: string[];
    /** Forwards to take out: their old link is the page's link now. */
    remove: string[];
}

/**
 * A page moved from `oldPath` to `newPath`. `oldPathIsLive` says whether the
 * live site serves a page at `oldPath`; only then does anyone hold that link.
 *
 * Chains collapse here (A→B, then B→C, leaves A→C), and renaming a page back
 * to its live link leaves no forward at all.
 */
export function planPageMove(input: {
    redirects: readonly RedirectRow[];
    oldPath: string;
    newPath: string;
    oldPathIsLive: boolean;
}): PageMovePlan {
    const { redirects, oldPath, newPath } = input;
    const remove = redirects
        .filter((r) => r.fromPath === newPath)
        .map((r) => r.id);
    const retarget = redirects
        .filter((r) => r.toPath === oldPath && r.fromPath !== newPath)
        .map((r) => r.id);
    const taken = redirects.some(
        (r) => r.fromPath === oldPath && !remove.includes(r.id),
    );
    return {
        create:
            input.oldPathIsLive && !taken && oldPath !== newPath
                ? { from: oldPath, to: newPath }
                : null,
        retarget,
        remove,
    };
}

/**
 * Why the merchant's own forward from `fromPath` to `toPath` can't be made,
 * in words they can act on, or null when it can. `pagePaths` are the site's
 * pages.
 */
export function ownRedirectProblem(
    fromPath: string,
    toPath: string,
    pagePaths: ReadonlySet<string>,
): string | null {
    if (fromPath === toPath) {
        return "An old link can't forward to itself. Pick the page it should open.";
    }
    const reserved = reservedPathFor(fromPath);
    if (reserved) {
        return `${reserved.root} is ${reserved.purpose}, so it can't forward to a page.`;
    }
    if (pagePaths.has(fromPath)) {
        return `${fromPath} is a page on your site, so it can't forward somewhere else. Change that page's link first.`;
    }
    if (!pagePaths.has(toPath)) {
        return `${toPath} isn't a page on your site. Pick one of your pages for the old link to open.`;
    }
    return null;
}

/**
 * The forwards a publish writes: only those that land on a page this publish
 * serves, and never one shadowing a page. Sorted, so the same forwards are
 * the same bytes in every snapshot.
 */
export function snapshotRedirects(
    // Defaulted for a draft loaded by an older select (spec fixtures).
    rows: readonly { fromPath: string; toPath: string }[] = [],
    pagePaths: ReadonlySet<string>,
): SnapshotRedirect[] {
    return rows
        .filter((r) => pagePaths.has(r.toPath) && !pagePaths.has(r.fromPath))
        .map((r) => ({ from: r.fromPath, to: r.toPath }))
        .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
}

/** The page links a snapshot serves; empty for a malformed one. */
export function snapshotPagePaths(snapshot: unknown): Set<string> {
    const pages =
        snapshot !== null && typeof snapshot === "object"
            ? (snapshot as { pages?: unknown }).pages
            : undefined;
    const paths = new Set<string>();
    if (!Array.isArray(pages)) return paths;
    for (const page of pages) {
        const path =
            page !== null && typeof page === "object"
                ? (page as { path?: unknown }).path
                : undefined;
        if (typeof path === "string") paths.add(path);
    }
    return paths;
}

/** The forwards a snapshot carries; empty for one from before them. */
export function snapshotRedirectList(snapshot: unknown): SnapshotRedirect[] {
    const list =
        snapshot !== null && typeof snapshot === "object"
            ? (snapshot as { redirects?: unknown }).redirects
            : undefined;
    if (!Array.isArray(list)) return [];
    return list.filter(
        (r): r is SnapshotRedirect =>
            r !== null &&
            typeof r === "object" &&
            typeof (r as SnapshotRedirect).from === "string" &&
            typeof (r as SnapshotRedirect).to === "string",
    );
}
