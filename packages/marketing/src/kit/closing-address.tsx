"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useRef, useState } from "react";

import { cn } from "../cn";
import { ring } from "../ring";
import type { SiteLook } from "./site-drawing";

/** One demo business the closing band's address types: its name, slug and look. */
export interface ClosingName {
    name: string;
    /** "rye-and-co", the part before `.saroh.app`. */
    slug: string;
    look: SiteLook;
}

const Names = createContext<readonly ClosingName[]>([]);

/**
 * Each site's demo businesses, set once in its layout (from its world), so
 * every `ClosingCTA` types them without a page passing anything.
 */
export function ClosingNamesProvider({
    names,
    children,
}: {
    names: readonly ClosingName[];
    children: ReactNode;
}) {
    return <Names.Provider value={names}>{children}</Names.Provider>;
}

const TICK = 90;
/** 1.6s at 90ms a tick. */
const HOLD = 18;

/**
 * The K band's visual (owner, 16 Nov 2026, #46): the address set huge,
 * typing each demo business's slug, holding, deleting, typing the next, and
 * a chip per business in its own colours that jumps the address to it. The
 * server's HTML (and reduced motion) shows the first address whole and
 * still, with no caret. The typing is hidden from screen readers; they read
 * the current address once, with no live region.
 */
export function ClosingAddress({
    note = "The address types each name in turn.",
}: {
    note?: ReactNode;
}) {
    const names = useContext(Names);
    const [k, setK] = useState(0);
    const [len, setLen] = useState(names.length ? names[0].slug.length : 0);
    const [moving, setMoving] = useState(false);
    const at = useRef({ k: 0, len, del: false, hold: 0 });

    useEffect(() => {
        if (names.length < 2) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
            return;
        const timer = setInterval(() => {
            // The caret shows once the typing runs, never in the server's HTML.
            setMoving(true);
            const s = at.current;
            if (s.hold > 0) {
                s.hold -= 1;
                return;
            }
            const full = names[s.k]?.slug.length ?? 0;
            if (!s.del) {
                if (s.len < full) s.len += 1;
                else {
                    s.del = true;
                    s.hold = HOLD;
                }
            } else if (s.len > 0) s.len -= 1;
            else {
                s.del = false;
                s.k = (s.k + 1) % names.length;
            }
            setK(s.k);
            setLen(s.len);
        }, TICK);
        return () => clearInterval(timer);
    }, [names]);

    if (names.length === 0) return null;
    const current = names[k];

    const pick = (i: number) => {
        const full = names[i]?.slug.length ?? 0;
        at.current = { k: i, len: full, del: false, hold: HOLD };
        setK(i);
        setLen(full);
    };

    return (
        <div className="grid gap-5 min-[760px]:gap-7">
            <p className="m-0 font-display text-mk-kit-address font-bold">
                <span className="sr-only">
                    {current.slug}.saroh.app, one of the businesses on Saroh
                </span>
                <span aria-hidden data-address="">
                    <span className="block whitespace-nowrap min-[1280px]:inline">
                        <span className="text-background">
                            {current.slug.slice(0, len)}
                        </span>
                        {moving ? (
                            <span className="ml-[0.04em] inline-block h-[0.8em] w-[0.05em] animate-[mk-caret_1s_steps(1)_infinite] bg-brand-500 align-[-0.05em]" />
                        ) : null}
                    </span>
                    <span className="block text-mk-on-ink-line min-[1280px]:inline">
                        .saroh.app
                    </span>
                </span>
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
                {names.map((n, i) => (
                    <button
                        key={n.slug}
                        type="button"
                        aria-pressed={i === k}
                        onClick={() => pick(i)}
                        style={{
                            background: `hsl(${n.look.bg})`,
                            color: `hsl(${n.look.fg})`,
                            fontFamily: n.look.fontHeading,
                            fontWeight: n.look.headingWeight,
                            borderRadius: n.look.radius,
                        }}
                        className={cn(
                            "min-h-11 cursor-pointer border-0 px-4 py-2.5 text-base",
                            i === k
                                ? "ring-2 ring-brand-500"
                                : "ring-1 ring-background/15",
                            ring({ offset: 3, color: "paper" }),
                        )}
                    >
                        {n.name}
                    </button>
                ))}
                <span className="text-sm text-mk-on-ink-muted">{note}</span>
            </div>
        </div>
    );
}
