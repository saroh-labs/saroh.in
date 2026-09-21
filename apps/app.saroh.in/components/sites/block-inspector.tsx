"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Info, PanelBottom, PanelTop } from "lucide-react";
import Link from "next/link";

import { SECTION_ICONS } from "@/components/sites/block-icons";
import { BOUND_BLOCKS } from "@/components/sites/block-kinds";
import { SECTION_LABELS } from "@/components/sites/editor-constants";
import { NoteComposer } from "@/components/sites/note-composer";
import type { HeldBackSection } from "@/components/sites/saveable-sections";
import { SectionFields } from "@/components/sites/section-fields";
import { SectionPadding } from "@/components/sites/section-fields/padding";
import type { useServicesForPicker } from "@/components/sites/use-services-for-picker";
import type { Flag, Section, SitePage } from "@/lib/sites/service";
import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";

/**
 * The inspector's Block tab (#340): what can be changed about the selected
 * block, on the right of the page it is part of.
 *
 * Moved out of `site-editor.tsx` rather than rewritten (#260). It owns no
 * state: every change goes back through the editor, which is the one place
 * that saves, so the inspector cannot disagree with what autosave sends.
 */
export function BlockInspector({
    active,
    count,
    siteId,
    pageId,
    pages,
    services,
    style,
    styleOptions,
    flags,
    unreadable,
    error,
    heldBack,
    onChange,
    onToggleHidden,
    onMove,
    onRemove,
    onNoteAdded,
}: {
    /** The selected block and where it sits, or null when nothing is. */
    active: { index: number; section: Section } | null;
    /** How many blocks the page has, for the move arrows. */
    count: number;
    siteId: string;
    pageId: string;
    pages: SitePage[];
    services: ReturnType<typeof useServicesForPicker>;
    style: SiteStyle;
    styleOptions: SiteStyleOptions;
    /** This block's advisory flags. */
    flags: Flag[];
    /** Whether this block's stored content fails its contract (#275). */
    unreadable: boolean;
    /** The last save's error, when it was about this block. */
    error: string | null;
    /** Why this block is waiting to save, if it is. */
    heldBack: HeldBackSection | undefined;
    onChange: (next: Section) => void;
    onToggleHidden: () => void;
    onMove: (delta: -1 | 1) => void;
    onRemove: () => void;
    onNoteAdded: () => Promise<void>;
}) {
    if (active === null) {
        return (
            <div className="px-6 py-10 text-center">
                <p className="text-sm font-semibold">Nothing selected</p>
                <p className="mx-auto mt-2 max-w-[30ch] text-[0.8125rem] leading-relaxed text-muted-foreground">
                    Click a block on the page, or pick one from the list on the
                    left, to see what can be changed about it.
                </p>
            </div>
        );
    }

    const { index, section } = active;
    const Icon = SECTION_ICONS[section.type];
    const bound = BOUND_BLOCKS[section.type];

    return (
        <div className="space-y-4 p-4">
            {/*
             * What the block IS and whether it is on the live site, then the
             * actions taken ON it. Two rows, because the inspector will not
             * hold a name and four controls on one line at its narrowest.
             */}
            <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold">
                        <Icon
                            aria-hidden="true"
                            className="size-4 shrink-0 text-muted-foreground"
                        />
                        <span className="truncate">
                            {SECTION_LABELS[section.type]}
                        </span>
                    </h2>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-pressed={section.hidden === true}
                        title={
                            section.hidden
                                ? "Hidden — this block is left out when you publish"
                                : "Visible — this block publishes with the page"
                        }
                        onClick={onToggleHidden}
                        className={cn(
                            "h-7 shrink-0 gap-1.5 px-2 text-xs",
                            section.hidden && "text-muted-foreground",
                        )}
                    >
                        <span aria-hidden="true">
                            {section.hidden ? "○" : "●"}
                        </span>
                        {section.hidden ? "Hidden" : "Visible"}
                    </Button>
                </div>

                <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">
                    {bound?.reads ??
                        "Only on this page. Move it, change it, or take it off."}
                </p>
            </div>

            {/*
             * Where the real value lives, with a way there — instead of a
             * field that would fork it (#338).
             */}
            {bound ? (
                <div className="flex gap-2.5 rounded-lg bg-brand-subtle p-3 text-[0.8125rem] leading-relaxed text-brand-subtle-foreground">
                    <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
                    <div className="space-y-2">
                        <p>{bound.notice}</p>
                        <Link
                            href={bound.href}
                            className="font-medium underline underline-offset-2"
                        >
                            {bound.linkLabel}
                        </Link>
                    </div>
                </div>
            ) : null}

            <SectionFields
                section={section}
                services={services}
                pages={pages}
                onChange={onChange}
            />

            {/*
             * Said, not hidden (#275). This block's stored content does not
             * match the shape it promises, so the fields may show blanks that
             * are not what was written. Saving over it is what would lose it.
             */}
            {unreadable ? (
                <p className="rounded-md border border-dashed p-3 text-xs leading-relaxed text-muted-foreground">
                    Saroh cannot read this block&apos;s saved content. The
                    fields may look empty even though something is stored.
                    Editing and saving will replace whatever is there.
                </p>
            ) : null}

            {/*
             * The advisory flags — "quiet until publish", so they are listed
             * under the fields rather than interrupting them.
             */}
            {flags.length > 0 ? (
                <ul className="grid gap-1.5 border-t pt-3">
                    {flags.map((flag, i) => (
                        <li
                            key={i}
                            className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"
                        >
                            <span
                                aria-hidden="true"
                                className="mt-1.5 size-1 shrink-0 rounded-full bg-highlight"
                            />
                            <span>{flag.message}</span>
                        </li>
                    ))}
                </ul>
            ) : null}

            <SectionPadding
                section={section}
                siteDefault={style.scalars.sectionPadding}
                bounds={styleOptions.scalars.find(
                    (sc) => sc.key === "sectionPadding",
                )}
                onChange={onChange}
            />

            {error ? (
                <p className="text-sm text-destructive">{error}</p>
            ) : heldBack ? (
                <p role="status" className="text-sm text-destructive">
                    {heldBack.message}
                </p>
            ) : null}

            {/*
             * The actions taken ON the block close its panel, as the design
             * places them: move it, or take it off. The arrows survive the
             * drag handle — a list you can only reorder by dragging is a list
             * some people cannot reorder.
             */}
            <div className="flex items-center gap-1 border-t pt-3">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label="Move block up"
                    className="h-8 w-8 p-0"
                    disabled={index === 0}
                    onClick={() => onMove(-1)}
                >
                    ↑
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label="Move block down"
                    className="h-8 w-8 p-0"
                    disabled={index === count - 1}
                    onClick={() => onMove(1)}
                >
                    ↓
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="ml-auto h-8 px-3 text-xs text-destructive hover:text-destructive"
                    onClick={onRemove}
                >
                    Remove
                </Button>
            </div>

            {/*
             * Leaving a note is an action taken ON this block (#277), so it
             * sits with the block and needs no picker.
             */}
            <div className="border-t pt-3">
                <NoteComposer
                    siteId={siteId}
                    pageId={pageId}
                    sectionKey={section.key}
                    onAdded={onNoteAdded}
                />
            </div>

            {/*
             * Where editing does NOT happen. A merchant who expects to change
             * a price here would otherwise hunt for a field that is
             * deliberately absent.
             */}
            <p className="border-t pt-3 text-xs leading-relaxed text-muted-foreground">
                Written copy edits here and on the page at the same time.
                Prices, dates and stock come from the workspace and change
                there.
            </p>
        </div>
    );
}

/**
 * The header or footer, selected (#336, #338). They are on every page, so
 * the inspector says that before anything else, and the actions a page block
 * has are here but disabled WITH the reason — absent, they would leave a
 * merchant hunting for a Remove that was never going to exist.
 */
export function FixedBlockInspector({
    part,
    siteId,
    hasFooter,
}: {
    part: "header" | "footer";
    siteId: string;
    /** Whether anything is written at the foot of the site yet. */
    hasFooter: boolean;
}) {
    const Icon = part === "header" ? PanelTop : PanelBottom;
    const reason =
        "On every page, so it cannot be removed or moved from one page.";
    return (
        <div className="space-y-4 p-4">
            <div className="space-y-1.5">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                    <Icon
                        aria-hidden="true"
                        className="size-4 shrink-0 text-muted-foreground"
                    />
                    {part === "header" ? "Header" : "Footer"}
                    <Badge
                        variant="neutral"
                        className="uppercase tracking-[0.06em]"
                    >
                        Fixed
                    </Badge>
                </h2>
                <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">
                    On every page of this site. Where it sits is not a per-page
                    choice.
                </p>
            </div>

            <p className="text-[0.8125rem] leading-relaxed">
                {part === "header"
                    ? "It shows the site's name and its menu. The menu lists the pages you add to it, and both are changed in Website settings, where a change is understood to reach every page."
                    : hasFooter
                      ? "What is written here is changed in Website settings, where a change is understood to reach every page."
                      : "Nothing is written at the foot of this site yet, so visitors see no footer. Write one in Website settings."}
            </p>
            <Button asChild variant="outline" size="sm">
                <Link href={`/sites/${siteId}/settings`}>
                    Open Website settings
                </Link>
            </Button>

            <div className="flex items-center gap-1 border-t pt-3">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    disabled
                    aria-label={`Move — ${reason}`}
                >
                    ↑
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    disabled
                    aria-label={`Move — ${reason}`}
                >
                    ↓
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="ml-auto h-8 px-3 text-xs"
                    disabled
                    aria-describedby="fixed-remove-reason"
                >
                    Remove
                </Button>
            </div>
            <p
                id="fixed-remove-reason"
                className="text-xs leading-relaxed text-muted-foreground"
            >
                {reason}
            </p>
        </div>
    );
}
