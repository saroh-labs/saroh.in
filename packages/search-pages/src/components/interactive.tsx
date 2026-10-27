"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

/**
 * The phone's moving parts: the labelled carousel of small jobs, "See all"
 * under Also in Saroh, and the Start free bar that rises once the hero's
 * own button has scrolled away. On a desk none of it shows or moves.
 */

export function Carousel({
    labels,
    children,
}: {
    labels: string[];
    children: ReactNode;
}) {
    const track = useRef<HTMLDivElement>(null);
    const labs = useRef<HTMLDivElement>(null);
    const [at, setAt] = useState(0);
    const go = (k: number) => {
        const t = track.current;
        const card = t?.children[k] as HTMLElement | undefined;
        const first = t?.children[0] as HTMLElement | undefined;
        if (!t || !card || !first) return;
        t.scrollTo({
            left: card.offsetLeft - first.offsetLeft,
            behavior: "smooth",
        });
        setAt(k);
    };
    const onScroll = () => {
        const t = track.current;
        const [a, b] = t
            ? [
                  t.children[0] as HTMLElement | undefined,
                  t.children[1] as HTMLElement | undefined,
              ]
            : [];
        if (!t || !a || !b) return;
        const k = Math.min(
            t.children.length - 1,
            Math.round(t.scrollLeft / (b.offsetLeft - a.offsetLeft)),
        );
        if (k === at) return;
        setAt(k);
        const l = labs.current;
        const lab = l?.children[k] as HTMLElement | undefined;
        const lab0 = l?.children[0] as HTMLElement | undefined;
        if (l && lab && lab0)
            l.scrollTo({
                left: lab.offsetLeft - lab0.offsetLeft,
                behavior: "smooth",
            });
    };
    return (
        <>
            <div
                ref={labs}
                className="sp-labs"
                role="group"
                aria-label="Jump to"
            >
                {labels.map((l, i) => (
                    <button
                        key={l}
                        type="button"
                        className="sp-lab"
                        aria-pressed={i === at}
                        onClick={() => go(i)}
                    >
                        {l}
                    </button>
                ))}
            </div>
            <div ref={track} className="sp-track" onScroll={onScroll}>
                {children}
            </div>
        </>
    );
}

export function AlsoList({
    children,
    count,
}: {
    children: ReactNode;
    count: number;
}) {
    const [all, setAll] = useState(false);
    return (
        <>
            <ul id="sp-also-list" data-all={all ? "" : undefined}>
                {children}
            </ul>
            <button
                type="button"
                className="sp-more sp-p"
                aria-expanded={all}
                aria-controls="sp-also-list"
                onClick={() => setAll(!all)}
            >
                {all ? "Show fewer" : `See all ${count}`}
            </button>
        </>
    );
}

export function StartBar({ children }: { children: ReactNode }) {
    const [on, setOn] = useState(false);
    useEffect(() => {
        const check = () => {
            const d = document.documentElement;
            setOn(
                window.scrollY > 560 ||
                    d.scrollHeight <= window.innerHeight + 80,
            );
        };
        window.addEventListener("scroll", check, { passive: true });
        check();
        return () => window.removeEventListener("scroll", check);
    }, []);
    return (
        <div className="sp-bar" data-on={on ? "" : undefined} inert={!on}>
            {children}
        </div>
    );
}
