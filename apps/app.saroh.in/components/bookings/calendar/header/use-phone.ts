"use client";

import { useCallback, useSyncExternalStore } from "react";

/** The calendar's phone layout: below 760px, as the screens have it. */
export const PHONE_WIDTHS = "(max-width: 759.98px)";

/**
 * Whether the calendar is drawn for a phone, so a sheet rises from the
 * foot of the screen there and a popover drops from its button on the
 * desk. The server and the first render say "desk"; the real answer comes
 * just after, so the two never disagree on hydration.
 */
export function usePhone(): boolean {
    const subscribe = useCallback((onChange: () => void) => {
        if (typeof window.matchMedia !== "function") return () => undefined;
        const mq = window.matchMedia(PHONE_WIDTHS);
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, []);
    return useSyncExternalStore(
        subscribe,
        () =>
            typeof window.matchMedia === "function" &&
            window.matchMedia(PHONE_WIDTHS).matches,
        () => false,
    );
}
