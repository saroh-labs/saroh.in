"use client";

import { TabStrip } from "@saroh/ui/tabs";
import type { ReactNode } from "react";
import { useEffect, useSyncExternalStore } from "react";

import type { RightTab } from "@/components/ask-ai/editor-ask-ai-context";
import { useEditorAskAiDock } from "@/components/ask-ai/editor-ask-ai-context";

/**
 * The editors' right column at the desk (owner, 21 Nov): Edit (the
 * inspector, or the post's Details) and Ask AI as two tabs at its top.
 * Every Ask AI button and ⌘J switch to Ask AI; the Edit tab goes back.
 * The conversation lives in the editor (`EditorAskAiProvider`), so
 * switching keeps it. No Ask AI (a Reviewer, Ask AI off): the inspector
 * alone, as before.
 */
export function RightColumn({
    askAi,
    children,
}: {
    /** Ask AI is on for this person here (`model.askAi`). */
    askAi: boolean;
    /** The Edit tab: today's inspector. */
    children: ReactNode;
}) {
    const found = useEditorAskAiDock();
    const dock = askAi ? found : null;
    const setDocked = dock?.setDocked;
    // Drawn, so Ask AI opens here rather than in the sheet.
    useEffect(() => {
        if (!setDocked) return;
        setDocked(true);
        return () => setDocked(false);
    }, [setDocked]);

    if (!dock) return <>{children}</>;
    return (
        <div
            data-right-column={dock.tab}
            className="flex min-h-0 min-w-0 flex-col bg-background"
        >
            <TabStrip<RightTab>
                label="Right column"
                idPrefix="right-column"
                tabs={[
                    { value: "edit", label: "Edit", controls: "right-edit" },
                    { value: "ask", label: "Ask AI", controls: "right-ask" },
                ]}
                value={dock.tab}
                onValueChange={dock.setTab}
                listClassName="px-2"
            />
            <div
                id="right-edit"
                role="tabpanel"
                aria-labelledby="right-column-edit"
                hidden={dock.tab !== "edit"}
                className="min-h-0 flex-1 [&:not([hidden])]:grid [&:not([hidden])]:grid-rows-[minmax(0,1fr)] [&>*]:min-h-0"
            >
                {children}
            </div>
            {dock.tab === "ask" ? (
                <div
                    id="right-ask"
                    role="tabpanel"
                    aria-labelledby="right-column-ask"
                    data-ask-ai-panel=""
                    className="flex min-h-0 flex-1 flex-col bg-neutral-50 px-4 pb-4 dark:bg-background"
                >
                    {dock.panel}
                </div>
            ) : null}
        </div>
    );
}

/*
 * The right column's width (owner, 21 Nov): dragged from its left edge,
 * 320 to half the window, remembered per person in this browser. One width
 * for both tabs, so switching Edit and Ask AI never moves the canvas.
 */
const WIDTH_KEY = "saroh.editor.right-width.v2";
export const RIGHT_MIN = 320;
export const RIGHT_DEFAULT = 360;

const listeners = new Set<() => void>();
let saved: number | null | undefined;

function readSaved(): number | null {
    if (saved !== undefined) return saved;
    saved = null;
    try {
        const n: unknown = JSON.parse(
            window.localStorage.getItem(WIDTH_KEY) ?? "null",
        );
        if (typeof n === "number" && n >= RIGHT_MIN) saved = n;
    } catch {
        // Unreadable or blocked: the boards' width.
    }
    return saved;
}

/** Half the window, never under the minimum. */
export const rightMax = () =>
    Math.max(RIGHT_MIN, Math.floor(window.innerWidth / 2));

function save(px: number) {
    saved = Math.round(Math.min(Math.max(px, RIGHT_MIN), rightMax()));
    try {
        window.localStorage.setItem(WIDTH_KEY, JSON.stringify(saved));
    } catch {
        // Private mode: the width lasts until the page closes.
    }
    listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
    listeners.add(onChange);
    window.addEventListener("resize", onChange);
    return () => {
        listeners.delete(onChange);
        window.removeEventListener("resize", onChange);
    };
}

/** The right column's width, the same on either tab, and how to change it. */
export function useRightWidth() {
    const stored = useSyncExternalStore(subscribe, readSaved, () => null);
    const max = useSyncExternalStore(subscribe, rightMax, () => 960);
    const width = Math.min(stored ?? RIGHT_DEFAULT, max);
    return {
        width,
        max,
        setWidth: save,
        nudge: (d: number) => save(width + d),
        reset: RIGHT_DEFAULT,
    };
}
