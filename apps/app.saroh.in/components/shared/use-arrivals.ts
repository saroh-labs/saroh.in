"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Rows that arrived while the list was on screen (10 Oct 2026).
 *
 * A list that reads again by itself (`useLiveRefresh`) may come back with
 * a row that wasn't there: a new order, a new thing that needs you. That
 * row enters with the list's entrance motion and wears a quiet edge until
 * it is touched (`arrivalProps`), so someone looking up from the counter
 * sees what is new without the page shouting.
 *
 * - What is on screen when the list first draws is never new.
 * - `scope` is what the list is showing (its address: tab, filters, page).
 *   A change of scope is the person's own doing, so nothing in it is new.
 * - Touched means pressed or focused: the edge goes, and stays gone.
 */
export function useArrivals(
    ids: readonly string[],
    scope = "",
): {
    isNew: (id: string) => boolean;
    touch: (id: string) => void;
} {
    const seen = useRef<{ scope: string; ids: Set<string> } | null>(null);
    const [arrived, setArrived] = useState<ReadonlySet<string>>(EMPTY);
    const key = ids.join("\n");

    useEffect(() => {
        const now = key ? key.split("\n") : [];
        const before = seen.current;
        if (before?.scope !== scope) {
            seen.current = { scope, ids: new Set(now) };
            // Another tab, filter or page: a fresh list, nothing new in it.
            setArrived((had) => (had.size > 0 ? EMPTY : had));
            return;
        }
        const fresh = now.filter((id) => !before.ids.has(id));
        if (fresh.length === 0) return;
        for (const id of fresh) before.ids.add(id);
        setArrived((had) => new Set(Array.from(had).concat(fresh)));
    }, [key, scope]);

    const isNew = useCallback((id: string) => arrived.has(id), [arrived]);
    const touch = useCallback((id: string) => {
        setArrived((had) => {
            if (!had.has(id)) return had;
            const next = new Set(had);
            next.delete(id);
            return next;
        });
    }, []);
    return { isNew, touch };
}

const EMPTY: ReadonlySet<string> = new Set();

/**
 * What a row that just arrived carries: the entrance and the edge
 * (`wk-item wk-arrived` in `workspace.css`, still under reduced motion),
 * and the two ways of touching it.
 */
export function arrivalProps(
    arrived: boolean,
    onTouch: () => void,
): {
    className?: string;
    "data-arrived"?: "";
    onPointerDown?: () => void;
    onFocusCapture?: () => void;
} {
    if (!arrived) return {};
    return {
        className: "wk-item wk-arrived",
        "data-arrived": "",
        onPointerDown: onTouch,
        onFocusCapture: onTouch,
    };
}
