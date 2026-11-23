"use client";

import { firstPhotoOf } from "@saroh/block-contract";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { IconButton } from "@saroh/ui/icon-button";
import { cn } from "@saroh/ui/lib/utils";
import { showError } from "@saroh/ui/toast";
import { EyeOff, Layers, PanelBottom, PanelTop, Plus } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useState } from "react";
import { useOpenPageId } from "../page-switch";

import { SECTION_ICONS } from "@/components/sites/blocks/block-icons";
import { unfinishedPhrase } from "@/components/sites/publish/held-back-copy";
import { count } from "@/lib/format/plural";
import type { Flag, Section } from "@/lib/sites/service";

import { SiteColoursCard } from "@/components/sites/looks/site-colours-card";
import { elementsOf } from "@/lib/sites/element-style";

import { sectionTitle } from "../editor-constants";
import { leavePageMessage } from "../use-editor-selection";
import type { EditorModel } from "./editor-model";
import { PageThumb } from "./page-thumb";

/**
 * "Hidden on phone" from the section's frame (KTD-E5, U47a), "Hidden" when
 * it is off the site; null when it shows everywhere.
 */
export function hiddenMark(section: Section): string | null {
    if (section.hidden) return "Hidden";
    const frame = (section.content as { frame?: { hideOn?: string } } | null)
        ?.frame;
    return frame?.hideOn === "phone" ? "Hidden on phone" : null;
}

/**
 * The left panel's Pages tab (`fix/WXKRest`, 280 wide): "Pages n" with Add
 * a page; the header and footer "On every page"; every page with its link;
 * the open page opened out to its sections, which are chosen, dragged to
 * move (Undo, as the rail's list did) or moved with Alt+↑ ↓; Add section at
 * the foot. Moving to another page waits for this one's work to save, as
 * the page menu does.
 */
export function PagesTree({
    model,
    flagsBySection,
    onAddPage,
    onAddSection,
}: {
    model: EditorModel;
    /** The site's flags on this page, by section: the rows' dots. */
    flagsBySection: Map<number, Flag[]>;
    /** Add a page: Add's own sheet (U46e). */
    onAddPage: () => void;
    /** Add a section below the selected one (Rail › Add). */
    onAddSection: () => void;
}) {
    const { pages, pageId, siteId, readOnly, draft, selection, edits } = model;
    const { sections } = draft;
    const openPageId = useOpenPageId(siteId);
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [dropIndex, setDropIndex] = useState<number | null>(null);
    const waiting = model.review.changes ?? [];
    const changeCount = waiting.length;
    const changedPages = new Set(
        waiting.flatMap((u) => (u.pageId === null ? [] : [u.pageId])),
    ).size;

    function openPage(id: string) {
        if (id === pageId) return;
        const blocked = leavePageMessage(
            model.unsaved,
            draft.onlyHeldBack ? unfinishedPhrase(draft.heldBack) : undefined,
        );
        if (blocked !== null) {
            showError(blocked);
            return;
        }
        openPageId(id);
    }

    /** ↑ ↓ walk the rows; Alt+↑ ↓ move the section, with Undo. */
    function onSectionKey(e: KeyboardEvent<HTMLButtonElement>, index: number) {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        e.preventDefault();
        const delta = e.key === "ArrowUp" ? -1 : 1;
        const to = index + delta;
        if (to < 0 || to >= sections.length) return;
        if (e.altKey && !readOnly) {
            edits.move(index, delta);
            selection.setSelectedIndex(to);
            model.scrollToSection(to);
        }
        const tree = e.currentTarget.closest("[data-pages-tree]");
        requestAnimationFrame(() =>
            tree
                ?.querySelector<HTMLElement>(`[data-section-row="${to}"]`)
                ?.focus(),
        );
    }

    return (
        <aside
            aria-label="Pages and sections"
            data-pages-tree=""
            className="flex min-h-0 flex-1 flex-col"
        >
            <div className="flex h-12 shrink-0 items-center gap-1.5 pl-4 pr-1.5">
                <h2 className="text-[0.9375rem] font-semibold">Pages</h2>
                <span className="text-xs font-medium text-muted-foreground">
                    {pages.length}
                </span>
                <span className="flex-1" />
                {readOnly || !model.canUpdateSite ? null : (
                    <IconButton
                        label="Add a page"
                        icon={<Plus className="size-4" />}
                        onClick={onAddPage}
                    />
                )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pb-2">
                <div
                    role="group"
                    aria-label="On every page"
                    className="mx-2 mb-1.5 mt-0.5 rounded-[10px] border bg-card p-1"
                >
                    <p className="flex h-[26px] items-center gap-1.5 px-1.5 text-xs font-semibold text-muted-foreground">
                        <Layers aria-hidden className="size-3.5" />
                        On every page
                    </p>
                    {(["header", "footer"] as const).map((part) => {
                        const Icon = part === "header" ? PanelTop : PanelBottom;
                        const on = selection.selectedChrome === part;
                        return (
                            <TreeRow
                                key={part}
                                current={on}
                                onClick={() => selection.selectChrome(part)}
                                className="h-[34px]"
                            >
                                <Icon aria-hidden className="size-4 shrink-0" />
                                <span className="flex-1 truncate">
                                    {part === "header" ? "Header" : "Footer"}
                                </span>
                            </TreeRow>
                        );
                    })}
                </div>

                <ul aria-label="Pages" className="px-2">
                    {pages.map((page) => {
                        const open = page.id === pageId;
                        return (
                            <li key={page.id}>
                                <TreeRow
                                    current={open}
                                    page
                                    onClick={() => openPage(page.id)}
                                >
                                    <PageThumb
                                        photo={
                                            open
                                                ? firstPhotoOf(
                                                      sections.map(
                                                          (s) => s.content,
                                                      ),
                                                  )
                                                : page.firstPhoto
                                        }
                                    />
                                    {/* The title wins: the path gives way first. */}
                                    <span
                                        className={cn(
                                            "min-w-0 flex-auto truncate",
                                            page.hidden &&
                                                "text-muted-foreground line-through",
                                        )}
                                    >
                                        {page.title}
                                    </span>
                                    <span className="min-w-0 shrink-[999] truncate font-mono text-xs font-normal text-muted-foreground">
                                        {page.path}
                                    </span>
                                </TreeRow>
                                {open ? (
                                    <ul
                                        aria-label={`Sections on ${page.title}`}
                                    >
                                        {sections.map((section, index) => {
                                            const mark = hiddenMark(section);
                                            const Icon =
                                                SECTION_ICONS[section.type];
                                            const flagged =
                                                (flagsBySection.get(index)
                                                    ?.length ?? 0) > 0 ||
                                                (section.key !== undefined &&
                                                    model.review.notedKeys.has(
                                                        section.key,
                                                    ));
                                            return (
                                                <li
                                                    key={section.key ?? index}
                                                    onDragOver={(e) => {
                                                        if (dragIndex === null)
                                                            return;
                                                        e.preventDefault();
                                                        setDropIndex(index);
                                                    }}
                                                    onDrop={(e) => {
                                                        e.preventDefault();
                                                        if (dragIndex === null)
                                                            return;
                                                        edits.moveTo(
                                                            dragIndex,
                                                            index,
                                                        );
                                                        selection.setSelectedIndex(
                                                            index,
                                                        );
                                                        setDragIndex(null);
                                                        setDropIndex(null);
                                                    }}
                                                    className={cn(
                                                        "group relative flex flex-wrap items-center rounded-md",
                                                        dropIndex === index &&
                                                            dragIndex !==
                                                                index &&
                                                            "ring-1 ring-inset ring-ring",
                                                        dragIndex === index &&
                                                            "opacity-40",
                                                    )}
                                                >
                                                    {readOnly ? null : (
                                                        <span
                                                            draggable
                                                            aria-hidden="true"
                                                            onDragStart={() => {
                                                                setDragIndex(
                                                                    index,
                                                                );
                                                                setDropIndex(
                                                                    index,
                                                                );
                                                            }}
                                                            onDragEnd={() => {
                                                                setDragIndex(
                                                                    null,
                                                                );
                                                                setDropIndex(
                                                                    null,
                                                                );
                                                            }}
                                                            className="absolute left-3 cursor-grab select-none text-muted-foreground opacity-0 active:cursor-grabbing [@media(hover:hover)]:group-hover:opacity-100"
                                                        >
                                                            ⋮
                                                        </span>
                                                    )}
                                                    <TreeRow
                                                        section
                                                        current={
                                                            selection.selectedIndex ===
                                                            index
                                                        }
                                                        data-section-row={index}
                                                        onKeyDown={(e) =>
                                                            onSectionKey(
                                                                e,
                                                                index,
                                                            )
                                                        }
                                                        onClick={() => {
                                                            selection.setSelectedIndex(
                                                                index,
                                                            );
                                                            model.scrollToSection(
                                                                index,
                                                            );
                                                        }}
                                                        className={cn(
                                                            (draft.errorIndex ===
                                                                index ||
                                                                draft.heldBackAt(
                                                                    index,
                                                                )) &&
                                                                "text-destructive",
                                                        )}
                                                    >
                                                        <Icon
                                                            aria-hidden
                                                            className="size-4 shrink-0"
                                                        />
                                                        <span
                                                            className={cn(
                                                                "min-w-0 flex-1 truncate",
                                                                section.hidden &&
                                                                    "text-muted-foreground",
                                                            )}
                                                        >
                                                            {sectionTitle(
                                                                section,
                                                            )}
                                                        </span>
                                                        {flagged ? (
                                                            <span
                                                                aria-label="Worth a look"
                                                                className="size-1.5 shrink-0 rounded-full bg-foreground"
                                                            />
                                                        ) : null}
                                                        {section.key !==
                                                            undefined &&
                                                        model.review.changedByKey.has(
                                                            section.key,
                                                        ) ? (
                                                            // R1: changed since live.
                                                            <span
                                                                role="img"
                                                                aria-label="Changed since live"
                                                                className="size-2 shrink-0 rounded-full bg-info"
                                                            />
                                                        ) : null}
                                                        {mark ? (
                                                            <span className="flex shrink-0 items-center gap-1 text-xs font-normal text-muted-foreground">
                                                                <EyeOff
                                                                    aria-hidden
                                                                    className="size-3"
                                                                />
                                                                {mark}
                                                            </span>
                                                        ) : null}
                                                    </TreeRow>
                                                    {selection.selectedIndex ===
                                                    index ? (
                                                        <ElementRows
                                                            model={model}
                                                            index={index}
                                                            section={section}
                                                        />
                                                    ) : null}
                                                </li>
                                            );
                                        })}
                                        {sections.length === 0 ? (
                                            <li className="py-2 pl-[30px]">
                                                <EmptyState
                                                    size="inline"
                                                    className="text-xs"
                                                    title="No sections yet"
                                                />
                                            </li>
                                        ) : null}
                                    </ul>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
                {/* The site's palette in view under Pages (CSI-C). */}
                <SiteColoursCard
                    style={model.siteStyle.style}
                    options={model.styleOptions}
                    rules={model.styleRules}
                    readOnly={readOnly}
                    onChange={model.siteStyle.setStyle}
                    onTry={model.siteStyle.tryStyle}
                    onBrand={() => model.openRail("brand")}
                />
            </div>

            <div className="shrink-0 border-t px-3 pb-3 pt-2.5">
                {readOnly && changeCount > 0 ? (
                    // R1 (`WXMReviewer`): what waits, where the dots are.
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span
                            aria-hidden
                            className="size-2 shrink-0 rounded-full bg-info"
                        />
                        {`Changed since live · ${count(changeCount, "change")}${changedPages > 0 ? ` on ${count(changedPages, "page")}` : ""}`}
                    </p>
                ) : readOnly ? (
                    <p className="text-xs leading-relaxed text-muted-foreground">
                        You can read every page and leave notes. Nothing else
                        changes.
                    </p>
                ) : (
                    <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={onAddSection}
                    >
                        <Plus aria-hidden className="size-4" />
                        Add section
                    </Button>
                )}
            </div>
        </aside>
    );
}

/** One row of the tree: a page (36), a section (30, indented) or a part. */
function TreeRow({
    current,
    page = false,
    section = false,
    className,
    children,
    ...rest
}: {
    current: boolean;
    page?: boolean;
    section?: boolean;
    className?: string;
    children: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type">) {
    return (
        <button
            type="button"
            aria-current={current ? (page ? "page" : "true") : undefined}
            {...rest}
            className={cn(
                "flex h-9 w-full min-w-0 items-center gap-2 rounded-md px-2.5 text-left text-sm text-muted-foreground transition-colors duration-fast hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring coarse:min-h-11",
                "[&>svg]:text-muted-foreground",
                section && "h-[30px] pl-[30px]",
                current &&
                    (section
                        ? "bg-foreground font-semibold text-background hover:bg-foreground [&>svg]:text-background"
                        : "bg-card font-semibold text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]"),
                className,
            )}
        >
            {children}
        </button>
    );
}

/**
 * The selected section's buttons and photos under its row (CSI-C,
 * "Button · Browse the catalogue"), each selectable on its own (DEC-253).
 */
function ElementRows({
    model,
    index,
    section,
}: {
    model: EditorModel;
    index: number;
    section: Section;
}) {
    const items = elementsOf(section.content);
    if (items.length === 0 || model.layout !== "wide") return null;
    const chosen = model.selection.element;
    return (
        <ul
            aria-label={`Buttons and photos in ${sectionTitle(section)}`}
            className="w-full basis-full"
        >
            {items.map((el) => {
                const on = chosen?.kind === el.kind && chosen.path === el.path;
                return (
                    <li key={`${el.kind}:${el.path}`}>
                        <button
                            type="button"
                            aria-pressed={on}
                            data-element-row={`${el.kind}:${el.path}`}
                            onClick={() => {
                                model.selection.selectElement(index, el);
                                model.scrollToSection(index);
                            }}
                            className={cn(
                                "ml-[30px] flex h-8 w-[calc(100%-30px)] items-center rounded-md px-2.5 text-left text-[0.8125rem] text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                on
                                    ? "bg-card font-semibold text-foreground shadow-[inset_0_0_0_1.5px_hsl(var(--foreground))]"
                                    : "hover:bg-muted",
                            )}
                        >
                            <span className="truncate">
                                {el.kind === "button" ? "Button" : "Photo"} ·{" "}
                                {el.name}
                            </span>
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}
