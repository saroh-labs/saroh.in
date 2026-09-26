"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * The time now, re-read every `everyMs` — or null during server rendering and
 * hydration, so nothing time-dependent is rendered twice with two different
 * answers.
 *
 * `useSyncExternalStore` rather than a `useState` + `setInterval` effect: the
 * React Compiler forbids `Date.now()` in render and setting state from an
 * effect, and this is what a clock is — an external store. The snapshot is
 * rounded to the tick so React sees a stable value between ticks.
 */
export function useClock(everyMs: number): number | null {
    const subscribe = useCallback(
        (onChange: () => void) => {
            const id = window.setInterval(onChange, everyMs);
            return () => window.clearInterval(id);
        },
        [everyMs],
    );
    return useSyncExternalStore(
        subscribe,
        () => Math.floor(Date.now() / everyMs) * everyMs,
        () => null,
    );
}
