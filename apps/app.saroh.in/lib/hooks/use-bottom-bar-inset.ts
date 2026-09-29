"use client";

import type { RefObject } from "react";
import { useEffect } from "react";

/**
 * A bar stuck to the foot of the screen (an editor's phone bar, a count's
 * Save, a settings tab's Save) holds the button the merchant reaches for
 * next — and toasts rise from the same place. `--bottom-bar-inset` is the
 * tallest such bar on screen, 0 when there is none; the Toaster's offsets add
 * it (`app/providers.tsx`), so a toast never lands on, and swallows the tap
 * meant for, "Publish changes" right after "Published".
 *
 * A bar hidden with `display: none` (the phone bar on a desktop) counts as 0.
 */
const heights = new Map<symbol, number>();

function apply() {
    let tallest = 0;
    heights.forEach((h) => {
        if (h > tallest) tallest = h;
    });
    document.documentElement.style.setProperty(
        "--bottom-bar-inset",
        `${tallest}px`,
    );
}

export function useBottomBarInset(
    ref: RefObject<HTMLElement | null>,
    enabled = true,
) {
    useEffect(() => {
        const el = ref.current;
        if (!el || !enabled) return;
        const key = Symbol("bottom-bar");
        const measure = () => {
            heights.set(
                key,
                el.getClientRects().length > 0 ? el.offsetHeight : 0,
            );
            apply();
        };
        measure();
        // No ResizeObserver (tests, very old browsers): one measure will do.
        const observer =
            typeof ResizeObserver === "undefined"
                ? null
                : new ResizeObserver(measure);
        observer?.observe(el);
        return () => {
            observer?.disconnect();
            heights.delete(key);
            apply();
        };
    }, [ref, enabled]);
}
