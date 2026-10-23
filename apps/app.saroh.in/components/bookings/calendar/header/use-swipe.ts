"use client";

import type { PointerEvent } from "react";
import { useRef } from "react";

/** How far a finger travels sideways before it is a swipe, in px. */
export const SWIPE_DISTANCE = 60;

/**
 * Swipe the calendar left for the next day (or week) and right for the one
 * before (U2; the date sheet and the arrows do the same for a keyboard and
 * a screen reader). Touch only: a mouse drag is a selection, and a pen is
 * left alone. A swipe must be mostly sideways, so scrolling the hours up and
 * down never changes the day.
 *
 * Spread the handlers on the body that should answer to it.
 */
export function useSwipe({
    onPrevious,
    onNext,
}: {
    onPrevious: () => void;
    onNext: () => void;
}) {
    const start = useRef<{ x: number; y: number } | null>(null);
    return {
        onPointerDown(e: PointerEvent<HTMLElement>) {
            start.current =
                e.pointerType === "touch"
                    ? { x: e.clientX, y: e.clientY }
                    : null;
        },
        onPointerUp(e: PointerEvent<HTMLElement>) {
            const from = start.current;
            start.current = null;
            if (!from || e.pointerType !== "touch") return;
            const dx = e.clientX - from.x;
            const dy = e.clientY - from.y;
            if (Math.abs(dx) < SWIPE_DISTANCE) return;
            if (Math.abs(dx) < Math.abs(dy) * 2) return;
            if (dx < 0) onNext();
            else onPrevious();
        },
        onPointerCancel() {
            start.current = null;
        },
    };
}
