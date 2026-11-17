"use client";

import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";

import { useBrowserValue } from "../../use-browser-value";

/** Reduced motion: nothing plays by itself. */
export const reducedMotion = () =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Website's two Ink sections play by themselves (owner, 16 Nov 2026, an
 * exception to the hands-on rule): `tick` runs every `every` ms while
 * `ref` is at least 40% in view and the tab is shown. `canPlay` is false
 * under reduced motion or without IntersectionObserver, where nothing
 * plays. `stop()` ends it for good: the visitor's first move hands the
 * section to them.
 */
export function useAutoplay(
    ref: RefObject<HTMLElement | null>,
    tick: () => void,
    every: number,
) {
    // The server, and the first paint, play nothing.
    const canPlay = useBrowserValue(
        () => !reducedMotion() && typeof IntersectionObserver !== "undefined",
        false,
    );
    const [stopped, setStopped] = useState(false);
    const [seen, setSeen] = useState(false);
    const [shown, setShown] = useState(true);
    const latest = useRef(tick);
    useEffect(() => {
        latest.current = tick;
    });

    useEffect(() => {
        const el = ref.current;
        if (!canPlay || stopped || !el) return;
        // shortcut: 40% of the section; a section taller than 2.5 screens would never play, none is.
        const io = new IntersectionObserver(
            (entries) =>
                setSeen(entries.some((e) => e.intersectionRatio >= 0.4)),
            { threshold: 0.4 },
        );
        io.observe(el);
        const vis = () => setShown(!document.hidden);
        document.addEventListener("visibilitychange", vis);
        return () => {
            io.disconnect();
            document.removeEventListener("visibilitychange", vis);
        };
    }, [canPlay, stopped, ref]);

    useEffect(() => {
        if (!canPlay || stopped || !seen || !shown) return;
        const t = setInterval(() => latest.current(), every);
        return () => clearInterval(t);
    }, [canPlay, stopped, seen, shown, every]);

    return { canPlay, stop: () => setStopped(true) };
}
