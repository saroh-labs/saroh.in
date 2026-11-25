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

/**
 * The same answer, or null while it can't be known: on the server and
 * while the page hydrates. A header draws both its phone and desk frames
 * then, each hidden by the 760px breakpoint in CSS, so the first paint is
 * already right at any width (owner, 25 Nov: no layout jump); once known,
 * only the one in use is drawn.
 */
export function usePhoneOrUnknown(): boolean | null {
    const subscribe = useCallback((onChange: () => void) => {
        if (typeof window.matchMedia !== "function") return () => undefined;
        const mq = window.matchMedia(PHONE_WIDTHS);
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, []);
    return useSyncExternalStore<boolean | null>(
        subscribe,
        () =>
            typeof window.matchMedia === "function" &&
            window.matchMedia(PHONE_WIDTHS).matches,
        () => null,
    );
}
