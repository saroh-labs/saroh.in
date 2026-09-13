import { isSectionType, parseRenderedContent } from "@saroh/database";

/** A section a stored publication holds that this build can no longer draw. */
export interface UnrenderableSection {
    /** The page it sits on, as the snapshot names it. */
    path: string;
    /** Its position among that page's sections. */
    index: number;
    /** Its block type, as stored; `""` when the snapshot did not name one. */
    type: string;
}

export interface Renderability {
    renderable: boolean;
    unrenderable: UnrenderableSection[];
}

/**
 * Whether this build can still draw a stored publication (#283, #194).
 *
 * #194 asks that a version whose template can no longer render it "says so
 * rather than rendering incorrectly". Publications do not record the template a
 * site was really built from (every one is stamped with the starter), so that
 * question is answered from the snapshot itself. Each section must name a block
 * type that still exists, and its content must still satisfy that block's
 * RENDERED schema, which is exactly what the components draw.
 *
 * `parseRenderedContent` is meant for tests and the catalog, not the live
 * render path, where re-validating an immutable snapshot would cost every
 * visitor. Version history is not that path: one merchant opens one version.
 *
 * A snapshot this code cannot read at all is not renderable, with no sections
 * listed. There is nothing to point at.
 */
export function checkRenderability(snapshot: unknown): Renderability {
    const pages = (snapshot as { pages?: unknown } | null)?.pages;
    if (!Array.isArray(pages)) return { renderable: false, unrenderable: [] };

    const unrenderable: UnrenderableSection[] = [];
    for (const page of pages) {
        if (page === null || typeof page !== "object") continue;
        const { path, sections } = page as {
            path?: unknown;
            sections?: unknown;
        };
        if (!Array.isArray(sections)) continue;

        sections.forEach((section: unknown, index) => {
            const s = section as { type?: unknown; content?: unknown } | null;
            const type = typeof s?.type === "string" ? s.type : "";
            const drawable =
                isSectionType(type) &&
                parseRenderedContent(type, s?.content).success;
            if (!drawable) {
                unrenderable.push({
                    path: typeof path === "string" ? path : "",
                    index,
                    type,
                });
            }
        });
    }
    return { renderable: unrenderable.length === 0, unrenderable };
}
