"use client";

import { cn } from "@saroh/ui/lib/utils";
import { useRef } from "react";

/**
 * The editor's own furniture — the rail's tab strip and the draggable divider
 * between panels.
 *
 * Split out of `site-editor.tsx` (#260). Neither knows anything about sections;
 * they were in that file because everything was.
 */

/**
 * The rail's tabs. One definition, used by both panels it switches between —
 * two copies of a tablist is two chances for the selected state to disagree
 * with what is actually showing.
 *
 * All three tabs lead somewhere. Review was absent while it was unbuilt — a tab
 * leading nowhere is worse than one that is not there — and it earned its place
 * when the notes and the approval landed behind it.
 */
export function RailTabs({
    rail,
    onSelect,
    openNotes,
}: {
    rail: "sections" | "pages" | "review" | "style";
    onSelect: (tab: "sections" | "pages" | "review") => void;
    /** Shown on the Review tab when notes are open. */
    openNotes: number;
}) {
    return (
        <div
            role="tablist"
            aria-label="Editor panels"
            className="flex items-center gap-1 border-b px-2 py-1.5"
        >
            {(["sections", "pages", "review"] as const).map((tab) => (
                <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={rail === tab}
                    onClick={() => onSelect(tab)}
                    className={cn(
                        "rounded px-2 py-1 text-xs font-medium capitalize transition-colors",
                        rail === tab
                            ? "bg-secondary text-secondary-foreground"
                            : // Pressing shows the surface the tab is about to
                              // settle on. This is feedback on the PRESS, not an
                              // animation of the switch — the switch itself stays
                              // instant, because it happens dozens of times a
                              // session and anything staged would make the rail
                              // feel slower than it is.
                              "text-muted-foreground hover:text-foreground active:bg-secondary/60 active:text-secondary-foreground",
                    )}
                >
                    {tab}
                    {/*
                     * The count rides the tab rather than a separate badge:
                     * the number only means anything next to the word it
                     * counts, and the rail has no room for both.
                     */}
                    {tab === "review" && openNotes > 0 ? (
                        <span className="ml-1 tabular-nums text-[#c99f6f]">
                            {openNotes}
                        </span>
                    ) : null}
                </button>
            ))}
        </div>
    );
}

/**
 * A draggable hairline between two panels.
 *
 * Pointer events rather than mouse events, so a trackpad, a pen and a touch
 * screen all work, and pointer CAPTURE so a fast drag that outruns the 1px
 * line keeps resizing instead of stopping dead. Double-click resets, which the
 * spec asks for and which is the only cheap way back from a width that turned
 * out to be wrong.
 *
 * It is also a real control for the keyboard: a separator that can only be
 * dragged is a separator half the people using it cannot move at all.
 */
export function PanelDivider({
    label,
    width,
    min,
    max,
    reset,
    onResize,
    onNudge,
}: {
    label: string;
    width: number;
    min: number;
    max: number;
    reset: number;
    /** Absolute target width, for the drag. */
    onResize: (px: number) => void;
    /**
     * A RELATIVE step, for the keyboard. Deliberately not `onResize(width + n)`:
     * `width` is this render's prop, so a burst of key events arriving before
     * React re-renders would each compute from the same stale number and only
     * the last would count. A delta is applied against whatever the store
     * currently holds, so every press lands.
     */
    onNudge: (delta: number) => void;
}) {
    const start = useRef<{ x: number; width: number } | null>(null);

    return (
        <div
            role="separator"
            aria-orientation="vertical"
            aria-label={label}
            aria-valuenow={width}
            aria-valuemin={min}
            aria-valuemax={max}
            tabIndex={0}
            onPointerDown={(e) => {
                start.current = { x: e.clientX, width };
                e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
                const from = start.current;
                if (from === null) return;
                onResize(from.width + (e.clientX - from.x));
            }}
            onPointerUp={(e) => {
                start.current = null;
                e.currentTarget.releasePointerCapture(e.pointerId);
            }}
            onDoubleClick={() => onResize(reset)}
            onKeyDown={(e) => {
                // 16px a press is roughly a visible step without being so
                // coarse that the useful widths fall between two presses.
                if (e.key === "ArrowLeft") onNudge(-16);
                else if (e.key === "ArrowRight") onNudge(16);
                else if (e.key === "Home") onResize(reset);
                else return;
                e.preventDefault();
            }}
            /*
             * 1px of line, 9px of target. `after` widens what the pointer can
             * hit without widening what the eye sees — a hairline you have to
             * hit exactly is a hairline nobody moves twice.
             */
            className="relative hidden cursor-col-resize bg-border after:absolute after:inset-y-0 after:-left-1 after:w-[9px] after:content-[''] hover:bg-ring focus-visible:bg-ring focus-visible:outline-none lg:block"
        />
    );
}
