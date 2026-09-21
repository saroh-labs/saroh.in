"use client";

import { pagePathResolver, toRendered } from "@saroh/block-contract";
import type {
    Section as RenderedSection,
    SiteFooterContent,
} from "@saroh/site-blocks";
import {
    PageSections,
    SiteFooter,
    SiteHeader,
    SiteTheme,
} from "@saroh/site-blocks";
import { cn } from "@saroh/ui/lib/utils";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";

import { SECTION_LABELS } from "@/components/sites/editor-constants";

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
    chrome,
    selectedChrome,
    onSelectChrome,
    notesByKey,
    onOpenNotes,
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
    /**
     * The site's header and footer (#336), drawn around the page by the same
     * components the live site uses. Omitted, the page is drawn alone.
     */
    chrome?: {
        name: string;
        navigation: { label: string; href: string }[];
        /** Already sanitized by the API (`footerPreview`). */
        footer: SiteFooterContent | null;
    };
    /** Which of the header or footer is selected, if either. */
    selectedChrome?: "header" | "footer" | null;
    onSelectChrome?: (part: "header" | "footer") => void;
    /** Open notes per section key, for the pins. */
    notesByKey?: ReadonlyMap<string, number>;
    /** A pin was pressed: select that block and show its feedback. */
    onOpenNotes?: (index: number) => void;
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

    const editing = onSelect !== undefined;
    const count = visible.length;

    const page =
        visible.length === 0 ? (
            <p className="rounded-[var(--site-radius)] border border-dashed p-8 text-center text-sm text-[hsl(var(--site-muted))]">
                {sections.length === 0
                    ? "No blocks yet. Add one to see it here."
                    : /*
                       * Distinguishing the two empties matters: "you have not
                       * built anything" and "you have hidden everything you
                       * built" call for opposite next moves, and the second is
                       * recoverable from the list one click away.
                       */
                      "Every block on this page is hidden, so visitors would see an empty page."}
            </p>
        ) : (
            visible.map(({ section, index }, position) => {
                const rendered = (
                    <PageSections
                        sections={[toRenderedSection(section, resolvePage)]}
                    />
                );
                if (!editing) return <div key={index}>{rendered}</div>;
                const label = SECTION_LABELS[section.type];
                return (
                    <CanvasBlock
                        key={index}
                        index={index}
                        label={label}
                        name={`${label} block, ${position + 1} of ${count}`}
                        selected={selectedIndex === index}
                        onSelect={() => onSelect(index)}
                        notes={
                            section.key === undefined
                                ? 0
                                : (notesByKey?.get(section.key) ?? 0)
                        }
                        onOpenNotes={() => onOpenNotes?.(index)}
                    >
                        {rendered}
                    </CanvasBlock>
                );
            })
        );

    /*
     * The header and footer are selectable when editing, but carry a lock:
     * they are on every page, so no one page moves or removes them.
     */
    const header = chrome ? (
        <SiteHeader name={chrome.name} navigation={chrome.navigation} />
    ) : null;
    const footer = chrome?.footer ? (
        <SiteFooter footer={chrome.footer} />
    ) : null;

    return (
        <div
            className={`${PREVIEW_SCOPE} bg-[hsl(var(--site-bg))] text-[hsl(var(--site-fg))]`}
            /*
             * Nothing on the canvas navigates while editing. A link here is
             * the merchant's link to THEIR site; followed from the editor it
             * lands somewhere in Saroh, which is never what the click meant.
             * A click selects; Preview is where links are for following.
             */
            onClickCapture={
                editing
                    ? (e) => {
                          if ((e.target as HTMLElement).closest("a")) {
                              e.preventDefault();
                          }
                      }
                    : undefined
            }
        >
            <SiteTheme variables={vars} selector={`.${PREVIEW_SCOPE}`} />
            {header && editing && onSelectChrome ? (
                <CanvasBlock
                    label="Header"
                    name="Header, on every page"
                    locked
                    selected={selectedChrome === "header"}
                    onSelect={() => onSelectChrome("header")}
                >
                    {header}
                </CanvasBlock>
            ) : (
                header
            )}
            <div className="space-y-4 p-[var(--site-page-margin)]">{page}</div>
            {footer && editing && onSelectChrome ? (
                <CanvasBlock
                    label="Footer"
                    name="Footer, on every page"
                    locked
                    selected={selectedChrome === "footer"}
                    onSelect={() => onSelectChrome("footer")}
                >
                    {footer}
                </CanvasBlock>
            ) : (
                footer
            )}
        </div>
    );
}

/**
 * One block on the canvas, as something that can be selected (#336).
 *
 * The frame is a plain div with a click, not a <button>: a block holds
 * headings, links and form fields, and nesting those inside a button is
 * invalid. The keyboard way in is the label chip, which IS a button — always
 * in the tab order, shown on hover, focus and selection — named like "Hero
 * block, 2 of 7" so a screen reader hears where it is on the page.
 */
function CanvasBlock({
    index,
    label,
    name,
    selected,
    locked = false,
    notes = 0,
    onSelect,
    onOpenNotes,
    children,
}: {
    /** Position in the page's block list, so the editor can scroll to it. */
    index?: number;
    label: string;
    /** The accessible name: what it is and where it sits. */
    name: string;
    selected: boolean;
    locked?: boolean;
    /** Open notes on this block; a pin shows when there are any. */
    notes?: number;
    onSelect: () => void;
    onOpenNotes?: () => void;
    children: ReactNode;
}) {
    return (
        <div
            data-block-index={index}
            onClick={onSelect}
            /*
             * Joined by hand, not through `cn`: tailwind-merge reads
             * `outline` and `outline-2` as the same property and drops the
             * first, which leaves an outline with no style — invisible.
             */
            className={`group/block relative cursor-pointer outline outline-offset-[-2px] transition-[outline-color] duration-fast ${
                selected
                    ? "outline-2 outline-highlight"
                    : "outline-1 outline-transparent hover:outline-highlight/50"
            }`}
        >
            {children}
            <button
                type="button"
                aria-label={selected ? `${name}, selected` : name}
                aria-pressed={selected}
                onClick={(e) => {
                    e.stopPropagation();
                    onSelect();
                }}
                className={cn(
                    "absolute left-0 top-0 z-10 flex items-center gap-1 rounded-br-md bg-highlight px-2 py-0.5 font-sans text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-highlight-foreground transition-opacity duration-fast focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected
                        ? "opacity-100"
                        : "opacity-0 group-hover/block:opacity-100",
                )}
            >
                {locked ? <Lock aria-hidden className="size-3" /> : null}
                {label}
            </button>
            {notes > 0 && onOpenNotes ? (
                <button
                    type="button"
                    aria-label={`${notes} open on this block — read the feedback`}
                    onClick={(e) => {
                        e.stopPropagation();
                        onOpenNotes();
                    }}
                    className="absolute right-3 top-3 z-10 flex size-6 items-center justify-center rounded-full bg-highlight font-sans text-xs font-semibold tabular-nums text-highlight-foreground shadow-md ring-2 ring-background focus-visible:outline-none focus-visible:ring-ring"
                >
                    {notes}
                </button>
            ) : null}
        </div>
    );
}
