"use client";

import { useCallback, useSyncExternalStore } from "react";

import type { DataViewMode } from "./types";

const STORAGE_PREFIX = "saroh-view-mode:";
/** Tailwind's `lg`. Below this, a table cannot be read without pinch-zoom. */
const TABLE_MIN_WIDTH = 1024;

/**
 * In-memory overrides, so a click updates every mounted view of the same id
 * without waiting for a storage event that same-tab writes never fire.
 */
const chosen = new Map<string, DataViewMode>();
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
    listeners.add(onChange);
    return () => listeners.delete(onChange);
}

function readPreference(
    viewId: string,
    available: DataViewMode[],
    defaultMode: DataViewMode,
): DataViewMode {
    const override = chosen.get(viewId);
    if (override) return override;

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
}

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
 * ## Why `useSyncExternalStore` and not the two obvious alternatives
 *
 * This is client-only state that must not disagree with the server's HTML, and
 * both simpler approaches fail on that:
 *
 * - **A lazy `useState` initialiser** (what this was) reads `localStorage` on
 *   the client's first render while the server rendered `defaultMode`. The
 *   moment a stored preference differed, React 19 failed hydration outright —
 *   "the server rendered HTML didn't match the client" — and discarded the tree
 *   to rebuild it. One saved render bought a full client regeneration.
 * - **Resolving in an effect** fixes hydration but is a `setState` in an effect,
 *   which is a cascading render and is what `react-hooks/set-state-in-effect`
 *   exists to stop.
 *
 * `useSyncExternalStore` is the API built for exactly this: `getServerSnapshot`
 * supplies the value used for SSR *and* for the hydration render, so both sides
 * agree by construction, and React then re-reads the client snapshot as part of
 * its normal work rather than as a second render we scheduled ourselves.
 */
export function useViewMode(
    viewId: string,
    available: DataViewMode[],
    defaultMode: DataViewMode,
) {
    const mode = useSyncExternalStore(
        subscribe,
        () => readPreference(viewId, available, defaultMode),
        // The server has no storage and no viewport. Returning `defaultMode`
        // here is what makes the hydration render match the HTML.
        () => defaultMode,
    );

    const choose = useCallback(
        (next: DataViewMode) => {
            chosen.set(viewId, next);
            try {
                window.localStorage.setItem(STORAGE_PREFIX + viewId, next);
            } catch {
                // Session-only preference; still applied, just not remembered.
            }
            listeners.forEach((l) => l());
        },
        [viewId],
    );

    return { mode, choose };
}
