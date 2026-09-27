"use client";

import { cn } from "@saroh/ui/lib/utils";
import { Lock, PanelBottom, PanelTop } from "lucide-react";
import { useState } from "react";

import { AddBlockPanel } from "@/components/sites/add-block-panel";
import { SECTION_ICONS } from "@/components/sites/block-icons";
import { EditorTabs, railRowState } from "@/components/sites/editor-chrome";
import {
    SECTION_LABELS,
    sectionTitle,
} from "@/components/sites/editor-constants";
import type {
    EditorRailTab,
    FixedPart,
} from "@/components/sites/editor/use-editor-selection";
import type { HeldBackSection } from "@/components/sites/saveable-sections";
import { StylePanel } from "@/components/sites/style-panel";
import type { Flag, Section, SectionType } from "@/lib/sites/service";
import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";

type RailTab = "page" | "add" | "brand";

/** The rail's tabs, in the design's order (G2). */
const RAIL_TABS: readonly { key: RailTab; label: string }[] = [
    { key: "page", label: "Page" },
    { key: "add", label: "Add" },
    // Today's Style panel until the Brand panel (plan H) replaces it.
    { key: "brand", label: "Brand" },
];

/**
 * The left column: this page's blocks, in order (#340), the blocks to add, or
 * the site's look, under the tabs Page · Add · Brand (G2). The fields are on
 * the right now, so this column is only ever a list — the page as the
 * merchant reads it, top to bottom. Moved out of `site-editor.tsx` (#260).
 */
export function EditorRail({
    rail,
    setRail,
    style,
    setStyle,
    resetStyle,
    styleSaving,
    styleOptions,
    adding,
    setAdding,
    setBrowsing,
    setLookFor,
    addSection,
    sections,
    selectedIndex,
    setSelectedIndex,
    selectedChrome,
    selectChrome,
    moveTo,
    errorIndex,
    heldBackAt,
    flagsBySection,
    notedKeys,
}: {
    rail: EditorRailTab;
    setRail: (next: EditorRailTab) => void;
    style: SiteStyle;
    setStyle: (next: SiteStyle) => void;
    resetStyle: () => void;
    styleSaving: boolean;
    styleOptions: SiteStyleOptions;
    /** The rail shows the Add block tab instead of this page's blocks (#337). */
    adding: boolean;
    setAdding: (adding: boolean) => void;
    /** Open the full picker, every block drawn with previews (#267). */
    setBrowsing: (browsing: boolean) => void;
    /** Choose a look before the block goes in (#267). */
    setLookFor: (type: SectionType) => void;
    addSection: (type: SectionType) => void;
    sections: Section[];
    selectedIndex: number | null;
    setSelectedIndex: (index: number | null) => void;
    selectedChrome: FixedPart | null;
    selectChrome: (part: FixedPart) => void;
    moveTo: (from: number, to: number) => void;
    errorIndex: number | null;
    heldBackAt: (index: number) => HeldBackSection | undefined;
    flagsBySection: Map<number, Flag[]>;
    notedKeys: Set<string>;
}) {
    /*
     * Drag state. `dragIndex` is the row being carried, `dropIndex` the row it
     * would land on — kept apart so the source can dim while the target draws
     * its own outline, and so an abandoned drag clears both.
     */
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [dropIndex, setDropIndex] = useState<number | null>(null);

    /*
     * Page · Add · Brand (G2), as the design draws the rail. Brand is the
     * remembered `style` place, so a reload comes back to it as it did to the
     * Style panel; Add is the add-block flag, which a reload forgets.
     */
    const tab: RailTab = rail === "style" ? "brand" : adding ? "add" : "page";
    function selectTab(next: RailTab) {
        setRail(next === "brand" ? "style" : "sections");
        setAdding(next === "add");
    }

    return (
        <aside className="flex min-h-0 flex-col">
            <EditorTabs
                label="Editor panels"
                tabs={RAIL_TABS}
                value={tab}
                onSelect={selectTab}
            />
            {tab === "brand" ? (
                <StylePanel
                    style={style}
                    options={styleOptions}
                    onChange={setStyle}
                    onReset={resetStyle}
                    saving={styleSaving}
                />
            ) : (
                <>
                    {adding ? (
                        <AddBlockPanel
                            onBrowse={() => setBrowsing(true)}
                            onPick={(type, looks) => {
                                if (looks > 1) setLookFor(type);
                                else addSection(type);
                            }}
                        />
                    ) : (
                        <>
                            <p className="px-4 pb-1 pt-4 text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                                {`${sections.length + 2} blocks`}
                            </p>
                            <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 pl-4">
                                <FixedBlockRow
                                    part="header"
                                    selected={selectedChrome === "header"}
                                    onSelect={() => selectChrome("header")}
                                />
                                {sections.map((section, index) => (
                                    <li
                                        key={index}
                                        /*
                                         * The row is the drop target, not the
                                         * handle: aiming at a 32px row is far
                                         * easier than aiming at the grip, and
                                         * the grip is what starts the drag.
                                         */
                                        onDragOver={(e) => {
                                            if (dragIndex === null) return;
                                            e.preventDefault();
                                            setDropIndex(index);
                                        }}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            if (dragIndex === null) return;
                                            moveTo(dragIndex, index);
                                            setSelectedIndex(index);
                                            setDragIndex(null);
                                            setDropIndex(null);
                                        }}
                                        className={cn(
                                            "rounded",
                                            dropIndex === index &&
                                                dragIndex !== index &&
                                                "ring-1 ring-inset ring-ring",
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                // A row is not a button and must not
                                                // scale — at 32px tall a shrink reads
                                                // as a jitter. It answers a press with
                                                // the surface it would settle on, so
                                                // the feedback is the outcome arriving
                                                // early rather than a separate effect.
                                                "group relative flex h-10 w-full items-center gap-1 rounded-md pr-2 text-left text-[0.8125rem] transition-colors",
                                                /*
                                                 * The selected row carries a bar
                                                 * on its edge as well as a fill,
                                                 * as the design draws it: the
                                                 * fill alone is too quiet on the
                                                 * dark chrome.
                                                 */
                                                railRowState(
                                                    selectedIndex === index,
                                                ),
                                                (errorIndex === index ||
                                                    heldBackAt(index)) &&
                                                    "text-destructive",
                                                dragIndex === index &&
                                                    "opacity-40",
                                            )}
                                        >
                                            {/*
                                             * The grip is the drag surface. It
                                             * carries no click of its own — a
                                             * handle that also navigates makes
                                             * every aborted drag a selection.
                                             */}
                                            <span
                                                draggable
                                                onDragStart={() => {
                                                    setDragIndex(index);
                                                    setDropIndex(index);
                                                }}
                                                onDragEnd={() => {
                                                    setDragIndex(null);
                                                    setDropIndex(null);
                                                }}
                                                aria-hidden="true"
                                                className="cursor-grab select-none px-1 text-muted-foreground active:cursor-grabbing group-hover:text-muted-foreground"
                                            >
                                                ⋮
                                            </span>
                                            <button
                                                type="button"
                                                aria-current={
                                                    selectedIndex === index
                                                        ? "true"
                                                        : undefined
                                                }
                                                title={
                                                    SECTION_LABELS[section.type]
                                                }
                                                onClick={() =>
                                                    setSelectedIndex(index)
                                                }
                                                className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                                            >
                                                <span className="flex min-w-0 items-center gap-2.5">
                                                    {(() => {
                                                        const Icon =
                                                            SECTION_ICONS[
                                                                section.type
                                                            ];
                                                        return (
                                                            <Icon
                                                                aria-hidden="true"
                                                                className="size-4 shrink-0 text-muted-foreground"
                                                            />
                                                        );
                                                    })()}
                                                    <span
                                                        className={cn(
                                                            "truncate",
                                                            /*
                                                             * A hidden block is
                                                             * dimmed rather than
                                                             * removed: it is still
                                                             * part of the page the
                                                             * merchant is building,
                                                             * just not part of the
                                                             * one visitors get.
                                                             */
                                                            section.hidden &&
                                                                "text-muted-foreground line-through",
                                                        )}
                                                    >
                                                        {sectionTitle(section)}
                                                    </span>
                                                </span>
                                                <span className="flex shrink-0 items-center gap-1.5">
                                                    {/*
                                                     * The spec's flag dot: 4px,
                                                     * amber #c99f6f (§7). It is
                                                     * the ONLY thing flags draw
                                                     * while editing — "quiet
                                                     * until publish" — so it
                                                     * carries a title rather
                                                     * than expanding into the
                                                     * row.
                                                     */}
                                                    {(flagsBySection.get(index)
                                                        ?.length ?? 0) > 0 ||
                                                    (section.key !==
                                                        undefined &&
                                                        notedKeys.has(
                                                            section.key,
                                                        )) ? (
                                                        <span
                                                            className="size-1 shrink-0 rounded-full bg-highlight"
                                                            title={[
                                                                ...(flagsBySection
                                                                    .get(index)
                                                                    ?.map(
                                                                        (f) =>
                                                                            f.message,
                                                                    ) ?? []),
                                                                ...(section.key !==
                                                                    undefined &&
                                                                notedKeys.has(
                                                                    section.key,
                                                                )
                                                                    ? [
                                                                          "A reviewer has left a note on this section.",
                                                                      ]
                                                                    : []),
                                                            ].join("\n")}
                                                        />
                                                    ) : null}
                                                </span>
                                            </button>
                                        </div>
                                    </li>
                                ))}
                                {sections.length === 0 ? (
                                    <li className="px-2 py-6 text-center text-sm text-muted-foreground">
                                        No blocks yet.
                                    </li>
                                ) : null}
                                <FixedBlockRow
                                    part="footer"
                                    selected={selectedChrome === "footer"}
                                    onSelect={() => selectChrome("footer")}
                                />
                            </ul>
                            <p className="px-4 pb-3 text-xs leading-relaxed text-muted-foreground">
                                Header and footer carry a lock — they are on
                                every page, so this page cannot remove them.
                            </p>
                        </>
                    )}
                </>
            )}
        </aside>
    );
}

/**
 * The header or footer in the block list (#336): on every page, so it is
 * listed where it sits — first and last — with a lock instead of a grip. It
 * can be selected, never dragged.
 */
function FixedBlockRow({
    part,
    selected,
    onSelect,
}: {
    part: "header" | "footer";
    selected: boolean;
    onSelect: () => void;
}) {
    const Icon = part === "header" ? PanelTop : PanelBottom;
    const label = part === "header" ? "Header" : "Footer";
    return (
        <li>
            <button
                type="button"
                onClick={onSelect}
                aria-current={selected ? "true" : undefined}
                className={cn(
                    "relative flex h-10 w-full items-center gap-2.5 rounded-md pl-5 pr-2 text-left text-[0.8125rem] transition-colors",
                    railRowState(selected),
                )}
            >
                <Icon
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground"
                />
                <span className="flex-1 truncate">{label}</span>
                <Lock
                    aria-label="On every page"
                    className="size-3.5 shrink-0 text-muted-foreground"
                />
            </button>
        </li>
    );
}
