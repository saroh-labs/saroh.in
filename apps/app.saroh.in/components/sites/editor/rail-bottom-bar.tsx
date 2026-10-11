"use client";

import { cn } from "@saroh/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import { Layers, MessageSquare, Palette, Plus } from "lucide-react";

import type { RailTab } from "@/components/sites/editor/editor-rail";
import { CountBadge } from "@saroh/ui/count-badge";

const TABS: readonly { key: RailTab; label: string; icon: LucideIcon }[] = [
    { key: "page", label: "Page", icon: Layers },
    { key: "add", label: "Add", icon: Plus },
    { key: "brand", label: "Brand", icon: Palette },
];

/**
 * The rail on a phone (G4): Page · Add · Brand as a bar at the foot of the
 * screen, where a thumb already is, drawn like the workspace's tab bar
 * (`tab-bar.tsx`) — 52px targets over a 1px rule and the phone's safe area.
 * Each opens the rail in a sheet on its tab. Feedback sits beside them: with
 * the inspector out of sight, it is the way to the whole site's review.
 */
export function RailBottomBar({
    tab,
    open,
    feedbackOpen,
    openNotes,
    onTab,
    onFeedback,
}: {
    /** The rail's tab now. */
    tab: RailTab;
    /** The rail's sheet is showing. */
    open: boolean;
    /** The inspector's sheet is showing Feedback. */
    feedbackOpen: boolean;
    /** Notes still open on the site. */
    openNotes: number;
    onTab: (tab: RailTab) => void;
    onFeedback: () => void;
}) {
    return (
        <nav
            aria-label="Edit this page"
            className="flex shrink-0 border-t bg-card pb-[env(safe-area-inset-bottom)]"
        >
            {TABS.map(({ key, label, icon: Icon }) => {
                const on = open && tab === key;
                return (
                    <button
                        key={key}
                        type="button"
                        aria-pressed={on}
                        onClick={() => onTab(key)}
                        className={tabClass(on)}
                    >
                        <Icon aria-hidden className="size-[21px]" />
                        {label}
                    </button>
                );
            })}
            <button
                type="button"
                aria-pressed={feedbackOpen}
                aria-label={
                    openNotes > 0 ? `Feedback, ${openNotes} open` : "Feedback"
                }
                onClick={onFeedback}
                className={tabClass(feedbackOpen)}
            >
                <span className="relative">
                    <MessageSquare aria-hidden className="size-[21px]" />
                    {openNotes > 0 ? (
                        <CountBadge
                            count={openNotes}
                            tone="strong"
                            aria-hidden
                            className="absolute -top-[5px] left-3 min-w-[18px] px-1 py-px"
                        />
                    ) : null}
                </span>
                Feedback
            </button>
        </nav>
    );
}

/** A tab as the workspace's tab bar draws one: a Saffron bar when on. */
const tabClass = (on: boolean) =>
    cn(
        "flex min-h-[52px] min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-[3px] px-0.5 py-1.5 text-[11px] leading-tight transition-colors duration-fast",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        on
            ? "font-semibold text-foreground shadow-[inset_0_2px_0_hsl(var(--foreground))]"
            : "font-medium text-muted-foreground",
    );
