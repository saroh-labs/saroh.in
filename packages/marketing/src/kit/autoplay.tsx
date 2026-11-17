"use client";

import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";

/**
 * The closing bands' clock (#46): calls `tick` every `ms` while it runs,
 * never under reduced motion and never while the tab is hidden. With
 * `watch`, only while that element is at least 40% in view (no observer, as
 * in a test's DOM: never). `stopped` ends it, as a visitor's pick does.
 */
export function useAutoplay(
    tick: () => void,
    ms: number,
    {
        stopped = false,
        watch,
    }: { stopped?: boolean; watch?: RefObject<Element | null> } = {},
) {
    const step = useRef(tick);
    useEffect(() => {
        step.current = tick;
    });
    const [seen, setSeen] = useState(!watch);

    useEffect(() => {
        const el = watch?.current;
        if (!el || typeof IntersectionObserver === "undefined") return;
        const io = new IntersectionObserver(
            ([e]) => setSeen(e.intersectionRatio >= 0.4),
            { threshold: [0, 0.4] },
        );
        io.observe(el);
        return () => io.disconnect();
    }, [watch]);

    useEffect(() => {
        if (stopped || !seen) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
            return;
        const timer = setInterval(() => {
            if (document.visibilityState !== "hidden") step.current();
        }, ms);
        return () => clearInterval(timer);
    }, [stopped, seen, ms]);
}

/** The typing caret: a Saffron bar, blinking. Drawn only while typing runs. */
export function Caret() {
    return (
        <span className="ml-[0.04em] inline-block h-[0.8em] w-[0.05em] animate-[mk-caret_1s_steps(1)_infinite] bg-brand-500 align-[-0.05em]" />
    );
}
