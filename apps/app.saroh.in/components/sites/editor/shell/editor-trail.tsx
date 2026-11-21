"use client";

import { cn } from "@saroh/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import { Files, History, MessageSquare, Palette, Plus } from "lucide-react";

import type { TrailKey } from "./editor-model";

/** One rail tab: an icon over its word, and a count where it has one. */
export interface TrailTab<K extends string = TrailKey> {
    key: K;
    label: string;
    icon: LucideIcon;
    /** Open notes on Feedback; none at zero. */
    count?: number;
}

/**
 * The site editor's rail (`fix/WXKRest`): Pages · Add · Brand · History ·
 * Feedback; a reader's (`fix/WXMReviewer`) Pages · Brand · Feedback.
 */
export function siteTrailTabs(
    readOnly: boolean,
    openNotes: number,
): TrailTab[] {
    const tabs: TrailTab[] = [
        { key: "pages", label: "Pages", icon: Files },
        { key: "add", label: "Add", icon: Plus },
        { key: "brand", label: "Brand", icon: Palette },
        { key: "history", label: "History", icon: History },
        {
            key: "feedback",
            label: "Feedback",
            icon: MessageSquare,
            count: openNotes,
        },
    ];
    return readOnly
        ? tabs.filter((t) => t.key !== "add" && t.key !== "history")
        : tabs;
}

/**
 * The editor's left rail (U46): a list of tabs given by the host, so the
 * post editor (U15) passes its own (Posts · Add · Ask AI · History ·
 * Feedback). 64 wide, each tab 54 square, its icon over its word; the open
 * one white with a hairline inset.
 */
export function EditorTrail<K extends string>({
    tabs,
    value,
    onSelect,
    label = "Editor panels",
}: {
    tabs: readonly TrailTab<K>[];
    value: K;
    onSelect: (tab: K) => void;
    label?: string;
}) {
    return (
        <nav
            aria-label={label}
            data-editor-trail=""
            className="flex min-h-0 w-16 shrink-0 flex-col items-center gap-1 border-r bg-background py-2.5"
        >
            {tabs.map((tab) => {
                const on = tab.key === value;
                const Icon = tab.icon;
                return (
                    <button
                        key={tab.key}
                        type="button"
                        aria-current={on ? "true" : undefined}
                        onClick={() => onSelect(tab.key)}
                        className={cn(
                            "relative flex size-[54px] flex-col items-center justify-center gap-[3px] rounded-[10px] text-xs text-muted-foreground transition-colors duration-fast hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            on &&
                                "bg-card font-semibold text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))] hover:bg-card",
                        )}
                    >
                        <Icon aria-hidden className="size-[18px]" />
                        {tab.label}
                        {tab.count ? (
                            <span className="absolute right-1 top-1 min-w-4 rounded-full bg-foreground px-1 text-[0.625rem] font-semibold tabular-nums leading-4 text-background">
                                {tab.count}
                            </span>
                        ) : null}
                    </button>
                );
            })}
        </nav>
    );
}
