import type { CtaAction } from "@saroh/database";
import { ctaHref, parseSectionContent } from "@saroh/database";

import { sanitizeSectionContent } from "./sanitize";

/**
 * How much publishing would actually change (#190, #191).
 *
 * Three surfaces ask this question — the editor's top bar, the settings screen
 * and the sites list — and the epic is explicit that three places showing three
 * different numbers is worse than showing none. So the answer is computed here,
 * once, server-side, and every surface reads it.
 *
 * The count is a diff between the snapshot publishing WOULD write and the
 * snapshot that is currently live. Not "what have I typed since I last saved" —
 * that is the autosave pill's question, and a merchant who saved a draft a week
 * ago and never published it has zero unsaved keystrokes and a whole site's
 * worth of unpublished work.
 */

/** A section exactly as it would appear in a Publication snapshot. */
export interface PublishableSection {
    type: string;
    contractVersion: number;
    content: unknown;
}

/** A page exactly as it would appear in a Publication snapshot. */
export interface PublishablePage {
    path: string;
    title: string;
    isHome: boolean;
    sections: PublishableSection[];
}

/** A draft section as it comes off the database, before sanitizing. */
export interface DraftSectionRow {
    type: string;
    contractVersion: number;
    content: unknown;
}

/**
 * Turn one draft section into the form publish would store, or explain why it
 * cannot be stored at all.
 *
 * Publish and the pending count both go through here, which is the point: a
 * count computed against unsanitized draft content would report a change every
 * time a merchant pasted markup that the sanitizer then flattened to exactly
 * what is already live. The two must see the same bytes.
 */
export function toPublishableSection(
    section: DraftSectionRow,
    resolvePage: (pageId: string) => string | undefined = () => undefined,
): { ok: true; section: PublishableSection } | { ok: false; error: string } {
    const parsed = parseSectionContent(
        section.type,
        section.contractVersion,
        section.content,
    );
    if (!parsed.success) {
        return { ok: false, error: parsed.error.message };
    }
    return {
        ok: true,
        section: {
            type: section.type,
            contractVersion: section.contractVersion,
            content: resolveCtaHrefs(
                sanitizeSectionContent(
                    parsed.data,
                    parsed.contract.sanitizedFields,
                ),
                resolvePage,
            ),
        },
    };
}

/**
 * A v2 button carries an ACTION; the renderer draws an HREF (#207).
 *
 * Resolved here, on the way into the snapshot, for the same reason style is
 * resolved into `--site-*` properties: the snapshot is the site as served, and
 * the renderer must never need the draft tables to draw it. Both publish and
 * the pending count go through this function, so the count is a diff over the
 * same bytes publish writes — a button whose page was renamed counts as
 * changed, because on the live site it did.
 *
 * The action stays in the content beside the resolved href, so a later reader
 * can still tell a call from a link.
 */
function resolveCtaHrefs(
    content: unknown,
    resolvePage: (pageId: string) => string | undefined,
): unknown {
    if (content === null || typeof content !== "object") return content;
    const c = content as Record<string, unknown>;
    const withHref = (cta: unknown): unknown => {
        if (cta === null || typeof cta !== "object") return cta;
        const action = (cta as { action?: unknown }).action;
        if (!action || typeof action !== "object") return cta;
        return {
            ...(cta as Record<string, unknown>),
            href: ctaHref(action as CtaAction, resolvePage),
        };
    };
    if ("action" in c) return withHref(c);
    if ("cta" in c) return { ...c, cta: withHref(c.cta) };
    return content;
}

/**
 * A stringification that does not depend on key order.
 *
 * The live side of the diff comes back from Postgres as parsed JSON, and the
 * draft side is built fresh by the contract parser. Both describe the same
 * section, but nothing guarantees their object keys are in the same order — and
 * a plain `JSON.stringify` would call that a change. A merchant would then see
 * "6 sections changed" on a site they have not touched, which is the exact
 * failure this count exists to prevent: a number nobody believes.
 */
function canonical(value: unknown): string {
    if (value === undefined) return "null";
    if (value === null || typeof value !== "object") {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map(canonical).join(",")}]`;
    }
    const entries = Object.entries(value as Record<string, unknown>)
        // `undefined` is absent, not a value: JSON.stringify drops such keys on
        // the way into the snapshot, so the draft side must drop them too.
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
        .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
        .join(",")}}`;
}

/**
 * The shape a Publication snapshot exposes to this diff.
 *
 * `pages` is `unknown[]`, not a shaped array: the value arrives from a JSON
 * column written by code as old as Stage 2, so declaring the shape here would
 * be an assertion this module cannot make. Each element is narrowed below.
 */
interface SnapshotShape {
    pages?: unknown[];
}

/**
 * Read the live snapshot's sections, keyed by page path.
 *
 * Deliberately forgiving: snapshots are immutable and go back to Stage 2, so a
 * row written by older code may not have the shape current code expects. A
 * malformed page reads as "no sections", which makes its draft counterpart
 * count as entirely new — an over-count on a very old site, rather than a crash
 * on the sites list.
 */
function livePagesByPath(snapshot: unknown): Map<string, PublishableSection[]> {
    const byPath = new Map<string, PublishableSection[]>();
    if (snapshot === null || typeof snapshot !== "object") return byPath;
    const pages = (snapshot as SnapshotShape).pages;
    if (!Array.isArray(pages)) return byPath;
    for (const page of pages) {
        if (page === null || typeof page !== "object") continue;
        const path = (page as { path?: unknown }).path;
        if (typeof path !== "string") continue;
        const sections = (page as { sections?: unknown }).sections;
        byPath.set(
            path,
            Array.isArray(sections) ? (sections as PublishableSection[]) : [],
        );
    }
    return byPath;
}

/**
 * Count the sections publishing would add, remove or change.
 *
 * Positional within a page, because that is the only identity a snapshot
 * carries: `Section.key` is a draft-side concept and was never written into a
 * Publication. Comparing by position means a reorder counts every section it
 * moved — which is honest, since publishing a reorder does change every one of
 * those positions on the live site.
 *
 * A page that exists on one side only contributes all of its sections: adding a
 * page of four sections is four things publishing will do.
 */
export function countPendingSectionChanges(
    draftPages: PublishablePage[],
    snapshot: unknown,
): number {
    const live = livePagesByPath(snapshot);
    let changed = 0;

    for (const page of draftPages) {
        const livePage = live.get(page.path) ?? [];
        live.delete(page.path);
        changed += diffSectionLists(page.sections, livePage);
    }

    // Whatever is left was published and no longer exists in the draft:
    // publishing removes it, which is as much a change as adding it was.
    for (const orphaned of live.values()) {
        changed += orphaned.length;
    }

    return changed;
}

/** Positional diff of two ordered section lists. */
function diffSectionLists(
    next: PublishableSection[],
    previous: PublishableSection[],
): number {
    let changed = Math.abs(next.length - previous.length);
    const shared = Math.min(next.length, previous.length);
    for (let i = 0; i < shared; i += 1) {
        if (canonical(next[i]) !== canonical(previous[i])) changed += 1;
    }
    return changed;
}

/** A draft page as the pending-count query loads it. */
export interface DraftPageRow {
    id: string;
    path: string;
    title: string;
    isHome: boolean;
    /** The page's latest DRAFT version, or empty when it has none. */
    versions: { sections: DraftSectionRow[] }[];
}

/**
 * Build the pages publishing would write, for counting purposes.
 *
 * Mirrors {@link SitesService.publishSite} in the two ways that matter: hidden
 * sections are already excluded by the query (they do not travel into a
 * snapshot), and content goes through {@link toPublishableSection}.
 *
 * Where publish REJECTS an invalid section, this keeps it with its raw content.
 * Counting is a read: it must not throw on a sites list because one draft
 * somewhere holds a section that has gone stale against its contract. Such a
 * section will differ from whatever is live and so count as a change, which is
 * true — and the pre-publish check is what tells the merchant it is broken.
 */
export function toPendingPages(pages: DraftPageRow[]): PublishablePage[] {
    const resolvePage = pagePathResolver(pages);
    return pages.map((page) => ({
        path: page.path,
        title: page.title,
        isHome: page.isHome,
        sections: page.versions.flatMap((version) =>
            version.sections.map((section) => {
                const result = toPublishableSection(section, resolvePage);
                return result.ok
                    ? result.section
                    : {
                          type: section.type,
                          contractVersion: section.contractVersion,
                          content: section.content,
                      };
            }),
        ),
    }));
}

/**
 * Page id → path, over the pages that will be in the snapshot.
 *
 * The caller passes the pages it is about to publish — already filtered to the
 * visible ones — so a button pointing at a hidden page resolves to nothing
 * rather than to a path the live site 404s.
 */
export function pagePathResolver(
    pages: readonly { id: string; path: string }[],
): (pageId: string) => string | undefined {
    const byId = new Map(pages.map((p) => [p.id, p.path]));
    return (pageId) => byId.get(pageId);
}
