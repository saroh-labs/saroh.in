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
 * 320 to half the window, remembered per person in this browser under its
 * own key (the old `saroh.editor.chrome` held bad widths), each tab its own.
 * Until dragged, Ask AI is a little wider than Edit, as the boards draw it.
 */
const WIDTH_KEY = "saroh.editor.right-width.v1";
export const RIGHT_MIN = 320;
export const RIGHT_DEFAULT: Record<RightTab, number> = { edit: 360, ask: 400 };

const listeners = new Set<() => void>();
type Widths = Partial<Record<RightTab, number>>;
let saved: Widths | undefined;

function readSaved(): Widths {
    if (saved) return saved;
    saved = {};
    try {
        const raw = JSON.parse(
            window.localStorage.getItem(WIDTH_KEY) ?? "{}",
        ) as Record<string, unknown> | null;
        for (const tab of ["edit", "ask"] as const) {
            const n = raw?.[tab];
            if (typeof n === "number" && n >= RIGHT_MIN) saved[tab] = n;
        }
    } catch {
        // Unreadable or blocked: the boards' widths.
    }
    return saved;
}

/** Half the window, never under the minimum. */
export const rightMax = () =>
    Math.max(RIGHT_MIN, Math.floor(window.innerWidth / 2));

function save(tab: RightTab, px: number) {
    const width = Math.round(Math.min(Math.max(px, RIGHT_MIN), rightMax()));
    saved = { ...readSaved(), [tab]: width };
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

/** The right column's width for the open tab, and how to change it. */
export function useRightWidth(tab: RightTab) {
    const stored = useSyncExternalStore(
        subscribe,
        () => readSaved()[tab] ?? null,
        () => null,
    );
    const max = useSyncExternalStore(subscribe, rightMax, () => 960);
    const width = Math.min(stored ?? RIGHT_DEFAULT[tab], max);
    return {
        width,
        max,
        setWidth: (px: number) => save(tab, px),
        nudge: (d: number) => save(tab, width + d),
        reset: RIGHT_DEFAULT[tab],
    };
}
