"use client";

import type { ReactNode } from "react";
import { createContext, useContext } from "react";

/**
 * The editor's Ask AI, as its right column reads it (`EditorAskAiProvider`
 * holds it). Kept apart from the provider so the column doesn't import the
 * panel's server actions.
 */

export type RightTab = "edit" | "ask";

export interface EditorAskAi {
    tab: RightTab;
    setTab: (tab: RightTab) => void;
    /** The right column says it is drawn, so Ask AI docks there. */
    setDocked: (docked: boolean) => void;
    /** The docked panel, on the editor's one conversation. */
    panel: ReactNode;
}

export const EditorAskAiContext = createContext<EditorAskAi | null>(null);

/** The editor's Ask AI, or null where there is none (a Reviewer). */
export function useEditorAskAiDock(): EditorAskAi | null {
    return useContext(EditorAskAiContext);
}
