"use client";

import { pagePathResolver, toRendered } from "@saroh/block-contract";
import type {
    EditableTextHost,
    Section as RenderedSection,
    SiteFooterContent,
} from "@saroh/site-blocks";
import {
    EditableTextContext,
    lookOf,
    lookScope,
    ModulePageTop,
    modulePageTopOf,
    PageSections,
    SiteFooter,
    SiteHeader,
    SiteTheme,
} from "@saroh/site-blocks";
import { cn } from "@saroh/ui/lib/utils";
import { showInfo } from "@saroh/ui/toast";
import type { LucideIcon } from "lucide-react";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";

import {
    SECTION_ICONS,
    SECTION_LABELS,
} from "@/components/sites/editor/editor-constants";
import { TeamEmptyOnCanvas } from "@/components/sites/editor/inspector/team-empty";
import { useEditorReadOnly } from "@/components/sites/editor/read-only";
import { env } from "@/env";
import { merchantLinkUrl, previewLinkTarget } from "@/lib/sites/merchant-link";
import { isEmptyTeam } from "@/lib/sites/team-people";

import { useSiteFaces } from "@/components/sites/looks/site-faces";
import type { Section, SitePage } from "@/lib/sites/service";
import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";
// From the pure module, not the service: `lib/sites/service` reaches for
// `next/headers` and cannot be pulled into a client component.
import type { SelectedElement, StyleScope } from "@/lib/sites/element-style";
import {
    elementMark,
    parseElementMark,
    stampElements,
} from "@/lib/sites/element-style";
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

/** What a form sent on a draft says: it went nowhere (G5). */
export const FORM_NOT_SENT = "Preview, not sent";
export const FORM_NOT_SENT_DETAIL = "Forms send from your live site.";

function toRenderedSection(
    section: Section,
    resolvePage: (pageId: string) => string | undefined,
    stamp = false,
): RenderedSection {
    const content = toRendered(section.type, section.content, { resolvePage });
    return {
        type: section.type,
        // On the editing canvas each button and photo carries its place,
        // so a click on it selects it (DEC-253).
        content: stamp ? stampElements(content) : content,
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
    changedByKey,
    markByKey,
    onOpenNotes,
    siteAddress,
    siteId,
    onOpenPage,
    onFormBlocked,
    page: current = null,
    blockTools,
    headerTools,
    textEdit,
    selectedElement = null,
    elementScope = "element",
    onSelectElement,
}: {
    /** The button or photo selected in the selected section (DEC-253). */
    selectedElement?: SelectedElement | null;
    /** Its Apply to: what the page outlines as moving with it (CSScope). */
    elementScope?: StyleScope;
    /** A click on a button or photo: select its section and it. */
    onSelectElement?: (index: number, element: SelectedElement) => void;
    /** A phone's toolbar on the selected block (DEC-185). */
    blockTools?: (index: number) => ReactNode;
    /** On the header while it is selected: its menu edited in place (H1). */
    headerTools?: ReactNode;
    /**
     * Typing on the page (U47d): the host the selected section's marked
     * words write through. Absent, or for a section it has none for, the
     * words are only drawn.
     */
    textEdit?: (index: number) => EditableTextHost | undefined;
    /**
     * The page being drawn. A module page's title (DEC-073 #9) is drawn
     * above its blocks as the live site draws it, and its rich-text intro
     * lines up with the cards. Omitted, the blocks alone.
     */
    page?: Pick<SitePage, "kind" | "title"> | null;
    /**
     * The site being drawn, so blocks that read live data (Visit us, G8)
     * show the real values on the canvas. Omitted, they say where the real
     * values come from instead.
     */
    siteId?: string;
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
    /** Changed since live, per section key: a reader's marks (`fix/WXMReviewer`). */
    changedByKey?: ReadonlyMap<string, string>;
    /**
     * Words marked on a block of a preview that is not edited, by section
     * key: History's Compare numbers its differences there (D3).
     */
    markByKey?: ReadonlyMap<string, string>;
    /** A pin was pressed: select that block and show its feedback. */
    onOpenNotes?: (index: number) => void;
    /** The merchant's site address, which the page's links open on. */
    siteAddress?: string | null;
    /**
     * Preview in the editor (G5): a link to one of the site's pages opens it
     * here instead of in a tab. Omitted, every link opens on the site.
     */
    onOpenPage?: (page: SitePage) => void;
    /**
     * A form was sent and stopped, since nothing here ever submits. Omitted,
     * a toast says so.
     */
    onFormBlocked?: () => void;
}) {
    // The merchant faces the editor loaded, for the site's typeface.
    const faces = useSiteFaces();
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
    const top = current ? modulePageTopOf(current) : null;
    /*
     * The draft's look (DEC-172, U16), drawn as publishing will: its
     * tokens, header, footer and block layouts. The owner's own view, so
     * a block may say what is missing ("No photo yet"); a visitor never
     * sees that. Absent is Classic, exactly as before.
     */
    const look = lookOf(style?.look);
    const vars =
        style && styleOptions
            ? resolveStyleVariables(style, styleOptions)
            : undefined;

    // Mirrors `buildSnapshot`: the pages this publish would write, not every
    // page the editor knows about.
    const shown = pages.filter((p) => !p.hidden);
    const resolvePage = pagePathResolver(shown);

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
                        sections={[
                            toRenderedSection(
                                section,
                                resolvePage,
                                onSelectElement !== undefined,
                            ),
                        ]}
                        siteId={siteId}
                        // The API this app talks to, so the canvas reads the
                        // same place as the site it is drawing; unset, the
                        // block's own default (production) applies.
                        apiUrl={env.NEXT_PUBLIC_API_URL}
                        modulePage={top !== null}
                        // For a closing band whose content gives no heading.
                        siteName={chrome?.name}
                        look={look}
                        isOwnerPreview
                    />
                );
                if (!editing) {
                    const mark =
                        section.key === undefined
                            ? undefined
                            : markByKey?.get(section.key);
                    return (
                        <div
                            key={index}
                            className={mark ? "relative" : undefined}
                        >
                            {rendered}
                            {mark ? (
                                // A success outline with its number in a circle
                                // at the top right (D3, `WXEHistory`), doubled:
                                // Compare draws the page at about half size.
                                <span
                                    data-compare-mark=""
                                    className="pointer-events-none absolute inset-0 z-10 ring-4 ring-inset ring-success"
                                >
                                    <span
                                        aria-hidden
                                        className="absolute right-4 top-4 grid size-12 place-items-center rounded-full bg-success font-sans text-2xl font-semibold text-success-foreground"
                                    >
                                        {mark.split(" · ")[0]}
                                    </span>
                                    <span className="sr-only">{mark}</span>
                                </span>
                            ) : null}
                        </div>
                    );
                }
                const label = SECTION_LABELS[section.type];
                const host =
                    selectedIndex === index ? textEdit?.(index) : undefined;
                return (
                    <CanvasBlock
                        key={index}
                        index={index}
                        label={label}
                        icon={SECTION_ICONS[section.type]}
                        name={`${label} section, ${position + 1} of ${count}`}
                        selected={selectedIndex === index}
                        onSelect={() => onSelect(index)}
                        onSelectElement={
                            onSelectElement
                                ? (el) => onSelectElement(index, el)
                                : undefined
                        }
                        element={
                            selectedIndex === index ? selectedElement : null
                        }
                        elementScope={elementScope}
                        notes={
                            section.key === undefined
                                ? 0
                                : (notesByKey?.get(section.key) ?? 0)
                        }
                        onOpenNotes={() => onOpenNotes?.(index)}
                        changed={
                            section.key === undefined
                                ? undefined
                                : changedByKey?.get(section.key)
                        }
                        tools={
                            selectedIndex === index
                                ? blockTools?.(index)
                                : undefined
                        }
                    >
                        {isEmptyTeam(section) ? (
                            <TeamEmptyOnCanvas onAdd={() => onSelect(index)} />
                        ) : host ? (
                            <EditableTextContext.Provider value={host}>
                                {rendered}
                            </EditableTextContext.Provider>
                        ) : (
                            rendered
                        )}
                    </CanvasBlock>
                );
            })
        );

    /*
     * The header and footer are selectable when editing, but carry a lock:
     * they are on every page, so no one page moves or removes them.
     */
    const header = chrome ? (
        <SiteHeader
            name={chrome.name}
            navigation={chrome.navigation}
            look={look}
        />
    ) : null;
    // Always drawn, as on the live site: with nothing written its line is
    // the site's name (G17). A Free site's "Made with Saroh" is drawn by the
    // live site alone (DEC-102), which reads the plan.
    const footer = chrome ? (
        <SiteFooter
            footer={chrome.footer}
            name={chrome.name}
            // The menu again at the foot, as the live site lists it.
            look={look}
        />
    ) : null;

    return (
        <div
            // The merchant's body face, as the live site's body sets it: the
            // page on the canvas never reads in the workspace's own font.
            className={`${PREVIEW_SCOPE} bg-[hsl(var(--site-bg))] font-site-body text-[hsl(var(--site-fg))]`}
            // `data-site-look`, as the live page's root carries it, for
            // the rules and classes that tell the looks apart.
            {...lookScope(look)}
            /*
             * A link on this page is the merchant's link to THEIR site:
             * "/about" means their /about, not Saroh's. So it never navigates
             * this tab — that would land on a Saroh page and leave the editor
             * without the unsaved-work check — and instead opens the
             * merchant's own page in a new tab (merchantLinkUrl).
             *
             * In Preview a click opens it: one of the site's pages opens in
             * the editor (G5), anything else in a new tab. On the editing
             * canvas a click selects the block, so a button can be edited
             * without leaving; ⌘/Ctrl-click opens the link there.
             *
             * These are not ways off the editor, so the leave guard
             * (`@saroh/ui/use-leave-guard`) leaves them to
             * the handler below.
             */
            data-leave-guard="off"
            onClickCapture={(e) => {
                const anchor = (e.target as HTMLElement).closest("a");
                if (!anchor) return;
                e.preventDefault();
                if (editing && !(e.metaKey || e.ctrlKey)) return;
                const href = anchor.getAttribute("href");
                const target = onOpenPage
                    ? previewLinkTarget(href, shown, siteAddress)
                    : null;
                if (target?.kind === "page") {
                    onOpenPage?.(target.page);
                    return;
                }
                if (target?.kind === "anchor") {
                    // The page's own document: at phone or tablet width
                    // it is the device frame's, not the editor's.
                    const el = e.currentTarget.ownerDocument.getElementById(
                        target.id,
                    );
                    if (el && e.currentTarget.contains(el)) {
                        el.scrollIntoView({ block: "start" });
                    }
                    return;
                }
                const url = merchantLinkUrl(href, siteAddress);
                if (url) window.open(url, "_blank", "noopener");
            }}
            /*
             * A draft is never a real visitor, so no form on it sends: an
             * enquiry or a booking made here would reach the business as if
             * a customer had written. Stopped before the block's own handler.
             */
            onSubmitCapture={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onFormBlocked) onFormBlocked();
                else showInfo(FORM_NOT_SENT, FORM_NOT_SENT_DETAIL);
            }}
        >
            <SiteTheme
                variables={vars}
                selector={`.${PREVIEW_SCOPE}`}
                faces={faces}
                look={look}
            />
            {header && editing && onSelectChrome ? (
                <CanvasBlock
                    label="Header · on every page"
                    name="Header, on every page"
                    locked
                    selected={selectedChrome === "header"}
                    onSelect={() => onSelectChrome("header")}
                    tools={
                        selectedChrome === "header" ? headerTools : undefined
                    }
                >
                    {header}
                </CanvasBlock>
            ) : (
                header
            )}
            {top ? <ModulePageTop title={top.title} lead={top.lead} /> : null}
            {/* Back to back, as the live site draws them: each block keeps its
                own margins, and a full-bleed hero meets both edges under the
                header (owner, 24 Oct). */}
            {/* The rest of the page fades while the header or footer, on
                every page, is selected (H1, `fix/WXMGlobal`). */}
            <div
                className={
                    editing && selectedChrome
                        ? "opacity-50 transition-opacity duration-fast"
                        : "transition-opacity duration-fast"
                }
            >
                {page}
            </div>
            {footer && editing && onSelectChrome ? (
                <CanvasBlock
                    label="Footer · on every page"
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
    icon: Icon,
    name,
    selected,
    locked = false,
    notes = 0,
    changed,
    onSelect,
    onOpenNotes,
    tools,
    children,
    onSelectElement,
    element = null,
    elementScope = "element",
}: {
    onSelectElement?: (element: SelectedElement) => void;
    element?: SelectedElement | null;
    elementScope?: StyleScope;
    /** "changed", "added", "moved" or "hidden" since live, for a reader. */
    changed?: string;
    /** Drawn on the block while it is selected: a phone's toolbar. */
    tools?: ReactNode;
    /** Position in the page's block list, so the editor can scroll to it. */
    index?: number;
    label: string;
    /** The section's kind, drawn before its name (D8, `fix/WXKRest`). */
    icon?: LucideIcon;
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
    const readOnly = useEditorReadOnly();
    return (
        <div
            data-block-index={index}
            onClick={(e) => {
                // A button or photo on the block selects it (DEC-253).
                const mark = parseElementMark(
                    (e.target as HTMLElement)
                        .closest("[data-site-el]")
                        ?.getAttribute("data-site-el") ?? null,
                );
                if (mark && onSelectElement) onSelectElement(mark);
                else onSelect();
            }}
            /*
             * Joined by hand, not through `cn`: tailwind-merge reads
             * `outline` and `outline-2` as the same property and drops the
             * first, which leaves an outline with no style — invisible.
             */
            /*
             * The selection is Ink with a Paper line inside it, in light and
             * dark alike: the merchant's page keeps its own ground, so a
             * theme colour could vanish on it (editor audit, 21 Nov).
             */
            /*
             * The header and footer: the site's header is sticky at z-30,
             * which hid its own frame and "Header · on every page" tag
             * (H1 · 4, `fix/WXMGlobal`), so theirs sit above it.
             */
            className={`group/block relative cursor-pointer outline outline-offset-[-2px] transition-[outline-color] duration-fast ${
                selected
                    ? `outline-2 outline-brand-surface after:pointer-events-none after:absolute ${locked ? "after:inset-0 after:z-40 after:shadow-[inset_0_0_0_2px_hsl(var(--brand-surface)),inset_0_0_0_3px_hsl(var(--brand-surface-foreground)/0.9)]" : "after:inset-[2px] after:z-10 after:shadow-[inset_0_0_0_1px_hsl(var(--brand-surface-foreground)/0.9)]"} after:content-['']`
                    : "outline-1 outline-transparent hover:outline-border-strong"
            }`}
        >
            {children}
            {element ? (
                <style>{elementOutline(index, element, elementScope)}</style>
            ) : null}
            {tools}
            {changed ? (
                /*
                 * R1 (`WXMReviewer`): a changed block is ringed and tagged,
                 * selected or not. The tag sits top right, clear of the
                 * label chip; the selection's ink outline takes over the ring.
                 */
                <span
                    aria-hidden
                    className={cn(
                        "pointer-events-none absolute inset-0 z-10",
                        !selected &&
                            "shadow-[inset_0_0_0_2px_hsl(var(--info))]",
                    )}
                >
                    <span
                        data-changed-mark={changed}
                        className={cn(
                            "absolute right-0 top-0 flex h-6 items-center rounded-bl-md px-2 font-sans text-xs font-semibold",
                            selected
                                ? "bg-brand-surface text-brand-surface-foreground"
                                : "bg-info text-info-foreground",
                        )}
                    >
                        {`${changed[0].toUpperCase()}${changed.slice(1)} since live`}
                    </span>
                </span>
            ) : null}
            <button
                type="button"
                aria-label={selected ? `${name}, selected` : name}
                aria-pressed={selected}
                onClick={(e) => {
                    e.stopPropagation();
                    onSelect();
                }}
                className={cn(
                    locked ? "z-40" : "z-10",
                    "absolute left-0 top-0 flex h-6 items-center gap-1 rounded-br-md bg-brand-surface px-2 font-sans text-xs font-semibold text-brand-surface-foreground transition-opacity duration-fast focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected
                        ? "opacity-100"
                        : "opacity-0 group-hover/block:opacity-100",
                )}
            >
                {locked ? (
                    <Lock aria-hidden className="size-3" />
                ) : Icon ? (
                    <Icon aria-hidden className="size-3" />
                ) : null}
                {label}
                {/* On hover, what a click does (D8, `fix/WXKRest`). */}
                {!selected && !readOnly ? (
                    <span data-click-hint="" className="font-normal opacity-80">
                        · click to edit
                    </span>
                ) : null}
            </button>
            {notes > 0 && onOpenNotes ? (
                /*
                 * A 44px target around a 24px badge: the pin is small on
                 * purpose, a thumb is not (touch-target rule).
                 */
                <button
                    type="button"
                    aria-label={`${notes} open on this block. Read the feedback`}
                    onClick={(e) => {
                        e.stopPropagation();
                        onOpenNotes();
                    }}
                    className="group/pin absolute right-1 top-1 z-10 flex size-11 items-center justify-center rounded-full focus-visible:outline-none"
                >
                    <span className="flex size-6 items-center justify-center rounded-full bg-foreground font-sans text-xs font-semibold tabular-nums text-background shadow-md ring-2 ring-background group-focus-visible/pin:ring-ring">
                        {notes}
                    </span>
                </button>
            ) : null}
        </div>
    );
}

/**
 * The selected button or photo outlined in the canvas's amber, with its
 * flag (CSI-C "Button · This button"); with Apply to on the section or the
 * site, every one that will move is outlined too (CSScope).
 */
function elementOutline(
    index: number | undefined,
    element: SelectedElement,
    scope: StyleScope,
): string {
    const block = `[data-block-index="${index}"]`;
    const mark = `[data-site-el="${elementMark(element)}"]`;
    const kind = `[data-site-el^="${element.kind}:"]`;
    const moving =
        scope === "site"
            ? `[data-site-el]${kind}`
            : scope === "section"
              ? `${block} ${kind}`
              : `${block} ${mark}`;
    const word = element.kind === "button" ? "Button" : "Photo";
    const where =
        scope === "site"
            ? "Whole site"
            : scope === "section"
              ? "This section"
              : `This ${element.kind === "button" ? "button" : "photo"}`;
    return `${moving}{outline:2px solid hsl(var(--highlight));outline-offset:4px}
${block} ${mark}{position:relative}
${block} ${mark}::before{content:"${word} · ${where}";position:absolute;left:-6px;top:-34px;white-space:nowrap;background:hsl(var(--brand-surface));color:hsl(var(--brand-surface-foreground));font:600 13px/1.5 system-ui,sans-serif;padding:2px 8px;border-radius:6px;z-index:20;pointer-events:none}`;
}
