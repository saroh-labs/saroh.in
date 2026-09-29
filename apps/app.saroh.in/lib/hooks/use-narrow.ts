"use client";

import { useSyncExternalStore } from "react";

/** Phone width: where the tab bar takes over from the rail. */
const NARROW = "(max-width: 759px)";

/**
 * Whether the screen is phone-width (under 760px), following it as the
 * window changes; false on the server and before the first paint. A sheet
 * uses it to rise from the bottom on a phone and come in from the right at
 * a desk (Settings › Activity, the Orders list's quick view and filters).
 */
export function useNarrow(): boolean {
    return useSyncExternalStore(
        (notify) => {
            if (typeof window.matchMedia !== "function") return () => undefined;
            const query = window.matchMedia(NARROW);
            query.addEventListener("change", notify);
            return () => query.removeEventListener("change", notify);
        },
        () =>
            typeof window.matchMedia === "function" &&
            window.matchMedia(NARROW).matches,
        () => false,
    );
}
