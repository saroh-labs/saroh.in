"use client";

import { pagePathResolver, toRendered } from "@saroh/block-contract";
import type { Section as RenderedSection } from "@saroh/site-blocks";
import { PageSections, SiteTheme } from "@saroh/site-blocks";

import type { Section, SitePage } from "@/lib/sites/service";
import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";
// From the pure module, not the service: `lib/sites/service` reaches for
// `next/headers` and cannot be pulled into a client component.
import { resolveStyleVariables } from "@/lib/sites/style";

/**
 * The editor's live preview of a draft page.
 *
 * WHAT THIS FILE USED TO BE. 362 lines, of which 240 were a second, independent
 * implementation of the six section renderers — a preview that drew the same
 * designs as `saroh.app` in different code. It predicted its own bug in a
 * comment: "a preview using a different rule from the site it previews is a
 * preview that lies about something small on every screen." #189 is that
 * happening: the merchant set a per-section padding, the editor honoured it,
 * and the published site ignored it.
 *
 * The drawing is now `@saroh/site-blocks` — the very components that serve
 * published sites (#252). What remains here is the part that was never
 * duplicated: the editing affordances. Hidden sections filtered out the way
 * publish will drop them, the two empty states, and click-to-select.
 *
 * WHY THE CONTENT IS MAPPED FIRST. A block has two shapes. The editor holds the
 * AUTHORING one, where a button carries an `action`; a component draws the
 * RENDERED one, where it carries a resolved `href`. `toRendered` is the
 * declared, per-block map between them, and it is the same function publish
 * runs — which is the whole point. Gate G7 asserts the two agree.
 */

/**
 * Map a draft section to what a component draws.
 *
 * `contractVersion` is deliberately dropped: it describes how the content was
 * AUTHORED, and both `hero@1` and `hero@2` resolve to the same rendered shape.
 * That is exactly what resolving at publish buys.
 */
/**
 * The class the merchant's tokens are scoped to.
 *
 * A literal, because Tailwind and the selector passed to `SiteTheme` must be
 * the same string and a computed one would silently theme nothing.
 */
const PREVIEW_SCOPE = "site-preview-scope";

function toRenderedSection(
    section: Section,
    resolvePage: (pageId: string) => string | undefined,
): RenderedSection {
    return {
        type: section.type,
        content: toRendered(section.type, section.content, { resolvePage }),
    };
}

export function DraftPreview({
    sections,
    pages,
    style,
    styleOptions,
    selectedIndex,
    onSelect,
}: {
    sections: Section[];
    /**
     * The site's pages, so a button naming one draws the path publish will
     * write. HIDDEN PAGES ARE FILTERED OUT BELOW, because publish builds its
     * resolver from only the pages it will write — a button pointing at a
     * hidden page resolves to nothing there, and a preview that showed a
     * working link would be lying about a page the live site 404s on.
     */
    pages: SitePage[];
    style?: SiteStyle;
    styleOptions?: SiteStyleOptions;
    /** Index into `sections` (not the visible subset) of the open section. */
    selectedIndex?: number | null;
    /**
     * "Clicking a section in the preview selects it; rail and field panel
     * follow" (spec §2). Omitted where the preview is not an editing surface.
     */
    onSelect?: (index: number) => void;
}) {
    /*
     * The merchant's tokens, from the SAME component the live site uses.
     *
     * This used to be an inline `style={vars}` and nothing else, which is
     * correct for a site whose merchant has chosen a palette and wrong for one
     * who has not. `SiteTheme` carries fallback defaults — the stone palette,
     * and a dark variant for a visitor whose OS asks for one — and an unstyled
     * site is rendered by those on the live site. The preview wrote no
     * variables at all in that case, so every `--site-*` resolved to nothing
     * and the block drew on browser defaults: a white page here, the stone or
     * dark palette there, for the same site.
     *
     * Found by putting the two side by side after the renderers were merged
     * (#252 Step 4). It is the #189 shape exactly — a preview honouring
     * something the published page does not — surviving in the one place the
     * merge had not yet reached.
     *
     * SCOPED, not `:root`. The live renderer themes its whole document because
     * that document IS the merchant's site; this one is a panel inside a Saroh
     * screen, and `:root` here would repaint the editor around it.
     */
    const vars =
        style && styleOptions
            ? resolveStyleVariables(style, styleOptions)
            : undefined;

    // Mirrors `buildSnapshot`: the pages this publish would write, not every
    // page the editor knows about.
    const resolvePage = pagePathResolver(pages.filter((p) => !p.hidden));

    /*
     * The preview answers "what will visitors see", so a hidden section is
     * absent here exactly as it will be absent from the published snapshot.
     *
     * The ORIGINAL index travels with each one: filtering renumbers the list,
     * and a click on the third visible section has to select the third section
     * of the real list, not the third of what survived the filter.
     */
    const visible = sections
        .map((section, index) => ({ section, index }))
        .filter(({ section }) => section.hidden !== true);

    if (visible.length === 0) {
        return (
            <div className={PREVIEW_SCOPE}>
                <SiteTheme variables={vars} selector={`.${PREVIEW_SCOPE}`} />
                <p className="rounded-[var(--site-radius)] border border-dashed p-8 text-center text-sm text-[hsl(var(--site-muted))]">
                    {sections.length === 0
                        ? "No sections yet. Add one to preview it here."
                        : /*
                           * Distinguishing the two empties matters: "you have not
                           * built anything" and "you have hidden everything you
                           * built" call for opposite next moves, and the second is
                           * recoverable from the rail one click away.
                           */
                          "Every section on this page is hidden, so visitors would see an empty page."}
                </p>
            </div>
        );
    }
    return (
        <div
            className={`${PREVIEW_SCOPE} space-y-4 rounded-[var(--site-radius)] bg-[hsl(var(--site-bg))] p-[var(--site-page-margin)] text-[hsl(var(--site-fg))]`}
        >
            <SiteTheme variables={vars} selector={`.${PREVIEW_SCOPE}`} />
            {visible.map(({ section, index }) =>
                onSelect === undefined ? (
                    <PageSections
                        key={index}
                        sections={[toRenderedSection(section, resolvePage)]}
                    />
                ) : (
                    /*
                     * A plain div with a click, not a <button>: a section holds
                     * headings, links and form fields, and nesting those inside
                     * a button is invalid and breaks the keyboard. The rail is
                     * the keyboard-reachable way to select a section; this is
                     * the pointer shortcut for what you can already see.
                     */
                    <div
                        key={index}
                        onClick={() => onSelect(index)}
                        className={`cursor-pointer rounded-[2px] outline-offset-2 transition-[outline-color] ${
                            selectedIndex === index
                                ? "outline outline-1 outline-[#8a5a3c]"
                                : "outline outline-1 outline-transparent hover:outline-[#8a5a3c]/40"
                        }`}
                    >
                        <PageSections
                            sections={[toRenderedSection(section, resolvePage)]}
                        />
                    </div>
                ),
            )}
        </div>
    );
}
