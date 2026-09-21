"use client";

import { cn } from "@saroh/ui/lib/utils";
import { useRef } from "react";

/**
 * The editor's own furniture — the tab strips and the draggable divider
 * between panels.
 *
 * Split out of `site-editor.tsx` (#260). Neither knows anything about sections;
 * they were in that file because everything was.
 */

/**
 * A strip of underlined tabs — the rail's and the inspector's (#340).
 *
 * One definition for both, so the two strips cannot drift apart in how a
 * selected tab looks. Switching stays instant: it happens dozens of times a
 * session, and anything staged would make the editor feel slower than it is.
 */
export function EditorTabs<T extends string>({
    label,
    tabs,
    value,
    onSelect,
}: {
    /** What the strip switches between, for assistive tech. */
    label: string;
    tabs: readonly { key: T; label: string; count?: number }[];
    value: T;
    onSelect: (tab: T) => void;
}) {
    return (
        <div
            role="tablist"
            aria-label={label}
            className="flex shrink-0 items-end gap-4 border-b px-4"
        >
            {tabs.map((tab) => (
                <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={value === tab.key}
                    onClick={() => onSelect(tab.key)}
                    className={cn(
                        "relative -mb-px flex h-10 items-center gap-1.5 border-b-2 text-[0.8125rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                        value === tab.key
                            ? "border-highlight text-foreground"
                            : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                >
                    {tab.label}
                    {/*
                     * The count rides the tab rather than a separate badge:
                     * the number only means anything next to the word it
                     * counts.
                     */}
                    {tab.count ? (
                        <span className="rounded-full bg-secondary px-1.5 text-[0.6875rem] tabular-nums leading-4 text-highlight">
                            {tab.count}
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
    panelSide = "left",
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
    /**
     * Which side of the divider the panel it sizes is on. A panel to the RIGHT
     * (the inspector, #340) grows as the divider moves left, so the drag and
     * the arrow keys run the other way.
     */
    panelSide?: "left" | "right";
}) {
    const sign = panelSide === "left" ? 1 : -1;
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
                onResize(from.width + sign * (e.clientX - from.x));
            }}
            onPointerUp={(e) => {
                start.current = null;
                e.currentTarget.releasePointerCapture(e.pointerId);
            }}
            onDoubleClick={() => onResize(reset)}
            onKeyDown={(e) => {
                // 16px a press is roughly a visible step without being so
                // coarse that the useful widths fall between two presses.
                if (e.key === "ArrowLeft") onNudge(-16 * sign);
                else if (e.key === "ArrowRight") onNudge(16 * sign);
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
