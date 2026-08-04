"use client";

import { useCallback, useState } from "react";

import type { DataViewMode } from "./types";

const STORAGE_PREFIX = "saroh-view-mode:";
/** Tailwind's `lg`. Below this, a table cannot be read without pinch-zoom. */
const TABLE_MIN_WIDTH = 1024;

/**
 * The merchant's chosen density for one view, remembered.
 *
 * Two rules, and the second is the one that is easy to get wrong:
 *
 * 1. A stored preference always wins. Someone who deliberately picked list on a
 *    desktop meant it, and having the layout argue back on every reload is the
 *    kind of small betrayal that makes software feel hostile.
 * 2. With no preference, the viewport decides — table on a wide screen, list on
 *    a phone, because a six-column table below `lg` is not a table, it is a
 *    horizontal scroll nobody asked for.
 *
 * Resolved after mount rather than during render: the server has no viewport and
 * no localStorage, so deciding early would guarantee a hydration mismatch. The
 * first paint uses `defaultMode` and settles immediately.
 */
export function useViewMode(
    viewId: string,
    available: DataViewMode[],
    defaultMode: DataViewMode,
) {
    /*
     * Resolved in a lazy initialiser, not an effect.
     *
     * The client's very first render already has `window`, so the preference
     * and the viewport can both be read there — no second render, and nothing
     * for the cascading-render rule to object to. The `typeof window` guard
     * covers the server pass, where the initialiser also runs.
     *
     * The consequence to know about: server HTML always carries `defaultMode`,
     * so a phone's first paint is briefly the table before the client render
     * corrects it. That is one frame, and the alternative — deferring to an
     * effect — is a guaranteed second render on every mount.
     */
    const [mode, setMode] = useState<DataViewMode>(() => {
        if (typeof window === "undefined") return defaultMode;

        try {
            const stored = window.localStorage.getItem(STORAGE_PREFIX + viewId);
            if (stored && available.includes(stored as DataViewMode)) {
                return stored as DataViewMode;
            }
        } catch {
            // Blocked storage: fall through to the viewport rule. A missing
            // preference is not worth failing a render over.
        }

        const wide = window.innerWidth >= TABLE_MIN_WIDTH;
        const preferred = wide ? defaultMode : "list";
        return available.includes(preferred) ? preferred : defaultMode;
    });

    const choose = useCallback(
        (next: DataViewMode) => {
            setMode(next);
            try {
                window.localStorage.setItem(STORAGE_PREFIX + viewId, next);
            } catch {
                // Session-only preference; still applied, just not remembered.
            }
        },
        [viewId],
    );

    return { mode, choose };
}
