"use client";

import * as React from "react";

/** Remembers, per browser, that the "for more →" hint has been shown once. */
export const SCROLL_HINT_KEY = "saroh-scroll-x-hint-seen";
/** How far in from an edge the content fades out, in px. */
const FADE = 28;

/** Set once the hint has been shown in this page's life, storage or not. */
let hintShown = false;

/**
 * Which edges hide content, from the scroller's own measurements. A pixel of
 * slack either way, because zoomed layouts land on fractions.
 */
export function overflowEdges(el: {
    scrollLeft: number;
    scrollWidth: number;
    clientWidth: number;
}): { left: boolean; right: boolean } {
    const over = el.scrollWidth - el.clientWidth;
    if (over <= 1) return { left: false, right: false };
    // `scrollLeft` is negative in a right-to-left scroller; the distance
    // travelled is what matters.
    const at = Math.abs(el.scrollLeft);
    return { left: at > 1, right: at < over - 1 };
}

/**
 * The content fades out on each edge that has more beyond it. A mask, not a
 * gradient drawn over the top: a mask needs no colour, so it is right on a
 * card, the page and every skin and theme without being told which.
 */
export function edgeMask(edges: { left: boolean; right: boolean }) {
    if (!edges.left && !edges.right) return undefined;
    const l = edges.left ? FADE : 0;
    const r = edges.right ? FADE : 0;
    return `linear-gradient(to right, ${edges.left ? "transparent" : "#000"}, #000 ${l}px, #000 calc(100% - ${r}px), ${edges.right ? "transparent" : "#000"})`;
}

function claimHint(): boolean {
    if (hintShown) return false;
    try {
        if (window.localStorage.getItem(SCROLL_HINT_KEY)) {
            hintShown = true;
            return false;
        }
        window.localStorage.setItem(SCROLL_HINT_KEY, "1");
    } catch {
        // Blocked storage: show it once for this page's life instead.
    }
    hintShown = true;
    return true;
}

export interface ScrollXProps extends React.HTMLAttributes<HTMLDivElement> {
    /** What scrolls, for a screen reader's landmark ("Audit events"). */
    label: string;
    /**
     * Classes for the scrolling box: its border, radius and fill. The hint
     * sits outside it, under the frame.
     */
    className?: string;
}

/**
 * Content that may be wider than its box, and says so (Phone Tables audit
 * T9).
 *
 * A bare `overflow-x-auto` hides whatever does not fit and gives no sign that
 * there is any: on a phone, with no scrollbar drawn, the right-hand columns
 * simply are not there. This keeps the scroll and adds the signifiers, both
 * only while the content really overflows:
 *
 * - the content fades out on the side that has more, and the fade moves as
 *   the merchant scrolls;
 * - once per browser, a quiet "Swipe for more →" under it, gone at the first
 *   scroll.
 *
 * It is a labelled region, and focusable while it overflows, so a keyboard
 * can scroll it with the arrow keys. The scrolling element carries
 * `data-scroll-x`: the e2e check for content hidden sideways
 * (`e2e/fixtures/hidden-sideways.ts`) takes it as a scroller that meant to
 * scroll.
 *
 * Reach for it only where a sideways scroll is the right answer (the admin
 * console's wide ledgers). A merchant's screen on a phone turns rows into
 * cards instead.
 */
export function ScrollX({
    label,
    className,
    children,
    ...props
}: ScrollXProps) {
    const ref = React.useRef<HTMLDivElement>(null);
    const [edges, setEdges] = React.useState({ left: false, right: false });
    const [hint, setHint] = React.useState(false);

    React.useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const measure = () => {
            const next = overflowEdges(el);
            setEdges((prev) =>
                prev.left === next.left && prev.right === next.right
                    ? prev
                    : next,
            );
            const overflowing = next.left || next.right;
            // Gone at the first scroll, or when it fits again.
            if (!overflowing || el.scrollLeft !== 0) setHint(false);
            else if (next.right && claimHint()) setHint(true);
        };
        // The observer fires once on observe, which is the first measure.
        const ro =
            typeof ResizeObserver === "undefined"
                ? null
                : new ResizeObserver(measure);
        ro?.observe(el);
        // The content can widen without the box changing size.
        if (el.firstElementChild) ro?.observe(el.firstElementChild);
        el.addEventListener("scroll", measure, { passive: true });
        return () => {
            ro?.disconnect();
            el.removeEventListener("scroll", measure);
        };
    }, []);

    const overflowing = edges.left || edges.right;
    const mask = edgeMask(edges);

    return (
        <div {...props}>
            {/* The frame carries the border and fill; the scroller inside it
                carries the fade, so the frame's own edges never fade. */}
            <div className={className}>
                <div
                    ref={ref}
                    role="region"
                    aria-label={label}
                    data-scroll-x=""
                    tabIndex={overflowing ? 0 : undefined}
                    style={
                        mask
                            ? { maskImage: mask, WebkitMaskImage: mask }
                            : undefined
                    }
                    className="overflow-x-auto rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                    {children}
                </div>
            </div>
            {hint ? (
                // Words for the eye only: the region's name and its focus
                // stop already tell a screen reader there is more.
                <p
                    aria-hidden
                    data-scroll-x-hint=""
                    className="pointer-events-none mt-1.5 text-right text-xs text-muted-foreground"
                >
                    <span className="hidden coarse:inline">Swipe</span>
                    <span className="coarse:hidden">Scroll</span> for more →
                </p>
            ) : null}
        </div>
    );
}

/** Test-only: forget that the hint was shown in this module's life. */
export function resetScrollHintForTests() {
    hintShown = false;
}
